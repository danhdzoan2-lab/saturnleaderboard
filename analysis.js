(() => {
  const script = document.createElement("script");

  function replaceText(selector, replacements) {
    document.querySelectorAll(selector).forEach((element) => {
      let text = element.textContent;
      replacements.forEach(([from, to]) => {
        text = text.replace(from, to);
      });
      element.textContent = text;
    });
  }

  function polishFdvLabels() {
    replaceText(".metric-card small", [[/^Base:\s*/i, "$500M FDV - "]]);
    replaceText(".moonsheet-highlight small", [[/^Base\s+airdrop/i, "$500M airdrop"]]);

    const focusCase = document.querySelector("#scenarioFocusCase");
    if (focusCase && /^Base\b/i.test(focusCase.textContent.trim())) {
      focusCase.textContent = "$500M FDV";
    }

    document.querySelectorAll("#fdvScenarioSelect option").forEach((option) => {
      option.textContent = option.textContent
        .replace(/^Base\s*-\s*\$500M\s+FDV/i, "$500M FDV")
        .replace(/^Base\b/i, "$500M");
    });

    document.querySelectorAll("#fdvScenarioRows tr").forEach((row) => {
      const label = row.querySelector("td:first-child strong");
      if (label?.textContent.trim() === "Base") {
        label.textContent = "$500M";
      }
      const ariaLabel = row.getAttribute("aria-label");
      if (ariaLabel?.startsWith("Base FDV")) {
        row.setAttribute("aria-label", ariaLabel.replace(/^Base FDV/i, "$500M FDV"));
      }
    });
  }

  function startPolish() {
    polishFdvLabels();
    new MutationObserver(polishFdvLabels).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  script.src = "analysis-base.js";
  script.onload = startPolish;
  script.onerror = startPolish;
  document.head.appendChild(script);
})();
