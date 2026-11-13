/** Sets `.dark` on `<html>` from the system colour scheme, and follows changes. */
export const THEME_SCRIPT =
  "(function(){var m=window.matchMedia('(prefers-color-scheme: dark)');function a(){document.documentElement.classList.toggle('dark',m.matches)}a();m.addEventListener('change',a)})();";
