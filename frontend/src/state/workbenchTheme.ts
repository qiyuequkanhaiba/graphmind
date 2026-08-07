export type WorkbenchTheme = "dark" | "light";

export const defaultWorkbenchTheme: WorkbenchTheme = "dark";

const workbenchThemeStorageKey = "graphmind.workbench.theme";

export function readWorkbenchTheme(): WorkbenchTheme {
  if (typeof window === "undefined") {
    return defaultWorkbenchTheme;
  }
  try {
    return normalizeWorkbenchTheme(window.localStorage.getItem(workbenchThemeStorageKey));
  } catch {
    return defaultWorkbenchTheme;
  }
}

export function persistWorkbenchTheme(theme: WorkbenchTheme) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(workbenchThemeStorageKey, normalizeWorkbenchTheme(theme));
  } catch {
    // Storage can be unavailable; keep the in-session theme active.
  }
}

function normalizeWorkbenchTheme(value: unknown): WorkbenchTheme {
  return value === "light" ? "light" : defaultWorkbenchTheme;
}
