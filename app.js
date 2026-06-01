const CHAIN_ID = 1;
const SATURN_POINT_TOKEN = "0xD223bbdd0421E394C0df9dFfe568f1dADfFd6f85";
const SATURN_POINT_TOKEN_LOWER = SATURN_POINT_TOKEN.toLowerCase();
const EXCLUDED_ADDRESSES = new Set(["0x80c6a512b548229226c0676d6fdbaff81d325990"]);
const LEADERBOARD_PAGE_SIZE = 1000;
const DAILY_HISTORY_KEY = "saturn:daily-distribution:v1";
const DAILY_HISTORY_LIMIT = 120;
const LEADERBOARD_SNAPSHOT_KEY = "saturn:leaderboard-snapshots:v1";
const LEADERBOARD_SNAPSHOT_LIMIT = 45;
const LEADERBOARD_SNAPSHOT_START_DATE_UTC = "2026-06-01";
const LEADERBOARD_SNAPSHOT_HOUR_UTC = 0;
const LEADERBOARD_SNAPSHOT_MINUTE_UTC = 30;
const STATIC_SNAPSHOT_CACHE_VERSION = "20260601-0030";

const urls = {
  leaderboard: `https://api.merkl.xyz/v4/rewards/token/?chainId=${CHAIN_ID}&address=${SATURN_POINT_TOKEN}&items=${LEADERBOARD_PAGE_SIZE}`,
  total: `https://api.merkl.xyz/v4/rewards/token/total?chainId=${CHAIN_ID}&address=${SATURN_POINT_TOKEN}`,
  recipient: (address) =>
    `https://api.merkl.xyz/v4/rewards/token/?chainId=${CHAIN_ID}&address=${SATURN_POINT_TOKEN}&recipient=${address}`,
  userRewards: (address) => `https://api.merkl.xyz/v4/users/${address}/rewards?chainId=${CHAIN_ID}`,
};

const formatNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const formatPoints = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const formatCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const state = {
  activeRange: "10",
  activeChartMode: "leaderboard",
  leaderboard: [],
  pointsDistributed: null,
  dailyHistory: [],
  backendDailyHistory: [],
  backendDailyStatus: "",
  backendMovementStatus: "",
  staticSnapshotHistory: [],
  staticSnapshotStatus: "",
  leaderboardSnapshots: loadLeaderboardSnapshots(),
  movementRanks: new Map(),
  movementSnapshotDate: null,
  trackedWallet: "",
  trackedPoints: 0,
  trackedRank: null,
  lastUpdated: null,
};

const elements = {
  refreshData: document.querySelector("#refreshData"),
  walletLookupForm: document.querySelector("#walletLookupForm"),
  walletInput: document.querySelector("#walletInput"),
  walletStatusTitle: document.querySelector("#walletStatusTitle"),
  walletStatusText: document.querySelector("#walletStatusText"),
  walletAddress: document.querySelector("#walletAddress"),
  tvlMetric: document.querySelector("#tvlMetric"),
  rankMetric: document.querySelector("#rankMetric"),
  rankCaption: document.querySelector("#rankCaption"),
  pointsDistributed: document.querySelector("#pointsDistributed"),
  pointsUpdated: document.querySelector("#pointsUpdated"),
  pointsTotalLabel: document.querySelector("#pointsTotalLabel"),
  pointsTotal: document.querySelector("#pointsTotal"),
  chartRangeMetricLabel: document.querySelector("#chartRangeMetricLabel"),
  chartRangeLabel: document.querySelector("#chartRangeLabel"),
  chartAverageMetricLabel: document.querySelector("#chartAverageMetricLabel"),
  chartAverage: document.querySelector("#chartAverage"),
  chartCutoffMetricLabel: document.querySelector("#chartCutoffMetricLabel"),
  chartCutoff: document.querySelector("#chartCutoff"),
  dailyDistributed: document.querySelector("#dailyDistributed"),
  dailyDistributedMetric: document.querySelector("#dailyDistributedMetric"),
  dailyDistributedCaption: document.querySelector("#dailyDistributedCaption"),
  previousDailyDistributed: document.querySelector("#previousDailyDistributed"),
  dailyAverage: document.querySelector("#dailyAverage"),
  trackedDays: document.querySelector("#trackedDays"),
  chartLowLabel: document.querySelector("#chartLowLabel"),
  chartHighLabel: document.querySelector("#chartHighLabel"),
  headerPoints: document.querySelector("#headerPoints"),
  miniStatOneLabel: document.querySelector("#miniStatOneLabel"),
  epochPace: document.querySelector("#epochPace"),
  miniStatTwoLabel: document.querySelector("#miniStatTwoLabel"),
  multiplier: document.querySelector("#multiplier"),
  miniStatThreeLabel: document.querySelector("#miniStatThreeLabel"),
  nextRank: document.querySelector("#nextRank"),
  syncStatusText: document.querySelector("#syncStatusText"),
  chartTitle: document.querySelector("#chartTitle"),
  chartDesc: document.querySelector("#chartDesc"),
  chartLine: document.querySelector("#chartLine"),
  chartArea: document.querySelector("#chartArea"),
  chartDots: document.querySelector("#chartDots"),
  leaderboardRows: document.querySelector("#leaderboardRows"),
  walletSearch: document.querySelector("#walletSearch"),
};

function isWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function formatAddress(address) {
  if (!address) return "No wallet selected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function debankUrl(address) {
  return `https://debank.com/profile/${address}`;
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  return fallbackCopy(text);
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

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUtcDateKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUtcSnapshotCutoff(date = new Date()) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      LEADERBOARD_SNAPSHOT_HOUR_UTC,
      LEADERBOARD_SNAPSHOT_MINUTE_UTC,
      0,
      0,
    ),
  );
}

function getEligibleSnapshotDateKey(now = new Date()) {
  const cutoff = getUtcSnapshotCutoff(now);
  const snapshotDate = now >= cutoff ? now : new Date(cutoff.getTime() - 24 * 60 * 60 * 1000);
  const snapshotKey = getUtcDateKey(snapshotDate);

  return snapshotKey >= LEADERBOARD_SNAPSHOT_START_DATE_UTC ? snapshotKey : null;
}

function loadLeaderboardSnapshots() {
  try {
    const snapshots = JSON.parse(localStorage.getItem(LEADERBOARD_SNAPSHOT_KEY) || "[]");
    if (!Array.isArray(snapshots)) return [];

    return snapshots
      .filter((snapshot) => {
        return (
          typeof snapshot.date === "string" &&
          Array.isArray(snapshot.rows) &&
          snapshot.rows.every(
            (row) =>
              typeof row.address === "string" &&
              Number.isFinite(row.rank) &&
              Number.isFinite(row.points),
          )
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-LEADERBOARD_SNAPSHOT_LIMIT);
  } catch {
    return [];
  }
}

function saveLeaderboardSnapshots(snapshots) {
  localStorage.setItem(
    LEADERBOARD_SNAPSHOT_KEY,
    JSON.stringify(snapshots.sort((a, b) => a.date.localeCompare(b.date)).slice(-LEADERBOARD_SNAPSHOT_LIMIT)),
  );
}

function recordLeaderboardSnapshot(leaderboard, now = new Date()) {
  const snapshotKey = getEligibleSnapshotDateKey(now);
  if (!snapshotKey || leaderboard.length === 0) return;

  const exists = state.leaderboardSnapshots.some((snapshot) => snapshot.date === snapshotKey);
  if (exists) return;

  state.leaderboardSnapshots = [
    ...state.leaderboardSnapshots,
    {
      date: snapshotKey,
      capturedAt: now.toISOString(),
      cutoffUtc: `${snapshotKey}T${String(LEADERBOARD_SNAPSHOT_HOUR_UTC).padStart(2, "0")}:${String(LEADERBOARD_SNAPSHOT_MINUTE_UTC).padStart(2, "0")}:00.000Z`,
      rows: leaderboard.map((row) => ({
        address: row.address.toLowerCase(),
        rank: row.rank,
        points: row.points,
      })),
    },
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-LEADERBOARD_SNAPSHOT_LIMIT);

  saveLeaderboardSnapshots(state.leaderboardSnapshots);
}

function updateMovementRanks(now = new Date()) {
  const snapshotKey = getEligibleSnapshotDateKey(now);
  const previousSnapshot = [...state.staticSnapshotHistory, ...state.leaderboardSnapshots]
    .filter((snapshot) => (snapshotKey ? snapshot.date < snapshotKey : true))
    .filter((snapshot) => Array.isArray(snapshot.rows))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);

  state.movementSnapshotDate = previousSnapshot?.date ?? null;
  state.movementRanks = new Map(
    previousSnapshot?.rows.map((row) => [row.address.toLowerCase(), row.rank]) ?? [],
  );
}

async function loadStaticSnapshotHistory() {
  try {
    const indexResponse = await fetch(`/snapshots/index.json?v=${STATIC_SNAPSHOT_CACHE_VERSION}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!indexResponse.ok) {
      state.staticSnapshotHistory = [];
      state.staticSnapshotStatus = "No static snapshot baseline";
      return false;
    }

    const index = await indexResponse.json();
    const dates = Array.isArray(index.dates)
      ? index.dates.filter((date) => typeof date === "string")
      : [];

    const snapshots = await Promise.all(
      dates.map(async (date) => {
        try {
          const response = await fetch(`/snapshots/${date}.json?v=${STATIC_SNAPSHOT_CACHE_VERSION}`, {
            headers: { accept: "application/json" },
            cache: "no-store",
          });
          return response.ok ? response.json() : null;
        } catch {
          return null;
        }
      }),
    );

    state.staticSnapshotHistory = snapshots
      .filter((snapshot) => {
        return (
          snapshot &&
          typeof snapshot.date === "string" &&
          Number.isFinite(snapshot.distributedPoints) &&
          Array.isArray(snapshot.rows) &&
          snapshot.rows.every(
            (row) =>
              typeof row.address === "string" &&
              Number.isFinite(row.rank) &&
              Number.isFinite(row.points),
          )
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    state.staticSnapshotStatus = state.staticSnapshotHistory.length ? "" : "No static snapshot baseline";
    return state.staticSnapshotHistory.length > 0;
  } catch {
    state.staticSnapshotHistory = [];
    state.staticSnapshotStatus = "Static snapshots unavailable";
    return false;
  }
}

function loadDailyHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(DAILY_HISTORY_KEY) || "[]");
    if (!Array.isArray(rows)) return [];

    return rows
      .filter((row) => row.date && Number.isFinite(row.firstTotal) && Number.isFinite(row.lastTotal))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-DAILY_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function saveDailyHistory(rows) {
  localStorage.setItem(DAILY_HISTORY_KEY, JSON.stringify(rows.slice(-DAILY_HISTORY_LIMIT)));
}

function recordDailyDistribution(total, now = new Date()) {
  if (!Number.isFinite(total)) return;

  const date = getLocalDateKey(now);
  const rows = loadDailyHistory();
  const existing = rows.find((row) => row.date === date);

  if (existing) {
    existing.lastTotal = total;
    existing.updatedAt = now.toISOString();
  } else {
    rows.push({
      date,
      firstTotal: total,
      lastTotal: total,
      updatedAt: now.toISOString(),
    });
  }

  state.dailyHistory = rows.sort((a, b) => a.date.localeCompare(b.date)).slice(-DAILY_HISTORY_LIMIT);
  saveDailyHistory(state.dailyHistory);
}

function getLocalDailyStats() {
  const rows = state.dailyHistory;
  const today = getLocalDateKey();
  const todayIndex = rows.findIndex((row) => row.date === today);
  const todayRow = todayIndex >= 0 ? rows[todayIndex] : null;
  const previousRow = todayIndex > 0 ? rows[todayIndex - 1] : rows.at(-2);
  const previousPreviousRow = todayIndex > 1 ? rows[todayIndex - 2] : rows.at(-3);
  const todayDelta = todayRow
    ? Math.max(0, todayRow.lastTotal - (previousRow?.lastTotal ?? todayRow.firstTotal))
    : null;
  const previousDelta =
    previousRow && previousPreviousRow ? Math.max(0, previousRow.lastTotal - previousPreviousRow.lastTotal) : null;
  const deltas = [];

  for (let index = 1; index < rows.length; index += 1) {
    deltas.push(Math.max(0, rows[index].lastTotal - rows[index - 1].lastTotal));
  }

  if (todayDelta != null && previousRow) {
    deltas.push(todayDelta);
  }

  const recentDeltas = deltas.slice(-7);
  const average =
    recentDeltas.length > 0 ? recentDeltas.reduce((sum, value) => sum + value, 0) / recentDeltas.length : null;

  return {
    todayDelta,
    previousDelta,
    average,
    trackedDays: rows.length,
    caption: rows.length < 2 ? "Collecting local baseline" : "Today from local snapshots",
    pendingLabel: "Tracking",
    source: "local",
  };
}

function getBackendDailyStats() {
  const rows = state.backendDailyHistory;
  const deltas = [];

  for (let index = 1; index < rows.length; index += 1) {
    deltas.push({
      date: rows[index].date,
      value: Math.max(0, rows[index].distributedPoints - rows[index - 1].distributedPoints),
    });
  }

  const recentDeltas = deltas.slice(-7);
  const average =
    recentDeltas.length > 0
      ? recentDeltas.reduce((sum, row) => sum + row.value, 0) / recentDeltas.length
      : null;

  return {
    todayDelta: deltas.at(-1)?.value ?? null,
    previousDelta: deltas.at(-2)?.value ?? null,
    average,
    trackedDays: rows.length,
    caption: rows.length < 2 ? "Need 2 backend snapshots" : `Last UTC snapshot ${rows.at(-1).date}`,
    pendingLabel: "Need 2 days",
    source: "backend",
  };
}

function getStaticDailyStats() {
  const rows = state.staticSnapshotHistory;
  const snapshotKey = getEligibleSnapshotDateKey();
  const currentSnapshot = rows.find((snapshot) => snapshot.date === snapshotKey);
  const previousSnapshot = rows
    .filter((snapshot) => (snapshotKey ? snapshot.date < snapshotKey : true))
    .at(-1);
  const deltas = [];

  for (let index = 1; index < rows.length; index += 1) {
    deltas.push(Math.max(0, rows[index].distributedPoints - rows[index - 1].distributedPoints));
  }

  const liveDelta =
    !currentSnapshot && previousSnapshot && Number.isFinite(state.pointsDistributed)
      ? Math.max(0, state.pointsDistributed - previousSnapshot.distributedPoints)
      : null;
  const todayDelta = currentSnapshot ? deltas.at(-1) ?? null : liveDelta;
  const allDeltas = liveDelta != null ? [...deltas, liveDelta] : deltas;

  const recentDeltas = allDeltas.slice(-7);
  const average =
    recentDeltas.length > 0 ? recentDeltas.reduce((sum, value) => sum + value, 0) / recentDeltas.length : null;

  return {
    todayDelta,
    previousDelta: allDeltas.length > 1 ? allDeltas.at(-2) : null,
    average,
    trackedDays: rows.length + (liveDelta != null ? 1 : 0),
    caption: currentSnapshot
      ? `Last UTC snapshot ${currentSnapshot.date}`
      : previousSnapshot
        ? `Since UTC snapshot ${previousSnapshot.date}`
        : "Static baseline ready",
    pendingLabel: previousSnapshot ? "Tracking" : "Ready tomorrow",
    source: "static",
  };
}

function getDailyStats() {
  if (state.backendDailyHistory.length > 0) return getBackendDailyStats();
  if (state.staticSnapshotHistory.length > 0) return getStaticDailyStats();

  if (state.backendDailyStatus) {
    return {
      todayDelta: null,
      previousDelta: null,
      average: null,
      trackedDays: 0,
      caption: state.backendDailyStatus,
      pendingLabel: "Setup needed",
      source: "backend-missing",
    };
  }

  return getLocalDailyStats();
}

function getRangeStats() {
  const span = Number(state.activeRange);
  const rows = state.leaderboard.slice(0, span);
  const total = rows.reduce((sum, row) => sum + row.points, 0);
  const average = rows.length > 0 ? total / rows.length : 0;
  const cutoff = rows.at(-1)?.points ?? 0;
  const top = rows[0]?.points ?? 0;

  return { span, rows, total, average, cutoff, top };
}

function getDailyChartRows() {
  const snapshotRows = state.backendDailyHistory.length > 0
    ? state.backendDailyHistory
    : state.staticSnapshotHistory;

  if (snapshotRows.length > 0) {
    return snapshotRows
      .slice(1)
      .map((snapshot, index) => {
        const previousSnapshot = snapshotRows[index];
        return {
          date: snapshot.date,
          value: Math.max(0, snapshot.distributedPoints - previousSnapshot.distributedPoints),
          total: snapshot.distributedPoints,
        };
      })
      .slice(-30);
  }

  return state.dailyHistory
    .slice(1)
    .map((row, index) => {
      const previousRow = state.dailyHistory[index];
      return {
        date: row.date,
        value: Math.max(0, row.lastTotal - previousRow.lastTotal),
        total: row.lastTotal,
      };
    })
    .slice(-30);
}

function getDailyChartMeta() {
  const rows = getDailyChartRows();
  const snapshotRows = state.backendDailyHistory.length > 0
    ? state.backendDailyHistory
    : state.staticSnapshotHistory.length > 0
      ? state.staticSnapshotHistory
      : state.dailyHistory;
  const latestSnapshot = snapshotRows.at(-1);
  const latestTotal = latestSnapshot?.distributedPoints ?? latestSnapshot?.lastTotal ?? null;
  const average =
    rows.length > 0 ? rows.reduce((sum, row) => sum + row.value, 0) / rows.length : null;

  return {
    rows,
    average,
    latestTotal,
    latestDelta: rows.at(-1)?.value ?? null,
    snapshotCount: snapshotRows.length,
  };
}

function setValueState(element, text, isPending = false) {
  element.textContent = text;
  element.classList.toggle("pending-value", isPending);
}

async function loadBackendMovement() {
  try {
    const response = await fetch("/api/leaderboard-movement", {
      headers: { accept: "application/json" },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.available || !data.snapshot?.rows) {
      state.backendMovementStatus = data.reason || "No backend snapshots captured yet";
      return false;
    }

    state.backendMovementStatus = "";
    state.movementSnapshotDate = data.snapshot.date;
    state.movementRanks = new Map(
      data.snapshot.rows.map((row) => [row.address.toLowerCase(), row.rank]),
    );
    return true;
  } catch {
    return false;
  }
}

async function loadBackendDailyHistory() {
  try {
    const response = await fetch("/api/daily-distribution", {
      headers: { accept: "application/json" },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.available || !Array.isArray(data.snapshots)) {
      state.backendDailyStatus = data.reason || "No backend snapshots captured yet";
      state.backendDailyHistory = [];
      return false;
    }

    state.backendDailyStatus = "";
    state.backendDailyHistory = data.snapshots
      .filter((snapshot) => typeof snapshot.date === "string" && Number.isFinite(snapshot.distributedPoints))
      .sort((a, b) => a.date.localeCompare(b.date));
    return state.backendDailyHistory.length > 0;
  } catch {
    return false;
  }
}

function getRankMovement(row) {
  const previousRank = state.movementRanks.get(row.address.toLowerCase());

  if (!state.movementSnapshotDate) {
    return {
      label: state.backendMovementStatus ? "No snapshot" : "—",
      className: "neutral",
    };
  }

  if (!previousRank) {
    return { label: "New", className: "up" };
  }

  const movement = previousRank - row.rank;
  if (movement > 0) return { label: `↑ ${formatNumber.format(movement)}`, className: "up" };
  if (movement < 0) return { label: `↓ ${formatNumber.format(Math.abs(movement))}`, className: "down" };
  return { label: "0", className: "neutral" };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  }
  return response.json();
}

function chartPath(values) {
  const safeValues = values.length > 1 ? values : [0, 1];
  const width = 580;
  const left = 40;
  const top = 30;
  const height = 200;
  const max = Math.max(...safeValues);
  const min = Math.min(...safeValues);
  const range = Math.max(max - min, 1);

  return safeValues.map((value, index) => {
    const x = left + (index / (safeValues.length - 1)) * width;
    const y = top + height - ((value - min) / range) * height;
    return { x, y };
  });
}

function renderDailyChart() {
  const { rows } = getDailyChartMeta();
  const left = 40;
  const top = 30;
  const bottom = 230;
  const width = 580;
  const height = bottom - top;
  const max = Math.max(...rows.map((row) => row.value), 1);

  elements.chartTitle.textContent = "Daily Saturn points by snapshot";
  elements.chartDesc.textContent = "A column chart showing daily Saturn points distributed between stored snapshots.";
  elements.chartLine.setAttribute("d", "");
  elements.chartArea.setAttribute("d", "");

  if (rows.length === 0) {
    elements.chartDots.innerHTML = `
      <text class="chart-empty-title" x="320" y="122" text-anchor="middle">Ready tomorrow</text>
      <text class="chart-empty-copy" x="320" y="148" text-anchor="middle">Daily bars need at least two stored snapshots.</text>
    `;
    return;
  }

  const step = width / rows.length;
  const barWidth = Math.max(12, Math.min(52, step * 0.58));

  elements.chartDots.innerHTML = rows
    .map((row, index) => {
      const x = left + index * step + (step - barWidth) / 2;
      const barHeight = Math.max(4, (row.value / max) * height);
      const y = bottom - barHeight;
      const label = `${row.date} | ${formatCompact.format(row.value)} daily points | ${formatCompact.format(row.total)} total points`;

      return `
        <g class="chart-point" tabindex="0" aria-label="${escapeHtml(label)}">
          <rect class="chart-hit-area" x="${x - 6}" y="${top}" width="${barWidth + 12}" height="${height}"></rect>
          <rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="8"></rect>
          <title>${escapeHtml(label)}</title>
        </g>
      `;
    })
    .join("");
}

function renderChart() {
  if (state.activeChartMode === "daily") {
    renderDailyChart();
    return;
  }

  const span = Number(state.activeRange);
  const rows = state.leaderboard
    .slice(0, span)
    .reverse();
  const values = rows.map((row) => row.points);
  const points = chartPath(values);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const area = `${line} L${points.at(-1).x} 230 L${points[0].x} 230 Z`;
  const dotStep = Math.max(1, Math.ceil(points.length / 12));

  elements.chartTitle.textContent = "Saturn points trend";
  elements.chartDesc.textContent = "A line chart showing public Saturn leaderboard point distribution.";
  elements.chartLine.setAttribute("d", line);
  elements.chartArea.setAttribute("d", area);
  elements.chartDots.innerHTML = rows.length
    ? points
        .map((point, index) => ({ point, row: rows[index], index }))
        .filter(({ row, index }) => row && (index === 0 || index === rows.length - 1 || index % dotStep === 0))
        .map(({ point, row }) => {
          const label = `Rank #${row.rank} | ${formatAddress(row.address)} | ${formatNumber.format(row.points)} points`;
          return `
            <g class="chart-point" tabindex="0" aria-label="${escapeHtml(label)}">
              <circle class="chart-hit-area" cx="${point.x}" cy="${point.y}" r="15"></circle>
              <circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="5"></circle>
              <title>${escapeHtml(label)}</title>
            </g>
          `;
        })
        .join("")
    : "";
}

function parseLeaderboard(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row) => row.recipient && !EXCLUDED_ADDRESSES.has(row.recipient.toLowerCase()))
    .map((row) => ({
      address: row.recipient,
      points: rowPoints(row),
      amount: unitsToNumber(row.amount),
      pending: unitsToNumber(row.pending),
    }))
    .sort((a, b) => b.points - a.points)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

function renderLeaderboard(query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = state.leaderboard.filter((row) => {
    return [row.rank, row.address, row.points]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  elements.leaderboardRows.innerHTML = filteredRows.length
    ? filteredRows
        .map((row) => {
          const isTracked = state.trackedWallet && row.address.toLowerCase() === state.trackedWallet.toLowerCase();
          const movement = getRankMovement(row);
          return `
            <tr>
              <td>
                <span class="wallet-badge leaderboard-rank-badge">${row.rank}</span>
              </td>
              <td>
                <a
                  class="wallet-link leaderboard-wallet-link"
                  href="${debankUrl(row.address)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open ${row.address} on Debank"
                >
                  <strong>${formatAddress(row.address)}</strong>
                  ${isTracked ? "<small>Tracked wallet</small>" : ""}
                </a>
              </td>
              <td>${formatPoints.format(row.points)}</td>
              <td><span class="movement-pill ${movement.className}">${movement.label}</span></td>
            </tr>
          `;
        })
        .join("")
    : '<tr class="empty-row"><td colspan="4">No wallets match your search.</td></tr>';
}

function setWalletDisplay({ loading = false, error = "" } = {}) {
  const range = getRangeStats();

  if (loading) {
    elements.walletStatusTitle.textContent = "Looking up wallet";
    elements.walletStatusText.textContent = "Reading public Merkl rewards for this address.";
    elements.walletAddress.textContent = formatAddress(state.trackedWallet);
    elements.rankMetric.textContent = "...";
    elements.rankCaption.textContent = "Public lookup in progress";
    return;
  }

  if (error) {
    elements.walletStatusTitle.textContent = "Lookup failed";
    elements.walletStatusText.textContent = error;
    elements.rankMetric.textContent = "—";
    elements.rankCaption.textContent = "Check address and retry";
    return;
  }

  if (!state.trackedWallet) {
    elements.walletStatusTitle.textContent = "Lookup wallet, rank, or points";
    elements.walletStatusText.textContent = "Paste a wallet address to calculate public Saturn points and top-1000 rank.";
    elements.walletAddress.textContent = "No wallet selected";
    elements.rankMetric.textContent = "—";
    elements.rankCaption.textContent = "Enter wallet to calculate";
    if (state.activeChartMode !== "daily") {
      elements.pointsTotalLabel.textContent = `Top ${range.span} Wallet Points`;
      elements.pointsTotal.textContent = formatCompact.format(range.total);
    }
    return;
  }

  const rankText = state.trackedRank ? `#${formatNumber.format(state.trackedRank)}` : "1000+";
  elements.walletStatusTitle.textContent = "Wallet tracked";
  elements.walletStatusText.textContent = `${formatPoints.format(state.trackedPoints)} public Saturn points found.`;
  elements.walletAddress.textContent = formatAddress(state.trackedWallet);
  elements.rankMetric.textContent = rankText;
  elements.rankCaption.textContent = state.trackedRank
    ? `Top-1000 public leaderboard rank`
    : "Outside the public top-1000 window";
  if (state.activeChartMode !== "daily") {
    elements.pointsTotalLabel.textContent = "Tracked Wallet Points";
    elements.pointsTotal.textContent = formatPoints.format(state.trackedPoints);
  }
}

function renderDashboard() {
  const updated = state.lastUpdated ? state.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";
  const topWallet = state.leaderboard[0];
  const range = getRangeStats();
  const dailyStats = getDailyStats();
  const dailyChart = getDailyChartMeta();

  elements.tvlMetric.textContent = formatNumber.format(state.leaderboard.length);
  elements.pointsDistributed.textContent = state.pointsDistributed == null ? "Loading" : formatCompact.format(state.pointsDistributed);
  elements.pointsUpdated.textContent = state.lastUpdated ? `Updated ${updated}` : "Public Merkl data";
  elements.headerPoints.textContent = state.pointsDistributed == null ? "0.0" : formatCompact.format(state.pointsDistributed);

  const dailyText = dailyStats.todayDelta == null ? dailyStats.pendingLabel : formatCompact.format(dailyStats.todayDelta);
  const waitingForBaseline = dailyStats.trackedDays < 2 || dailyStats.todayDelta == null;

  setValueState(elements.dailyDistributed, dailyText, dailyStats.todayDelta == null);
  setValueState(elements.dailyDistributedMetric, dailyText, dailyStats.todayDelta == null);
  elements.dailyDistributedCaption.textContent = dailyStats.caption;
  setValueState(
    elements.previousDailyDistributed,
    dailyStats.previousDelta == null ? "Need 3 days" : formatCompact.format(dailyStats.previousDelta),
    dailyStats.previousDelta == null,
  );
  setValueState(
    elements.dailyAverage,
    dailyStats.average == null ? (waitingForBaseline ? "Need 2 days" : "-") : formatCompact.format(dailyStats.average),
    dailyStats.average == null,
  );
  elements.trackedDays.textContent = formatNumber.format(dailyStats.trackedDays);
  elements.syncStatusText.textContent = state.lastUpdated ? `Updated ${updated}` : "Loading public data";

  if (state.activeChartMode === "daily") {
    elements.pointsTotalLabel.textContent = "Daily Saturn Points";
    setValueState(
      elements.pointsTotal,
      dailyChart.latestDelta == null ? dailyStats.pendingLabel : formatCompact.format(dailyChart.latestDelta),
      dailyChart.latestDelta == null,
    );
    elements.chartRangeMetricLabel.textContent = "Snapshots";
    elements.chartRangeLabel.textContent =
      dailyChart.snapshotCount > 1 ? `${formatNumber.format(dailyChart.snapshotCount)} stored snapshots` : "Need 2 snapshots";
    elements.chartAverageMetricLabel.textContent = "Average / Day";
    setValueState(
      elements.chartAverage,
      dailyChart.average == null ? "Need 2 days" : formatCompact.format(dailyChart.average),
      dailyChart.average == null,
    );
    elements.chartCutoffMetricLabel.textContent = "Latest Total";
    elements.chartCutoff.textContent = dailyChart.latestTotal == null ? "-" : formatCompact.format(dailyChart.latestTotal);
    elements.miniStatOneLabel.textContent = "Stored Snapshots";
    elements.epochPace.textContent = formatNumber.format(dailyChart.snapshotCount);
    elements.miniStatTwoLabel.textContent = "Latest Daily";
    elements.multiplier.textContent = dailyChart.latestDelta == null ? "-" : formatCompact.format(dailyChart.latestDelta);
    elements.miniStatThreeLabel.textContent = "Chart Mode";
    elements.nextRank.textContent = "Daily";
    elements.chartLowLabel.textContent = dailyChart.rows[0]?.date ?? "Need 2 snapshots";
    elements.chartHighLabel.textContent = dailyChart.rows.at(-1)?.date ?? "Next snapshot";
  } else {
    elements.pointsTotal.classList.remove("pending-value");
    elements.chartRangeMetricLabel.textContent = "Range";
    elements.chartRangeLabel.textContent = `Top ${range.span} wallets`;
    elements.chartAverageMetricLabel.textContent = "Average / Wallet";
    setValueState(elements.chartAverage, range.rows.length > 0 ? formatCompact.format(range.average) : "-", false);
    elements.chartCutoffMetricLabel.textContent = "Cutoff Points";
    elements.chartCutoff.textContent = range.rows.length > 0 ? formatCompact.format(range.cutoff) : "-";
    elements.miniStatOneLabel.textContent = "Public Rows";
    elements.epochPace.textContent = `${formatNumber.format(state.leaderboard.length)} rows`;
    elements.miniStatTwoLabel.textContent = "#1 Points";
    elements.multiplier.textContent = topWallet ? formatCompact.format(topWallet.points) : "-";
    elements.miniStatThreeLabel.textContent = "Selected Range";
    elements.nextRank.textContent = `Top ${state.activeRange}`;
    elements.chartLowLabel.textContent = range.rows.length > 0 ? `Rank #${range.rows.at(-1).rank}` : `Rank #${range.span}`;
    elements.chartHighLabel.textContent = range.rows.length > 0 ? `Rank #${range.rows[0].rank}` : "Rank #1";
  }

  if (!state.trackedWallet && state.activeChartMode !== "daily") {
    elements.pointsTotalLabel.textContent = `Top ${range.span} Wallet Points`;
    elements.pointsTotal.textContent = range.rows.length > 0 ? formatCompact.format(range.total) : "0.0";
  }

  renderLeaderboard(elements.walletSearch.value);
  renderChart();
  setWalletDisplay();
}

async function loadPublicData() {
  elements.refreshData.disabled = true;
  elements.refreshData.textContent = "Loading";
  elements.syncStatusText.textContent = "Loading public data";

  try {
    const excludedAddress = [...EXCLUDED_ADDRESSES][0];
    const [leaderboardRows, totalRow, excludedRows] = await Promise.all([
      fetchJson(urls.leaderboard),
      fetchJson(urls.total),
      fetchJson(urls.recipient(excludedAddress)),
    ]);

    const excludedAmount = Array.isArray(excludedRows) && excludedRows[0] ? totalAmount(excludedRows[0]) : 0n;
    state.leaderboard = parseLeaderboard(leaderboardRows);
    state.pointsDistributed = unitsToNumber(totalAmount(totalRow) - excludedAmount);
    state.lastUpdated = new Date();
    recordDailyDistribution(state.pointsDistributed, state.lastUpdated);
    recordLeaderboardSnapshot(state.leaderboard, state.lastUpdated);
    await loadStaticSnapshotHistory();
    updateMovementRanks(state.lastUpdated);
    await Promise.all([loadBackendMovement(), loadBackendDailyHistory()]);

    if (state.trackedWallet) {
      const existing = state.leaderboard.find((row) => row.address.toLowerCase() === state.trackedWallet.toLowerCase());
      state.trackedRank = existing?.rank ?? null;
    }

    renderDashboard();
  } catch (error) {
    elements.syncStatusText.textContent = "Public data failed to load";
    elements.pointsUpdated.textContent = error.message;
    console.error(error);
  } finally {
    elements.refreshData.disabled = false;
    elements.refreshData.textContent = "Refresh data";
  }
}

async function fetchWalletPoints(address) {
  try {
    const userRewards = await fetchJson(urls.userRewards(address));
    const rewards = userRewards?.[0]?.rewards ?? [];
    const tokenReward = rewards.find((reward) => reward.token?.address?.toLowerCase() === SATURN_POINT_TOKEN_LOWER);
    if (tokenReward) return rowPoints(tokenReward);
  } catch {
    // Fall back to the token-recipient endpoint used elsewhere by Saturn's public page.
  }

  const recipientRows = await fetchJson(urls.recipient(address));
  return Array.isArray(recipientRows) && recipientRows[0] ? rowPoints(recipientRows[0]) : 0;
}

async function trackWallet(address) {
  state.trackedWallet = address;
  state.trackedPoints = 0;
  state.trackedRank = null;
  setWalletDisplay({ loading: true });

  try {
    const points = await fetchWalletPoints(address);
    const leaderboardRow = state.leaderboard.find((row) => row.address.toLowerCase() === address.toLowerCase());
    state.trackedPoints = points;
    state.trackedRank = leaderboardRow?.rank ?? null;
    renderDashboard();
  } catch (error) {
    setWalletDisplay({ error: error.message });
  }
}

function setActiveRange(range) {
  if (range === "daily") {
    state.activeChartMode = "daily";
  } else {
    state.activeChartMode = "leaderboard";
    state.activeRange = range;
  }

  const activeRange = state.activeChartMode === "daily" ? "daily" : state.activeRange;

  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === activeRange);
  });

  renderDashboard();
}

elements.refreshData.addEventListener("click", loadPublicData);

elements.walletLookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const address = elements.walletInput.value.trim();

  if (!isWalletAddress(address)) {
    setWalletDisplay({ error: "Enter a valid 0x wallet address." });
    return;
  }

  trackWallet(address);
});

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => setActiveRange(button.dataset.range));
});

elements.walletSearch.addEventListener("input", (event) => {
  renderLeaderboard(event.target.value);
});

document.querySelectorAll("[data-copy-ref]").forEach((button) => {
  button.addEventListener("click", async () => {
    const originalText = button.textContent;

    try {
      await copyText(button.dataset.copyRef);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy failed";
    }

    setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  });
});

elements.walletSearch.placeholder = "0x wallet, rank, or points";
renderDashboard();
loadPublicData();
