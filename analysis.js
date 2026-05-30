(() => {
  const script = document.createElement("script");
  let polishing = false;

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

  function polishFdvLabels() {
    if (polishing || !document.body) return;
    polishing = true;

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

  script.src = "analysis-base.js";
  script.onload = startPolish;
  script.onerror = startPolish;
  document.head.appendChild(script);
})();
