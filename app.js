(() => {
  const NativeNumberFormat = Intl.NumberFormat;

  function normalizeOptions(options) {
    if (!options || typeof options !== "object") return options;
    const next = { ...options };

    if (next.maximumFractionDigits === 3) {
      next.maximumFractionDigits = 0;
    }

    if (next.notation === "compact" && !next.style) {
      next.maximumFractionDigits = 0;
    }

    return next;
  }

  function PatchedNumberFormat(locales, options) {
    return new NativeNumberFormat(locales, normalizeOptions(options));
  }

  PatchedNumberFormat.prototype = NativeNumberFormat.prototype;
  PatchedNumberFormat.supportedLocalesOf = NativeNumberFormat.supportedLocalesOf.bind(NativeNumberFormat);
  Intl.NumberFormat = PatchedNumberFormat;

  const script = document.createElement("script");
  script.src = "app-base.js";
  script.onload = () => {
    Intl.NumberFormat = NativeNumberFormat;
  };
  script.onerror = () => {
    Intl.NumberFormat = NativeNumberFormat;
  };
  document.head.appendChild(script);
})();
