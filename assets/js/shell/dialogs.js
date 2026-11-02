/* Native <dialog> wiring. */

/* <button data-dialog-open="id"> opens <dialog id>; [data-dialog-close] closes
   the nearest dialog; clicking the backdrop closes too. Focus returns to the
   opener automatically via the native <dialog> behaviour. */
export const Dialogs = {
  init() {
    document.querySelectorAll("[data-dialog-open]").forEach((btn) => {
      const dialog = document.getElementById(btn.dataset.dialogOpen);
      if (!dialog) return;
      btn.addEventListener("click", () => {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      });
    });
    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.querySelectorAll("[data-dialog-close]").forEach((b) => b.addEventListener("click", () => dialog.close()));
      dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    });
  },
};
