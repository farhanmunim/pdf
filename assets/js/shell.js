/* App shell, loaded on every page: theme toggle, dialogs, toolbar keys. */
import { Theme } from "./shell/theme.js";
import { Dialogs } from "./shell/dialogs.js";
import { Toolbars } from "./shell/toolbars.js";

function boot() {
  Theme.init();
  Dialogs.init();
  Toolbars.init();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
