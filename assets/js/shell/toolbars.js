/* WAI-ARIA toolbar keyboard navigation. */

/* Arrow-key navigation between buttons inside role="toolbar" (WAI-ARIA
   toolbar pattern). Inputs and selects keep their own arrow behaviour. */
export const Toolbars = {
  init() {
    document.querySelectorAll('[role="toolbar"]').forEach((tb) => {
      tb.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        if (!(e.target instanceof HTMLButtonElement)) return;
        const items = Array.from(tb.querySelectorAll("button, select, input")).filter(
          (el) => !el.disabled && !el.hidden && el.offsetParent !== null && el.tabIndex >= 0
        );
        const i = items.indexOf(e.target);
        if (i === -1) return;
        e.preventDefault();
        const next = items[(i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
        next.focus();
      });
    });
  },
};
