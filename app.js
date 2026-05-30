(() => {
  const NativeNumberFormat = Intl.NumberFormat;

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

  function setText(selector, text) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim() !== text) element.textContent = text;
  }

  function polishCopy() {
    setText(".hero-grid h1", "Saturn points command center");
    const copy = document.querySelector(".hero-copy");
    if (copy) copy.textContent = "Leaderboard totals, wallet lookup, and point velocity from public Saturn data.";
    const title = document.querySelector("#walletStatusTitle");
    if (title && title.textContent.trim() === "Public wallet tracking") {
      title.textContent = "Lookup wallet, rank, or points";
    }
    document.querySelectorAll("#chartFill stop").forEach((stop) => {
      stop.setAttribute("stop-color", "#ff5a14");
    });
  }

  PatchedNumberFormat.prototype = NativeNumberFormat.prototype;
  PatchedNumberFormat.supportedLocalesOf = NativeNumberFormat.supportedLocalesOf.bind(NativeNumberFormat);
  Intl.NumberFormat = PatchedNumberFormat;

  document.addEventListener("DOMContentLoaded", polishCopy);

  const script = document.createElement("script");
  script.src = "app-base.js";
  script.onload = () => {
    Intl.NumberFormat = NativeNumberFormat;
    requestAnimationFrame(polishCopy);
  };
  script.onerror = () => {
    Intl.NumberFormat = NativeNumberFormat;
    requestAnimationFrame(polishCopy);
  };
  document.head.appendChild(script);
})();
