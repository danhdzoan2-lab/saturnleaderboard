const CHAIN_ID = 1;
const SATURN_POINT_TOKEN = "0xD223bbdd0421E394C0df9dFfe568f1dADfFd6f85";
const EXCLUDED_ADDRESS = "0x80c6a512b548229226c0676d6fdbaff81d325990";
const LEADERBOARD_PAGE_SIZE = 1000;
const SNAPSHOT_START_DATE_UTC = "2026-06-01";
const SNAPSHOT_HOUR_UTC = 0;
const SNAPSHOT_MINUTE_UTC = 30;
const SNAPSHOT_LIMIT = 60;
const SNAPSHOT_DATES_KEY = "saturn:leaderboard:snapshot-dates";
const SNAPSHOT_KEY_PREFIX = "saturn:leaderboard:snapshot:";

const urls = {
  leaderboard: `https://api.merkl.xyz/v4/rewards/token/?chainId=${CHAIN_ID}&address=${SATURN_POINT_TOKEN}&items=${LEADERBOARD_PAGE_SIZE}`,
  total: `https://api.merkl.xyz/v4/rewards/token/total?chainId=${CHAIN_ID}&address=${SATURN_POINT_TOKEN}`,
  recipient: (address) =>
    `https://api.merkl.xyz/v4/rewards/token/?chainId=${CHAIN_ID}&address=${SATURN_POINT_TOKEN}&recipient=${address}`,
};

function getRedisConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
  };
}

function hasRedisConfig() {
  const config = getRedisConfig();
  return Boolean(config.url && config.token);
}

async function redisCommand(command) {
  const config = getRedisConfig();

  if (!config.url || !config.token) {
    throw new Error("Upstash Redis is not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Redis command failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function redisGetJson(key, fallback = null) {
  const value = await redisCommand(["GET", key]);
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function redisSetJson(key, value) {
  await redisCommand(["SET", key, JSON.stringify(value)]);
}

function unitsToNumber(rawValue) {
  let value = typeof rawValue === "bigint" ? rawValue : BigInt(rawValue || 0);
  const negative = value < 0n;
  if (negative) value = -value;

  const scale = 10n ** 18n;
  const whole = value / scale;
  const fraction = String(value % scale).padStart(18, "0").slice(0, 6);
  const number = Number(`${whole}.${fraction}`);

  return negative ? -number : number;
}

function rowPoints(row) {
  return unitsToNumber(BigInt(row.amount || 0) + BigInt(row.pending || 0));
}

function totalAmount(row) {
  return BigInt(row?.amount || 0);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  }
  return response.json();
}

function parseLeaderboard(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row) => row.recipient && row.recipient.toLowerCase() !== EXCLUDED_ADDRESS)
    .map((row) => ({
      address: row.recipient,
      points: rowPoints(row),
    }))
    .sort((a, b) => b.points - a.points)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

async function fetchLeaderboardRows() {
  const rows = await fetchJson(urls.leaderboard);

  return parseLeaderboard(rows).map((row) => ({
    address: row.address.toLowerCase(),
    rank: row.rank,
    points: row.points,
  }));
}

async function fetchDistributedPoints() {
  const [totalRow, excludedRows] = await Promise.all([
    fetchJson(urls.total),
    fetchJson(urls.recipient(EXCLUDED_ADDRESS)),
  ]);
  const excludedAmount = Array.isArray(excludedRows) && excludedRows[0] ? totalAmount(excludedRows[0]) : 0n;

  return unitsToNumber(totalAmount(totalRow) - excludedAmount);
}

function getUtcDateKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSnapshotDateKey(now = new Date()) {
  return getUtcDateKey(now);
}

function isSnapshotWindowOpen(now = new Date()) {
  const cutoff = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    SNAPSHOT_HOUR_UTC,
    SNAPSHOT_MINUTE_UTC,
    0,
    0,
  );

  return now.getTime() >= cutoff;
}

async function getSnapshotDates() {
  const dates = await redisGetJson(SNAPSHOT_DATES_KEY, []);
  return Array.isArray(dates) ? dates.filter((date) => typeof date === "string").sort() : [];
}

async function saveSnapshotDates(dates) {
  const normalized = [...new Set(dates)].sort().slice(-SNAPSHOT_LIMIT);
  await redisSetJson(SNAPSHOT_DATES_KEY, normalized);
  return normalized;
}

async function getSnapshot(date) {
  if (!hasRedisConfig()) return null;
  return redisGetJson(`${SNAPSHOT_KEY_PREFIX}${date}`, null);
}

async function getLatestSnapshot() {
  if (!hasRedisConfig()) {
    return { available: false, reason: "Database not configured" };
  }

  const dates = await getSnapshotDates();
  const latestDate = dates.at(-1);

  if (!latestDate) {
    return { available: false, reason: "No snapshots captured yet", dates: [] };
  }

  const snapshot = await getSnapshot(latestDate);
  if (!snapshot) {
    return { available: false, reason: "Latest snapshot missing", dates };
  }

  return { available: true, dates, snapshot };
}

async function getSnapshotHistory() {
  if (!hasRedisConfig()) {
    return { available: false, reason: "Database not configured", snapshots: [] };
  }

  const dates = await getSnapshotDates();
  if (dates.length === 0) {
    return { available: false, reason: "No snapshots captured yet", dates: [], snapshots: [] };
  }

  const snapshots = (await Promise.all(dates.map((date) => getSnapshot(date))))
    .filter((snapshot) => snapshot && typeof snapshot.date === "string")
    .sort((a, b) => a.date.localeCompare(b.date));

  return { available: snapshots.length > 0, dates, snapshots };
}

async function buildCurrentSnapshot(now = new Date()) {
  const snapshotDate = getSnapshotDateKey(now);
  const [rows, distributedPoints] = await Promise.all([
    fetchLeaderboardRows(),
    fetchDistributedPoints(),
  ]);

  return {
    date: snapshotDate,
    capturedAt: now.toISOString(),
    cutoffUtc: `${snapshotDate}T${String(SNAPSHOT_HOUR_UTC).padStart(2, "0")}:${String(SNAPSHOT_MINUTE_UTC).padStart(2, "0")}:00.000Z`,
    distributedPoints,
    rowCount: rows.length,
    rows,
  };
}

async function captureDailySnapshot(now = new Date()) {
  if (!hasRedisConfig()) {
    return { ok: false, skipped: true, reason: "Database not configured" };
  }

  const snapshotDate = getSnapshotDateKey(now);

  if (snapshotDate < SNAPSHOT_START_DATE_UTC) {
    return {
      ok: true,
      skipped: true,
      reason: `Snapshots start on ${SNAPSHOT_START_DATE_UTC} UTC`,
      snapshotDate,
    };
  }

  if (!isSnapshotWindowOpen(now)) {
    return {
      ok: true,
      skipped: true,
      reason: `Snapshot window opens at ${String(SNAPSHOT_HOUR_UTC).padStart(2, "0")}:${String(SNAPSHOT_MINUTE_UTC).padStart(2, "0")} UTC`,
      snapshotDate,
    };
  }

  const existing = await getSnapshot(snapshotDate);
  if (existing) {
    return { ok: true, skipped: true, reason: "Snapshot already captured", snapshot: existing };
  }

  const snapshot = await buildCurrentSnapshot(now);

  await redisSetJson(`${SNAPSHOT_KEY_PREFIX}${snapshotDate}`, snapshot);
  const dates = await getSnapshotDates();
  await saveSnapshotDates([...dates, snapshotDate]);

  return { ok: true, skipped: false, snapshot };
}

module.exports = {
  SNAPSHOT_START_DATE_UTC,
  SNAPSHOT_HOUR_UTC,
  SNAPSHOT_MINUTE_UTC,
  buildCurrentSnapshot,
  captureDailySnapshot,
  getLatestSnapshot,
  getSnapshotHistory,
  hasRedisConfig,
};
