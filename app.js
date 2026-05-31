(() => {
  const NativeNumberFormat = Intl.NumberFormat;
  const movementEndpoint = "/api/leaderboard-movement";
  const dailyEndpoint = "/api/daily-distribution";
  let movementRanks = new Map();
  let movementDate = null;
  let dailyStats = null;

  function normalizeOptions(options) {
    if (!options || typeof options !== "object") return options;
    const next = { ...options };

    if (next.maximumFractionDigits === 3) {
      next.maximumFractionDigits = 0;
    }

    return next;
  }

  function PatchedNumberFormat(locales, options) {
    return new NativeNumberFormat(locales, normalizeOptions(options));
  }

  const formatNumber = new NativeNumberFormat("en-US", { maximumFractionDigits: 0 });
  const formatCompact = new NativeNumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  });

  function setText(selector, text) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim() !== text) element.textContent = text;
  }

  function setElementText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function formatAddress(address) {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function injectStyles() {
    if (document.querySelector("#snapshotOverlayStyles")) return;

    const style = document.createElement("style");
    style.id = "snapshotOverlayStyles";
    style.textContent = `
      .header-stats strong { font-size: 1.04rem; font-weight: 950; }
      #leaderboard table { width: 100%; min-width: 760px; table-layout: fixed; }
      #leaderboard col { width: 25%; }
      #leaderboard table th:nth-child(4), #leaderboard table td:nth-child(4) { display: table-cell !important; }
      #leaderboard table th:nth-child(5), #leaderboard table td:nth-child(5) { display: none !important; }
      #leaderboard th:nth-child(1), #leaderboard td:nth-child(1) { text-align: center; }
      #leaderboard th:nth-child(3), #leaderboard td:nth-child(3),
      #leaderboard th:nth-child(4), #leaderboard td:nth-child(4) { text-align: right; }
      .leaderboard-rank-badge { width: 44px; height: 44px; border-radius: 14px; font-size: 1.05rem; }
      .leaderboard-wallet-link { display: inline-flex; flex-direction: column; gap: 3px; }
      .leaderboard-wallet-link small:empty { display: none; }
      .movement-pill { display: inline-flex; min-width: 78px; justify-content: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: rgba(0,0,0,.16); font-family: var(--font-mono); font-size: .78rem; font-weight: 900; }
      .movement-pill.up { color: var(--green); border-color: rgba(150,225,162,.26); background: rgba(150,225,162,.08); }
      .movement-pill.down { color: var(--gold); border-color: rgba(255,90,20,.3); background: rgba(255,90,20,.08); }
      .movement-pill.neutral { color: var(--muted); }
    `;
    document.head.appendChild(style);
  }

  function polishCopy() {
    setText(".hero-grid h1", "Saturn points command center");
    const copy = document.querySelector(".hero-copy");
    if (copy) copy.textContent = "Leaderboard totals, wallet lookup, and point distribution from public Saturn data.";
    const title = document.querySelector("#walletStatusTitle");
    if (title && title.textContent.trim() === "Public wallet tracking") {
      title.textContent = "Lookup wallet, rank, or points";
    }
    document.querySelectorAll("#chartFill stop").forEach((stop) => {
      stop.setAttribute("stop-color", "#ff5a14");
    });
  }

  function patchDailyMetricCard() {
    const cards = [...document.querySelectorAll(".metric-card")];
    const card = cards.find((item) => item.textContent.includes("Refresh Cadence"));
    if (!card) return;

    const label = card.querySelector(".metric-label");
    const strong = card.querySelector("strong");
    const small = card.querySelector("small");

    if (label) label.textContent = "Daily Distributed";
    if (strong) {
      strong.id = "dailyDistributedMetric";
      if (!dailyStats) strong.textContent = "Tracking";
    }
    if (small) {
      small.id = "dailyDistributedCaption";
      if (!dailyStats) small.textContent = "Backend snapshot baseline";
    }
  }

  function patchLeaderboardHeader() {
    const table = document.querySelector("#leaderboard table");
    const headerRow = table?.querySelector("thead tr");
    if (!table || !headerRow) return;

    if (!table.querySelector("colgroup")) {
      table.insertAdjacentHTML("afterbegin", "<colgroup><col /><col /><col /><col /></colgroup>");
    }

    const headers = ["Rank", "Wallet", "Points", "Movement"];
    headerRow.innerHTML = headers.map((label) => `<th>${label}</th>`).join("");
  }

  function patchStaticDom() {
    injectStyles();
    polishCopy();
    patchDailyMetricCard();
    patchLeaderboardHeader();
  }

  function parseRank(text) {
    const match = String(text || "").match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function addressFromLink(link) {
    if (!link) return "";
    try {
      const parts = new URL(link.href).pathname.split("/").filter(Boolean);
      return parts.at(-1) || "";
    } catch {
      return "";
    }
  }

  function movementFor(address, currentRank) {
    const previousRank = movementRanks.get(address.toLowerCase());

    if (!movementDate) return { label: "-", className: "neutral" };
    if (!previousRank) return { label: "New", className: "up" };

    const movement = previousRank - currentRank;
    if (movement > 0) return { label: `+${formatNumber.format(movement)}`, className: "up" };
    if (movement < 0) return { label: `-${formatNumber.format(Math.abs(movement))}`, className: "down" };
    return { label: "0", className: "neutral" };
  }

  function patchLeaderboardRows() {
    patchLeaderboardHeader();
    document.querySelectorAll("#leaderboardRows tr").forEach((row) => {
      if (row.classList.contains("empty-row")) {
        const cell = row.querySelector("td");
        if (cell) cell.colSpan = 4;
        return;
      }

      const cells = [...row.children];
      const link = row.querySelector("a.wallet-link");
      const address = addressFromLink(link);
      const rank = parseRank(cells[0]?.textContent || row.querySelector(".wallet-badge")?.textContent);
      const points = cells[2]?.textContent.trim() || "-";
      const patchKey = `${movementDate || "none"}:${rank}:${address}:${points}`;

      if (!address || !rank || row.dataset.snapshotPatch === patchKey) return;

      const movement = movementFor(address, rank);
      row.dataset.snapshotPatch = patchKey;
      row.innerHTML = `
        <td><span class="wallet-badge leaderboard-rank-badge">${rank}</span></td>
        <td>
          <a class="wallet-link leaderboard-wallet-link" href="https://debank.com/profile/${address}" target="_blank" rel="noopener noreferrer" aria-label="Open ${address} on Debank">
            <strong>${formatAddress(address)}</strong>
            <small></small>
          </a>
        </td>
        <td>${points}</td>
        <td><span class="movement-pill ${movement.className}">${movement.label}</span></td>
      `;
    });
  }

  function computeDailyStats(snapshots) {
    const rows = snapshots
      .filter((snapshot) => typeof snapshot.date === "string" && Number.isFinite(snapshot.distributedPoints))
      .sort((a, b) => a.date.localeCompare(b.date));
    const deltas = [];

    for (let index = 1; index < rows.length; index += 1) {
      deltas.push(Math.max(0, rows[index].distributedPoints - rows[index - 1].distributedPoints));
    }

    const recentDeltas = deltas.slice(-7);
    const average = recentDeltas.length
      ? recentDeltas.reduce((sum, value) => sum + value, 0) / recentDeltas.length
      : null;

    return {
      trackedDays: rows.length,
      daily: deltas.at(-1) ?? null,
      previous: deltas.at(-2) ?? null,
      average,
      caption: rows.length < 2 ? "Need 2 backend snapshots" : `Last UTC snapshot ${rows.at(-1).date}`,
    };
  }

  function setPending(element, pending) {
    if (element) element.classList.toggle("pending-value", pending);
  }

  function applyDailyStats() {
    if (!dailyStats) return;

    const dailyText = dailyStats.daily == null ? "Need 2 days" : formatCompact.format(dailyStats.daily);
    const previousText = dailyStats.previous == null ? "Need 3 days" : formatCompact.format(dailyStats.previous);
    const averageText = dailyStats.average == null ? "Need 2 days" : formatCompact.format(dailyStats.average);

    const daily = document.querySelector("#dailyDistributed");
    const dailyMetric = document.querySelector("#dailyDistributedMetric");
    const caption = document.querySelector("#dailyDistributedCaption");
    const previous = document.querySelector("#previousDailyDistributed");
    const average = document.querySelector("#dailyAverage");
    const tracked = document.querySelector("#trackedDays");

    setElementText(daily, dailyText);
    setElementText(dailyMetric, dailyText);
    setElementText(caption, dailyStats.caption);
    setElementText(previous, previousText);
    setElementText(average, averageText);
    setElementText(tracked, formatNumber.format(dailyStats.trackedDays));

    setPending(daily, dailyStats.daily == null);
    setPending(dailyMetric, dailyStats.daily == null);
    setPending(previous, dailyStats.previous == null);
    setPending(average, dailyStats.average == null);
  }

  async function loadMovement() {
    try {
      const response = await fetch(movementEndpoint, { headers: { accept: "application/json" } });
      const data = await response.json();
      if (!data.available || !Array.isArray(data.snapshot?.rows)) return;

      movementDate = data.snapshot.date;
      movementRanks = new Map(data.snapshot.rows.map((row) => [row.address.toLowerCase(), row.rank]));
      patchLeaderboardRows();
    } catch {
      // Public UI still works without backend snapshots.
    }
  }

  async function loadDailyDistribution() {
    try {
      const response = await fetch(dailyEndpoint, { headers: { accept: "application/json" } });
      const data = await response.json();
      if (!data.available || !Array.isArray(data.snapshots)) return;

      dailyStats = computeDailyStats(data.snapshots);
      patchDailyMetricCard();
      applyDailyStats();
    } catch {
      // Fall back to the browser-local baseline from app-base.js.
    }
  }

  function observeDynamicRows() {
    const rows = document.querySelector("#leaderboardRows");
    if (rows) {
      new MutationObserver(() => requestAnimationFrame(patchLeaderboardRows)).observe(rows, {
        childList: true,
        subtree: true,
      });
    }

    const refresh = document.querySelector("#refreshData");
    if (refresh) {
      refresh.addEventListener("click", () => {
        setTimeout(loadMovement, 2200);
        setTimeout(loadDailyDistribution, 2400);
      });
    }
  }

  PatchedNumberFormat.prototype = NativeNumberFormat.prototype;
  PatchedNumberFormat.supportedLocalesOf = NativeNumberFormat.supportedLocalesOf.bind(NativeNumberFormat);
  Intl.NumberFormat = PatchedNumberFormat;

  document.addEventListener("DOMContentLoaded", patchStaticDom);

  const script = document.createElement("script");
  script.src = "app-base.js";
  script.onload = () => {
    Intl.NumberFormat = NativeNumberFormat;
    requestAnimationFrame(() => {
      patchStaticDom();
      observeDynamicRows();
      patchLeaderboardRows();
      loadMovement();
      loadDailyDistribution();
      setTimeout(loadMovement, 2200);
      setTimeout(loadDailyDistribution, 2400);
      setInterval(loadMovement, 60_000);
      setInterval(loadDailyDistribution, 60_000);
    });
  };
  script.onerror = () => {
    Intl.NumberFormat = NativeNumberFormat;
    requestAnimationFrame(patchStaticDom);
  };
  document.head.appendChild(script);
})();