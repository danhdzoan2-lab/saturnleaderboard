const CHAIN_ID = 1;
const SATURN_POINT_TOKEN = "0xD223bbdd0421E394C0df9dFfe568f1dADfFd6f85";
const SATURN_POINT_TOKEN_LOWER = SATURN_POINT_TOKEN.toLowerCase();
const EXCLUDED_ADDRESS = "0x80c6a512b548229226c0676d6fdbaff81d325990";
const LEADERBOARD_PAGE_SIZE = 1000;
const AIRDROP_PERCENT = 0.05;
const SNAPSHOT_TVL_USD = 500_000_000;
const BASE_FDV_USD = 500_000_000;
const WALLET_STORAGE_KEY = "saturn:farm-wallets:v1";
const FDV_SCENARIOS = Array.from({ length: 18 }, (_, index) => {
  const fdv = 150_000_000 + index * 50_000_000;

  return {
    fdv,
    name: formatScenarioFdv(fdv),
  };
});
const SNAPSHOT_DATE = new Date("2026-08-08T00:00:00+07:00");
const PROJECTION_START_DATE = new Date("2026-05-15T00:00:00+07:00");
const DAY_MS = 24 * 60 * 60 * 1000;

const urls = {
  leaderboard: `https://api.merkl.xyz/v4/rewards/token/?chainId=${CHAIN_ID}&address=${SATURN_POINT_TOKEN}&items=${LEADERBOARD_PAGE_SIZE}`,
  total: `https://api.merkl.xyz/v4/rewards/token/total?chainId=${CHAIN_ID}&address=${SATURN_POINT_TOKEN}`,
  userRewards: (address) => `https://api.merkl.xyz/v4/users/${address}/rewards?chainId=${CHAIN_ID}`,
  recipient: (address) =>
    `https://api.merkl.xyz/v4/rewards/token/?chainId=${CHAIN_ID}&address=${SATURN_POINT_TOKEN}&recipient=${address}`,
};

const formatNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const formatPoints = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const formatTotalPoints = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const formatCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const formatPercent = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const formatUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatUsdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const state = {
  wallets: loadSavedWallets(),
  editingWallets: false,
  rows: [],
  leaderboard: [],
  total: 0,
  totalPending: 0,
  networkTotalPoints: 0,
  lastUpdated: null,
};

function formatScenarioFdv(fdv) {
  return fdv >= 1_000_000_000 ? `$${fdv / 1_000_000_000}B` : `$${fdv / 1_000_000}M`;
}

const elements = {
  refreshFarm: document.querySelector("#refreshFarm"),
  walletCountStat: document.querySelector("#walletCountStat"),
  farmHeaderPoints: document.querySelector("#farmHeaderPoints"),
  walletManagerForm: document.querySelector("#walletManagerForm"),
  walletManagerCard: document.querySelector(".wallet-manager-card"),
  walletSummary: document.querySelector("#walletSummary"),
  walletSummaryCount: document.querySelector("#walletSummaryCount"),
  walletSummaryPreview: document.querySelector("#walletSummaryPreview"),
  walletListInput: document.querySelector("#walletListInput"),
  walletListStatus: document.querySelector("#walletListStatus"),
  copyWalletsCompact: document.querySelector("#copyWalletsCompact"),
  editWallets: document.querySelector("#editWallets"),
  copyWallets: document.querySelector("#copyWallets"),
  clearWallets: document.querySelector("#clearWallets"),
  totalFarmPoints: document.querySelector("#totalFarmPoints"),
  pointShare: document.querySelector("#pointShare"),
  networkTotalCaption: document.querySelector("#networkTotalCaption"),
  moonsheetValue: document.querySelector("#moonsheetValue"),
  projectedSnapshotPoints: document.querySelector("#projectedSnapshotPoints"),
  projectionStatus: document.querySelector("#projectionStatus"),
  moonCurrentPoints: document.querySelector("#moonCurrentPoints"),
  moonTotalPoints: document.querySelector("#moonTotalPoints"),
  moonShare: document.querySelector("#moonShare"),
  moonPoolValue: document.querySelector("#moonPoolValue"),
  moonProjectedFarm: document.querySelector("#moonProjectedFarm"),
  moonProjectedTotal: document.querySelector("#moonProjectedTotal"),
  moonDays: document.querySelector("#moonDays"),
  moonEstimatedValue: document.querySelector("#moonEstimatedValue"),
  scenarioFocus: document.querySelector("#scenarioFocus"),
  scenarioFocusCase: document.querySelector("#scenarioFocusCase"),
  scenarioFocusValue: document.querySelector("#scenarioFocusValue"),
  scenarioFocusMeta: document.querySelector("#scenarioFocusMeta"),
  fdvScenarioSelect: document.querySelector("#fdvScenarioSelect"),
  fdvScenarioRows: document.querySelector("#fdvScenarioRows"),
  projectionNote: document.querySelector("#projectionNote"),
  farmSyncStatus: document.querySelector("#farmSyncStatus"),
  farmTotalLarge: document.querySelector("#farmTotalLarge"),
  allocationList: document.querySelector("#allocationList"),
  averageWalletPoints: document.querySelector("#averageWalletPoints"),
  pendingFarmPoints: document.querySelector("#pendingFarmPoints"),
  lastRefresh: document.querySelector("#lastRefresh"),
  farmRows: document.querySelector("#farmRows"),
  copyCsv: document.querySelector("#copyCsv"),
};

function isWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function formatAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatWalletLabel(row) {
  return formatAddress(row.address);
}

function parseWallets(input) {
  const matches = input.match(/0x[a-fA-F0-9]{40}/g) ?? [];
  const seen = new Set();
  const wallets = [];

  matches.forEach((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    wallets.push({ label: `Wallet ${wallets.length + 1}`, address });
  });

  return wallets;
}

function loadSavedWallets() {
  try {
    const saved = JSON.parse(localStorage.getItem(WALLET_STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];

    return saved
      .map((row) => (typeof row === "string" ? row : row?.address))
      .filter((address) => typeof address === "string" && isWalletAddress(address))
      .filter((address, index, rows) => rows.findIndex((item) => item.toLowerCase() === address.toLowerCase()) === index)
      .map((address, index) => ({ label: `Wallet ${index + 1}`, address }));
  } catch {
    return [];
  }
}

function saveWallets(wallets) {
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallets.map((wallet) => wallet.address)));
}

function setWalletStatus(message) {
  elements.walletListStatus.textContent = message;
}

function syncWalletInput() {
  elements.walletListInput.value = state.wallets.map((wallet) => wallet.address).join("\n");
}

function renderWalletManager() {
  const walletCount = state.wallets.length;
  const collapsed = walletCount > 0 && !state.editingWallets;
  const preview = state.wallets.slice(0, 3).map((wallet) => formatAddress(wallet.address));
  const hiddenCount = walletCount - preview.length;

  elements.walletManagerCard.classList.toggle("is-collapsed", collapsed);
  elements.walletManagerForm.hidden = collapsed;
  elements.walletSummary.hidden = !collapsed;

  if (!collapsed) return;

  elements.walletSummaryCount.textContent = `${formatNumber.format(walletCount)} wallet${walletCount === 1 ? "" : "s"} saved`;
  elements.walletSummaryPreview.textContent = `${preview.join("   ")}${hiddenCount > 0 ? `   +${hiddenCount} more` : ""}`;
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

function pointsFromRow(row) {
  return unitsToNumber(BigInt(row?.amount || 0) + BigInt(row?.pending || 0));
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

function getProjection() {
  const now = new Date();
  const elapsedDays = Math.max(1, (now.getTime() - PROJECTION_START_DATE.getTime()) / DAY_MS);
  const daysToSnapshot = Math.max(0, (SNAPSHOT_DATE.getTime() - now.getTime()) / DAY_MS);
  const factor = (elapsedDays + daysToSnapshot) / elapsedDays;
  const pointShare = state.networkTotalPoints > 0 ? state.total / state.networkTotalPoints : 0;
  const scenarios = FDV_SCENARIOS.map((scenario) => {
    const airdropPool = scenario.fdv * AIRDROP_PERCENT;

    return {
      ...scenario,
      airdropPool,
      estimatedValue: pointShare * airdropPool,
    };
  });
  const baseScenario = scenarios.find((scenario) => scenario.fdv === BASE_FDV_USD) ?? scenarios[0];

  return {
    elapsedDays,
    daysToSnapshot,
    factor,
    pointShare,
    scenarios,
    baseScenario,
    projectedFarmPoints: state.total * factor,
    projectedNetworkPoints: state.networkTotalPoints * factor,
  };
}

function parseLeaderboard(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row) => row.recipient && row.recipient.toLowerCase() !== EXCLUDED_ADDRESS)
    .map((row) => ({
      address: row.recipient,
      points: pointsFromRow(row),
    }))
    .sort((a, b) => b.points - a.points)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

async function fetchWallet(wallet) {
  let userRewardError = null;

  try {
    const userRewards = await fetchJson(urls.userRewards(wallet.address));
    const rewards = userRewards?.[0]?.rewards ?? [];
    const tokenReward = rewards.find((reward) => reward.token?.address?.toLowerCase() === SATURN_POINT_TOKEN_LOWER);

    if (tokenReward) {
      return {
        ...wallet,
        amount: unitsToNumber(tokenReward.amount),
        pending: unitsToNumber(tokenReward.pending),
        points: pointsFromRow(tokenReward),
        source: "user-rewards",
        ok: true,
      };
    }
  } catch (error) {
    userRewardError = error;
  }

  try {
    const recipientRows = await fetchJson(urls.recipient(wallet.address));
    const row = recipientRows?.[0];

    return {
      ...wallet,
      amount: row ? unitsToNumber(row.amount) : 0,
      pending: row ? unitsToNumber(row.pending) : 0,
      points: row ? pointsFromRow(row) : 0,
      source: "recipient",
      ok: true,
    };
  } catch (error) {
    return {
      ...wallet,
      amount: 0,
      pending: 0,
      points: 0,
      source: "error",
      ok: false,
      error: userRewardError?.message || error.message,
    };
  }
}

function enrichRows(rows) {
  return rows
    .map((row) => {
      const leaderboardRow = state.leaderboard.find(
        (entry) => entry.address.toLowerCase() === row.address.toLowerCase(),
      );

      return {
        ...row,
        rank: leaderboardRow?.rank ?? null,
        leaderboardPoints: leaderboardRow?.points ?? null,
        share: state.total > 0 ? (row.points / state.total) * 100 : 0,
      };
    })
    .sort((a, b) => b.points - a.points);
}

function renderAllocation() {
  if (state.wallets.length === 0) {
    elements.allocationList.innerHTML = '<div class="loading-card">Save one or more wallet addresses above to see contribution by wallet.</div>';
    return;
  }

  elements.allocationList.innerHTML = state.rows
    .map((row) => {
      const width = Math.max(row.share, row.points > 0 ? 2 : 0);
      return `
        <article class="allocation-row">
          <div class="allocation-row-header">
            <span>
              <strong>${formatWalletLabel(row)}</strong>
            </span>
            <b>${formatPercent.format(row.share)}%</b>
          </div>
          <div class="allocation-track" aria-label="${row.label} share ${formatPercent.format(row.share)} percent">
            <span style="width: ${width}%"></span>
          </div>
          <div class="allocation-meta">
            <span>${formatPoints.format(row.points)} points</span>
            <span>${row.rank ? `#${formatNumber.format(row.rank)}` : "1000+ rank"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTable() {
  if (state.wallets.length === 0) {
    elements.farmRows.innerHTML = '<tr class="empty-row"><td colspan="4">Save wallet addresses above to load data.</td></tr>';
    return;
  }

  elements.farmRows.innerHTML = state.rows
    .map((row, index) => {
      const rankText = row.rank ? `#${formatNumber.format(row.rank)}` : "1000+";
      const walletLabel = formatWalletLabel(row);
      return `
        <tr>
          <td>
            <div class="wallet-cell">
              <span class="wallet-badge">${index + 1}</span>
              <span>
                <strong title="${row.address}">${walletLabel}</strong>
              </span>
            </div>
          </td>
          <td>${formatPoints.format(row.points)}</td>
          <td>${formatPercent.format(row.share)}%</td>
          <td>${rankText}</td>
        </tr>
      `;
    })
    .join("");
}

function renderFdvScenarios(projection) {
  elements.fdvScenarioSelect.innerHTML = projection.scenarios
    .map((scenario, index) => {
      const basis =
        scenario.fdv === SNAPSHOT_TVL_USD
          ? "1x TVL"
          : `${(scenario.fdv / SNAPSHOT_TVL_USD).toFixed(1)}x TVL`;

      return `<option value="${index}">${scenario.name} FDV - ${formatUsd.format(scenario.estimatedValue)} (${basis})</option>`;
    })
    .join("");

  elements.fdvScenarioRows.innerHTML = projection.scenarios
    .map((scenario, index) => {
      const basis =
        scenario.fdv === SNAPSHOT_TVL_USD
          ? "1x TVL"
          : `${(scenario.fdv / SNAPSHOT_TVL_USD).toFixed(1)}x TVL`;
      return `
        <tr tabindex="0" data-scenario-index="${index}" aria-label="${scenario.name} FDV scenario estimated value ${formatUsd.format(scenario.estimatedValue)}">
          <td><strong>${scenario.name}</strong></td>
          <td>${basis}</td>
          <td>${formatUsd.format(scenario.estimatedValue)}</td>
        </tr>
      `;
    })
    .join("");

  const rows = Array.from(elements.fdvScenarioRows.querySelectorAll("tr"));
  const baseIndex = Math.max(
    0,
    projection.scenarios.findIndex((scenario) => scenario.fdv === BASE_FDV_USD),
  );

  rows.forEach((row) => {
    const index = Number(row.dataset.scenarioIndex);
    const activate = () => setActiveScenario(index, projection);

    row.addEventListener("mouseenter", activate);
    row.addEventListener("focus", activate);
    row.addEventListener("click", activate);
  });

  elements.fdvScenarioSelect.onchange = (event) => {
    setActiveScenario(Number(event.target.value), projection);
  };

  setActiveScenario(baseIndex, projection, { highlightRow: false });
}

function setActiveScenario(index, projection, { highlightRow = true } = {}) {
  const scenario = projection.scenarios[index];
  if (!scenario) return;

  const basis =
    scenario.fdv === SNAPSHOT_TVL_USD
      ? "1x assumed snapshot TVL"
      : `${(scenario.fdv / SNAPSHOT_TVL_USD).toFixed(1)}x assumed snapshot TVL`;

  elements.fdvScenarioRows.querySelectorAll("tr").forEach((row) => {
    row.classList.toggle("active", highlightRow && Number(row.dataset.scenarioIndex) === index);
  });
  elements.fdvScenarioSelect.value = String(index);
  elements.scenarioFocusCase.textContent = `${scenario.name} FDV`;
  elements.scenarioFocusValue.textContent = formatUsd.format(scenario.estimatedValue);
  elements.scenarioFocusMeta.textContent = `${basis}; ${formatUsdCompact.format(scenario.airdropPool)} airdrop pool at ${formatPercent.format(AIRDROP_PERCENT * 100)}%.`;
}

function render() {
  const projection = getProjection();
  const walletCount = state.wallets.length;
  const updated = state.lastUpdated
    ? state.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "-";
  const snapshotLabel = SNAPSHOT_DATE.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const projectionStartLabel = PROJECTION_START_DATE.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  elements.walletCountStat.textContent = formatNumber.format(walletCount);
  elements.farmHeaderPoints.textContent = formatCompact.format(state.total);
  elements.totalFarmPoints.textContent = formatCompact.format(state.total);
  elements.farmTotalLarge.textContent = formatPoints.format(state.total);
  elements.pointShare.textContent = `${formatPercent.format(projection.pointShare * 100)}%`;
  elements.networkTotalCaption.textContent = `${formatCompact.format(state.networkTotalPoints)} total public points`;
  elements.moonsheetValue.textContent = formatUsdCompact.format(projection.baseScenario.estimatedValue);
  elements.projectedSnapshotPoints.textContent = formatCompact.format(projection.projectedFarmPoints);
  elements.projectionStatus.textContent = state.lastUpdated ? `Snapshot ${snapshotLabel}` : "Waiting for live data";
  elements.moonCurrentPoints.textContent = formatCompact.format(state.total);
  elements.moonTotalPoints.textContent = formatCompact.format(state.networkTotalPoints);
  elements.moonShare.textContent = `${formatPercent.format(projection.pointShare * 100)}%`;
  elements.moonPoolValue.textContent = formatUsdCompact.format(SNAPSHOT_TVL_USD);
  elements.moonProjectedFarm.textContent = formatCompact.format(projection.projectedFarmPoints);
  elements.moonProjectedTotal.textContent = formatCompact.format(projection.projectedNetworkPoints);
  elements.moonDays.textContent = `${formatNumber.format(Math.ceil(projection.daysToSnapshot))}`;
  elements.moonEstimatedValue.textContent = formatUsd.format(projection.baseScenario.estimatedValue);
  elements.projectionNote.textContent =
    `${formatUsdCompact.format(SNAPSHOT_TVL_USD)} snapshot TVL, $150M-$1B FDV cases in $50M steps, and ${formatPercent.format(AIRDROP_PERCENT * 100)}% airdrop pool. Projection uses a linear point pace from ${projectionStartLabel} to ${snapshotLabel}; it is not a guaranteed emission schedule.`;
  elements.averageWalletPoints.textContent = walletCount > 0 ? formatCompact.format(state.total / walletCount) : "-";
  elements.pendingFarmPoints.textContent = formatCompact.format(state.totalPending);
  elements.lastRefresh.textContent = updated;
  elements.farmSyncStatus.textContent = state.lastUpdated
    ? `Updated ${updated}`
    : walletCount > 0
      ? "Loading public data"
      : "No wallets saved";
  setWalletStatus(walletCount > 0 ? `${formatNumber.format(walletCount)} wallet${walletCount === 1 ? "" : "s"} saved locally.` : "No wallets saved.");

  renderWalletManager();
  renderAllocation();
  renderFdvScenarios(projection);
  renderTable();
}

async function refreshFarm() {
  elements.refreshFarm.disabled = true;
  elements.refreshFarm.textContent = "Loading";
  elements.farmSyncStatus.textContent = "Loading public data";

  try {
    const [leaderboardRaw, totalRaw, excludedRows] = await Promise.all([
      fetchJson(urls.leaderboard),
      fetchJson(urls.total),
      fetchJson(urls.recipient(EXCLUDED_ADDRESS)),
    ]);
    const walletRows = state.wallets.length > 0 ? await Promise.all(state.wallets.map(fetchWallet)) : [];

    state.leaderboard = parseLeaderboard(leaderboardRaw);
    state.total = walletRows.reduce((sum, row) => sum + row.points, 0);
    state.totalPending = walletRows.reduce((sum, row) => sum + row.pending, 0);
    state.networkTotalPoints = unitsToNumber(totalAmount(totalRaw) - totalAmount(excludedRows?.[0]));
    state.rows = enrichRows(walletRows);
    state.lastUpdated = new Date();
    render();
  } catch (error) {
    elements.farmSyncStatus.textContent = "Public data failed to load";
    setWalletStatus(error.message);
  } finally {
    elements.refreshFarm.disabled = false;
    elements.refreshFarm.textContent = "Refresh points";
  }
}

function buildCsv() {
  const header = ["wallet_label", "address", "points", "share_percent", "rank"];
  const rows = state.rows.map((row) => [
    row.label,
    row.address,
    row.points,
    row.share,
    row.rank ?? "1000+",
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

async function copyWithButton(button, text, successText = "Copied") {
  const originalText = button.textContent;

  try {
    await copyText(text);
    button.textContent = successText;
  } catch {
    button.textContent = "Copy failed";
  }

  setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
}

elements.walletManagerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const wallets = parseWallets(elements.walletListInput.value);

  if (wallets.length === 0) {
    setWalletStatus("No valid 0x wallet addresses found.");
    return;
  }

  state.wallets = wallets;
  state.editingWallets = false;
  saveWallets(state.wallets);
  syncWalletInput();
  setWalletStatus(`${formatNumber.format(wallets.length)} wallet${wallets.length === 1 ? "" : "s"} saved locally.`);
  renderWalletManager();
  refreshFarm();
});

elements.copyWallets.addEventListener("click", () => {
  const text = state.wallets.map((wallet) => wallet.address).join("\n") || elements.walletListInput.value.trim();
  if (!text) {
    setWalletStatus("No wallet addresses to copy.");
    return;
  }

  copyWithButton(elements.copyWallets, text);
});

elements.copyWalletsCompact.addEventListener("click", () => {
  const text = state.wallets.map((wallet) => wallet.address).join("\n");
  if (!text) {
    setWalletStatus("No wallet addresses to copy.");
    return;
  }

  copyWithButton(elements.copyWalletsCompact, text);
});

elements.clearWallets.addEventListener("click", () => {
  state.wallets = [];
  state.editingWallets = true;
  state.rows = [];
  state.total = 0;
  state.totalPending = 0;
  saveWallets(state.wallets);
  syncWalletInput();
  setWalletStatus("Wallet list cleared.");
  refreshFarm();
});

elements.refreshFarm.addEventListener("click", refreshFarm);

elements.editWallets.addEventListener("click", () => {
  state.editingWallets = true;
  render();
  elements.walletListInput.focus();
});

elements.copyCsv.addEventListener("click", () => {
  copyWithButton(elements.copyCsv, buildCsv());
});

document.querySelectorAll("[data-copy-ref]").forEach((button) => {
  button.addEventListener("click", () => {
    copyWithButton(button, button.dataset.copyRef);
  });
});

syncWalletInput();
render();
refreshFarm();
