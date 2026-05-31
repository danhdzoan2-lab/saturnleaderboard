(() => {
  const NativeNumberFormat = Intl.NumberFormat;
  const WALLET_STORAGE_KEY = "saturn:farm-wallets:v1";
  const script = document.createElement("script");
  let polishing = false;

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

  function restoreNumberFormat() {
    Intl.NumberFormat = NativeNumberFormat;
  }

  function setTextIfChanged(element, nextText) {
    if (element && element.textContent !== nextText) {
      element.textContent = nextText;
    }
  }

  function replaceText(selector, replacements) {
    document.querySelectorAll(selector).forEach((element) => {
      const current = element.textContent;
      let next = current;

      replacements.forEach(([from, to]) => {
        next = next.replace(from, to);
      });

      setTextIfChanged(element, next);
    });
  }

  function isWalletAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
  }

  function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function readSavedWallets() {
    try {
      const rows = JSON.parse(localStorage.getItem(WALLET_STORAGE_KEY) || "[]");
      if (!Array.isArray(rows)) return [];

      return rows
        .map((row) => (typeof row === "string" ? row : row?.address))
        .filter((address) => typeof address === "string" && isWalletAddress(address));
    } catch {
      return [];
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  function injectAirdropStyles() {
    if (document.querySelector("#airdrop-polish")) return;

    const style = document.createElement("style");
    style.id = "airdrop-polish";
    style.textContent = `
      .wallet-manager-card.is-collapsed > p{display:none}
      .wallet-summary{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:24px;padding:15px;border:1px solid var(--line);border-radius:18px;background:rgba(0,0,0,.18)}
      .wallet-summary[hidden]{display:none!important}
      .wallet-summary div:first-child{display:grid;gap:5px;min-width:0}
      .wallet-summary small{color:var(--muted);font-family:var(--font-mono);font-size:.72rem;letter-spacing:.12em;text-transform:uppercase}
      .wallet-summary strong{font-size:1.05rem}
      .wallet-summary span{display:block;overflow:hidden;color:var(--muted);font-family:var(--font-mono);font-size:.78rem;text-overflow:ellipsis;white-space:nowrap}
      .wallet-summary-actions{display:flex;flex:0 0 auto;gap:10px}
      .allocation-row-header small:empty,.wallet-cell small:empty{display:none!important}
      .moonsheet-grid article{display:flex;flex-direction:column;justify-content:space-between}
      .moonsheet-grid small{min-height:2.25em}
      .moonsheet-grid strong{margin-top:12px}
      .scenario-picker{margin-top:16px}
      .scenario-picker label{gap:10px}
      .scenario-picker select{box-shadow:inset 0 0 0 1px rgba(255,255,255,.025);padding:16px 48px 16px 16px}
      .scenario-picker label::after{content:"";right:18px;bottom:19px;width:8px;height:8px;border-right:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:rotate(45deg)}
      .scenario-table{min-width:560px}
      .scenario-table th:nth-child(3),.scenario-table td:nth-child(3),.scenario-table th:nth-child(4),.scenario-table td:nth-child(4){display:none}
      .assumptions-disclosure{margin-top:14px}
      .assumptions-copy{margin:0;padding:0 16px 16px;color:var(--muted);font-weight:700;line-height:1.6}
      @media(max-width:640px){.wallet-summary{align-items:stretch;flex-direction:column}.wallet-summary-actions>*{flex:1}.moonsheet-grid small{min-height:0}}
    `;
    document.head.appendChild(style);
  }

  function ensureWalletSummary() {
    const card = document.querySelector(".wallet-manager-card");
    const form = document.querySelector("#walletManagerForm");
    if (!card || !form) return null;

    let summary = document.querySelector("#walletSummary");
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "wallet-summary";
      summary.id = "walletSummary";
      summary.hidden = true;
      summary.innerHTML = `
        <div>
          <small>Wallets saved</small>
          <strong id="walletSummaryCount">No wallets saved</strong>
          <span id="walletSummaryPreview">Add wallets to start tracking.</span>
        </div>
        <div class="wallet-summary-actions">
          <button class="ghost-btn compact-action" id="copyWalletsCompact" type="button">Copy</button>
          <button class="ghost-btn compact-action" id="editWallets" type="button">Edit wallets</button>
        </div>
      `;
      form.parentNode.insertBefore(summary, form);
    }

    const copyButton = summary.querySelector("#copyWalletsCompact");
    const editButton = summary.querySelector("#editWallets");

    if (copyButton && !copyButton.dataset.bound) {
      copyButton.dataset.bound = "true";
      copyButton.addEventListener("click", async () => {
        const original = copyButton.textContent;
        const wallets = readSavedWallets();
        await copyText(wallets.join("\n"));
        copyButton.textContent = "Copied";
        setTimeout(() => {
          copyButton.textContent = original;
        }, 1200);
      });
    }

    if (editButton && !editButton.dataset.bound) {
      editButton.dataset.bound = "true";
      editButton.addEventListener("click", () => {
        card.dataset.editing = "true";
        updateWalletSummary();
        document.querySelector("#walletListInput")?.focus();
      });
    }

    if (!form.dataset.summaryBound) {
      form.dataset.summaryBound = "true";
      form.addEventListener("submit", () => {
        card.dataset.editing = "false";
        setTimeout(updateWalletSummary, 80);
      });
      document.querySelector("#clearWallets")?.addEventListener("click", () => {
        card.dataset.editing = "true";
        setTimeout(updateWalletSummary, 80);
      });
    }

    return summary;
  }

  function updateWalletSummary() {
    const card = document.querySelector(".wallet-manager-card");
    const form = document.querySelector("#walletManagerForm");
    const summary = ensureWalletSummary();
    if (!card || !form || !summary) return;

    const wallets = readSavedWallets();
    const hasWallets = wallets.length > 0;
    const editing = card.dataset.editing === "true" || !hasWallets;
    const collapsed = hasWallets && !editing;
    const preview = wallets.slice(0, 3).map(formatAddress).join("   ");
    const hiddenCount = Math.max(0, wallets.length - 3);

    card.classList.toggle("is-collapsed", collapsed);
    summary.hidden = !collapsed;
    form.hidden = collapsed;

    setTextIfChanged(
      summary.querySelector("#walletSummaryCount"),
      `${wallets.length} wallet${wallets.length === 1 ? "" : "s"} saved`,
    );
    setTextIfChanged(
      summary.querySelector("#walletSummaryPreview"),
      `${preview}${hiddenCount > 0 ? `   +${hiddenCount} more` : ""}` || "Add wallets to start tracking.",
    );
  }

  function patchNamedWalletRows() {
    document.querySelectorAll(".allocation-row").forEach((row) => {
      const strong = row.querySelector(".allocation-row-header strong");
      const small = row.querySelector(".allocation-row-header small");
      const addressLabel = small?.textContent.trim();

      if (strong && addressLabel && /^Wallet\s+\d+$/i.test(strong.textContent.trim())) {
        setTextIfChanged(strong, addressLabel);
        setTextIfChanged(small, "");
      }
    });

    document.querySelectorAll("#farmRows tr").forEach((row) => {
      const strong = row.querySelector(".wallet-cell strong");
      const small = row.querySelector(".wallet-cell small");
      const address = small?.textContent.trim();

      if (strong && address && /^Wallet\s+\d+$/i.test(strong.textContent.trim())) {
        setTextIfChanged(strong, isWalletAddress(address) ? formatAddress(address) : address);
        setTextIfChanged(small, "");
      }
    });
  }

  function patchAssumptionsDisclosure() {
    const panel = document.querySelector(".moonsheet-panel");
    const note = panel?.querySelector(".moonsheet-note");
    if (!panel || !note) return;

    let disclosure = panel.querySelector("#assumptionsDisclosure");
    if (!disclosure) {
      disclosure = document.createElement("details");
      disclosure.className = "scenario-disclosure assumptions-disclosure";
      disclosure.id = "assumptionsDisclosure";
      disclosure.innerHTML = `
        <summary>
          <span>Assumptions</span>
          <strong>Projection details</strong>
        </summary>
        <p class="assumptions-copy"></p>
      `;
      note.after(disclosure);
    }

    const copy = note.textContent.trim();
    if (copy) setTextIfChanged(disclosure.querySelector(".assumptions-copy"), copy);
    note.hidden = true;
  }

  function polishStaticCopy() {
    setTextIfChanged(document.querySelector(".farm-hero .hero-grid h1"), "Analyze your Saturn farm");
    setTextIfChanged(document.querySelector(".farm-dashboard > .content-grid h2"), "Allocation");
    const copy = document.querySelector(".farm-hero .hero-copy");
    if (copy) {
      setTextIfChanged(
        copy,
        "Save multiple public wallet addresses, total their Saturn points, compare contribution, and inspect airdrop scenarios."
      );
    }
    setTextIfChanged(document.querySelector(".wallet-manager-card .card-label"), "/ Saved Wallet List");
    setTextIfChanged(document.querySelector(".moonsheet-panel .card-label"), "/ Airdrop Estimate");
  }

  function polishScenarioTable() {
    setTextIfChanged(document.querySelector(".scenario-table thead th:first-child"), "FDV");
  }

  function polishFdvLabels() {
    if (polishing || !document.body) return;
    polishing = true;

    injectAirdropStyles();
    polishStaticCopy();
    polishScenarioTable();
    updateWalletSummary();
    patchNamedWalletRows();
    patchAssumptionsDisclosure();
    replaceText(".metric-card small", [[/^Base:\s*/i, "$500M FDV - "]]);
    replaceText(".moonsheet-highlight small", [[/^Base\s+airdrop/i, "$500M airdrop"]]);

    const focusCase = document.querySelector("#scenarioFocusCase");
    if (focusCase && /^Base\b/i.test(focusCase.textContent.trim())) {
      setTextIfChanged(focusCase, "$500M FDV");
    }

    document.querySelectorAll("#fdvScenarioSelect option").forEach((option) => {
      const next = option.textContent
        .replace(/^Base\s*-\s*\$500M\s+FDV/i, "$500M FDV")
        .replace(/^Base\b/i, "$500M");
      setTextIfChanged(option, next);
    });

    document.querySelectorAll("#fdvScenarioRows tr").forEach((row) => {
      const label = row.querySelector("td:first-child strong");
      if (label?.textContent.trim() === "Base") {
        setTextIfChanged(label, "$500M");
      }

      const ariaLabel = row.getAttribute("aria-label");
      if (ariaLabel?.startsWith("Base FDV")) {
        const next = ariaLabel.replace(/^Base FDV/i, "$500M FDV");
        if (ariaLabel !== next) row.setAttribute("aria-label", next);
      }
    });

    polishing = false;
  }

  function startPolish() {
    polishFdvLabels();
    new MutationObserver(() => requestAnimationFrame(polishFdvLabels)).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  PatchedNumberFormat.prototype = NativeNumberFormat.prototype;
  PatchedNumberFormat.supportedLocalesOf = NativeNumberFormat.supportedLocalesOf.bind(NativeNumberFormat);
  Intl.NumberFormat = PatchedNumberFormat;

  script.src = "analysis-base.js";
  script.onload = () => {
    restoreNumberFormat();
    startPolish();
  };
  script.onerror = () => {
    restoreNumberFormat();
    startPolish();
  };
  document.head.appendChild(script);
})();