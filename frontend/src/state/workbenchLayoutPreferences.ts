export type WorkbenchLayoutPreferences = {
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  graphFocusMode: boolean;
};

export const defaultWorkbenchLayoutPreferences: WorkbenchLayoutPreferences = {
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  graphFocusMode: false
};

const layoutPreferencesStorageKey = "graphmind.workbench.layout";

export function readWorkbenchLayoutPreferences(): WorkbenchLayoutPreferences {
  if (typeof window === "undefined") {
    return defaultWorkbenchLayoutPreferences;
  }
  try {
    const rawValue = window.localStorage.getItem(layoutPreferencesStorageKey);
    if (!rawValue) {
      return defaultWorkbenchLayoutPreferences;
    }
    return normalizeLayoutPreferences(JSON.parse(rawValue));
  } catch {
    return defaultWorkbenchLayoutPreferences;
  }
}

export function persistWorkbenchLayoutPreferences(preferences: WorkbenchLayoutPreferences) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      layoutPreferencesStorageKey,
      JSON.stringify(normalizeLayoutPreferences(preferences))
    );
  } catch {
    // Local storage may be blocked; layout still works for the current session.
  }
}

function normalizeLayoutPreferences(value: unknown): WorkbenchLayoutPreferences {
  if (!value || typeof value !== "object") {
    return defaultWorkbenchLayoutPreferences;
  }
  const preferences = value as Partial<WorkbenchLayoutPreferences>;
  const graphFocusMode = preferences.graphFocusMode === true;
  return {
    leftPanelCollapsed: graphFocusMode || preferences.leftPanelCollapsed === true,
    rightPanelCollapsed: graphFocusMode || preferences.rightPanelCollapsed === true,
    graphFocusMode
  };
}
