/* Light/dark theme (the pre-paint half lives inline in each page <head>). */

export const Theme = {
  KEY: "app-theme",
  current() {
    const set = document.documentElement.getAttribute("data-theme");
    if (set === "dark" || set === "light") return set;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  },
  set(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(Theme.KEY, next); } catch (_) {}
    Theme.sync();
  },
  toggle() { Theme.set(Theme.current() === "dark" ? "light" : "dark"); },
  sync() {
    const dark = Theme.current() === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      btn.title = dark ? "Switch to light theme" : "Switch to dark theme";
    });
    document.querySelectorAll('meta[name="theme-color"]:not([media])').forEach((m) => {
      m.setAttribute("content", dark ? "#09090b" : "#ffffff");
    });
  },
  init() {
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => btn.addEventListener("click", Theme.toggle));
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", Theme.sync);
    Theme.sync();
  },
};
