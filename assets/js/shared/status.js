/* Status line helper and screen-reader announcements. */

export function makeStatus(el) {
  return {
    info(msg) { el.classList.remove("error"); el.textContent = msg; },
    busy(msg) {
      el.classList.remove("error");
      el.textContent = "";
      const s = document.createElement("span");
      s.className = "spinner";
      s.setAttribute("aria-hidden", "true");
      el.append(s, msg);
    },
    error(msg) { el.classList.add("error"); el.textContent = msg; },
    clear() { el.classList.remove("error"); el.textContent = ""; },
  };
}

/* Screen-reader announcements that don't need to be visible. */
let announcer = null;

export function announce(msg) {
  if (!announcer) {
    announcer = document.createElement("div");
    announcer.className = "visually-hidden";
    announcer.setAttribute("role", "status");
    announcer.setAttribute("aria-live", "polite");
    document.body.appendChild(announcer);
  }
  announcer.textContent = "";
  // Re-insert on the next frame so identical messages are re-announced.
  requestAnimationFrame(() => { announcer.textContent = msg; });
}
