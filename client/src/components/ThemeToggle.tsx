import { useEffect } from "react";

const STORAGE_KEY = "smbify-lead-theme";

/**
 * Dark mode has been removed. This cleanup hook removes any
 * stale dark-mode state left in localStorage / DOM.
 */
export function useThemeCleanup() {
  useEffect(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
  }, []);
}

/** No-op placeholder — dark mode toggle has been removed. */
export function ThemeToggle() {
  useThemeCleanup();
  return null;
}
