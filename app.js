const CHAIN_ID = 1;
const SATURN_POINT_TOKEN = "0xD223bbdd0421E394C0df9dFfe568f1dADfFd6f85";
const SATURN_POINT_TOKEN_LOWER = SATURN_POINT_TOKEN.toLowerCase();
const EXCLUDED_ADDRESSES = new Set(["0x80c6a512b548229226c0676d6fdbaff81d325990"]);
const LEADERBOARD_PAGE_SIZE = 1000;
const DAILY_HISTORY_KEY = "saturn:daily-distribution:v1";
const DAILY_HISTORY_LIMIT = 120;

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
  maximumFractionDigits: 3,
});

const formatCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const state = {
  activeRange: "10",
  leaderboard: [],
  pointsDistributed: null,
  dailyHistory: [],
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
  chartRangeLabel: document.querySelector("#chartRangeLabel"),
  chartAverage: document.querySelector("#chartAverage"),
  chartCutoff: document.querySelector("#chartCutoff"),
  dailyDistributed: document.querySelector("#dailyDistributed"),
  previousDailyDistributed: document.querySelector("#previousDailyDistributed"),
  dailyAverage: document.querySelector("#dailyAverage"),
  trackedDays: document.querySelector("#trackedDays"),
  chartLowLabel: document.querySelector("#chartLowLabel"),
  chartHighLabel: document.querySelector("#chartHighLabel"),
  headerPoints: document.querySelector("#headerPoints"),
  epochPace: document.querySelector("#epochPace"),
  multiplier: document.querySelector("#multiplier"),
  nextRank: document.querySelector("#nextRank"),
  syncStatusText: document.querySelector("#syncStatusText"),
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

function debankUrl(address) {
  return `https://debank.com/profile/${address}`;
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

function getDailyStats() {
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
  };
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

function renderChart() {
  const span = Number(state.activeRange);
  const values = state.leaderboard
    .slice(0, span)
    .map((row) => row.points)
    .reverse();
  const points = chartPath(values);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const area = `${line} L${points.at(-1).x} 230 L${points[0].x} 230 Z`;
  const dotStep = Math.max(1, Math.ceil(points.length / 12));

  elements.chartLine.setAttribute("d", line);
  elements.chartArea.setAttribute("d", area);
  elements.chartDots.innerHTML = points
    .filter((_, index) => index === 0 || index === points.length - 1 || index % dotStep === 0)
    .map((point) => `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="5"></circle>`)
    .join("");
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
    return [row.rank, row.address, row.points, row.amount, row.pending]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  elements.leaderboardRows.innerHTML = filteredRows.length
    ? filteredRows
        .map((row) => {
          const isTracked = state.trackedWallet && row.address.toLowerCase() === state.trackedWallet.toLowerCase();
          return `
            <tr>
              <td><strong>#${formatNumber.format(row.rank)}</strong></td>
              <td>
                <div class="wallet-cell">
                  <span class="wallet-badge">${row.rank}</span>
                  <span>
                    <a
                      class="wallet-link"
                      href="${debankUrl(row.address)}"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open ${row.address} on Debank"
                    >
                      <strong>${formatAddress(row.address)}</strong>
                      <small>${isTracked ? "Tracked wallet" : row.address}</small>
                    </a>
                  </span>
                </div>
              </td>
              <td>${formatPoints.format(row.points)}</td>
              <td>${formatPoints.format(row.amount)}</td>
              <td class="muted">+${formatPoints.format(row.pending)} pending</td>
            </tr>
          `;
        })
        .join("")
    : '<tr class="empty-row"><td colspan="5">No wallets match your search.</td></tr>';
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
    elements.walletStatusTitle.textContent = "Public wallet tracking";
    elements.walletStatusText.textContent = "Paste a wallet address to calculate public Saturn points and top-1000 rank.";
    elements.walletAddress.textContent = "No wallet selected";
    elements.rankMetric.textContent = "—";
    elements.rankCaption.textContent = "Enter wallet to calculate";
    elements.pointsTotalLabel.textContent = `Top ${range.span} Wallet Points`;
    elements.pointsTotal.textContent = formatCompact.format(range.total);
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
  elements.pointsTotalLabel.textContent = "Tracked Wallet Points";
  elements.pointsTotal.textContent = formatPoints.format(state.trackedPoints);
}

function renderDashboard() {
  const updated = state.lastUpdated ? state.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  const topWallet = state.leaderboard[0];
  const range = getRangeStats();
  const dailyStats = getDailyStats();

  elements.tvlMetric.textContent = formatNumber.format(state.leaderboard.length);
  elements.pointsDistributed.textContent = state.pointsDistributed == null ? "Loading" : formatCompact.format(state.pointsDistributed);
  elements.pointsUpdated.textContent = state.lastUpdated ? `Updated ${updated}` : "Public Merkl data";
  elements.headerPoints.textContent = state.pointsDistributed == null ? "0.0" : formatCompact.format(state.pointsDistributed);
  elements.epochPace.textContent = `${formatNumber.format(state.leaderboard.length)} rows`;
  elements.multiplier.textContent = topWallet ? formatCompact.format(topWallet.points) : "—";
  elements.nextRank.textContent = `Top ${state.activeRange}`;
  elements.chartRangeLabel.textContent = `Top ${range.span} wallets`;
  elements.chartAverage.textContent = range.rows.length > 0 ? formatCompact.format(range.average) : "—";
  elements.chartCutoff.textContent = range.rows.length > 0 ? formatCompact.format(range.cutoff) : "—";
  elements.dailyDistributed.textContent =
    dailyStats.todayDelta == null ? "Tracking" : formatCompact.format(dailyStats.todayDelta);
  elements.previousDailyDistributed.textContent =
    dailyStats.previousDelta == null ? "Need 2 days" : formatCompact.format(dailyStats.previousDelta);
  elements.dailyAverage.textContent =
    dailyStats.average == null ? "Need 2 days" : formatCompact.format(dailyStats.average);
  elements.trackedDays.textContent = formatNumber.format(dailyStats.trackedDays);
  elements.chartLowLabel.textContent = range.rows.length > 0 ? `Rank #${range.rows.at(-1).rank}` : `Rank #${range.span}`;
  elements.chartHighLabel.textContent = range.rows.length > 0 ? `Rank #${range.rows[0].rank}` : "Rank #1";
  elements.syncStatusText.textContent = state.lastUpdated ? `Updated ${updated}` : "Loading public data";

  if (!state.trackedWallet) {
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
  state.activeRange = range;

  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === range);
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

elements.walletSearch.placeholder = "0x wallet, rank, or points";
renderDashboard();
loadPublicData();
