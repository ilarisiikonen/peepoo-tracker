(() => {
  const preferenceKey = "peepoo-tracker-theme";
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

  function getPreference() {
    const preference = localStorage.getItem(preferenceKey);
    return ["auto", "light", "dark"].includes(preference) ? preference : "auto";
  }

  function apply(preference = getPreference()) {
    const useDarkTheme = preference === "dark" || (preference === "auto" && colorScheme.matches);
    document.documentElement.dataset.theme = useDarkTheme ? "dark" : "light";
  }

  function setPreference(preference) {
    localStorage.setItem(preferenceKey, preference);
    apply(preference);
  }

  colorScheme.addEventListener("change", () => {
    if (getPreference() === "auto") apply("auto");
  });

  window.PeepooTheme = { getPreference, setPreference, apply };
  apply();
})();