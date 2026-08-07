import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultWorkbenchLayoutPreferences,
  persistWorkbenchLayoutPreferences,
  readWorkbenchLayoutPreferences
} from "../src/state/workbenchLayoutPreferences";

const localStorageStub = (() => {
  let values: Record<string, string> = {};
  return {
    clear: () => {
      values = {};
    },
    getItem: (key: string) => values[key] ?? null,
    removeItem: (key: string) => {
      delete values[key];
    },
    setItem: (key: string, value: string) => {
      values[key] = value;
    }
  };
})();

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageStub
});

describe("workbench layout preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when no layout preferences exist", () => {
    expect(readWorkbenchLayoutPreferences()).toEqual(defaultWorkbenchLayoutPreferences);
  });

  it("persists collapsed panel and focus mode preferences", () => {
    persistWorkbenchLayoutPreferences({
      leftPanelCollapsed: true,
      rightPanelCollapsed: false,
      graphFocusMode: false
    });

    expect(readWorkbenchLayoutPreferences()).toEqual({
      leftPanelCollapsed: true,
      rightPanelCollapsed: false,
      graphFocusMode: false
    });
  });

  it("forces both side rails closed when focus mode is restored", () => {
    window.localStorage.setItem(
      "graphmind.workbench.layout",
      JSON.stringify({
        leftPanelCollapsed: false,
        rightPanelCollapsed: false,
        graphFocusMode: true
      })
    );

    expect(readWorkbenchLayoutPreferences()).toEqual({
      leftPanelCollapsed: true,
      rightPanelCollapsed: true,
      graphFocusMode: true
    });
  });

  it("falls back to defaults for invalid stored JSON", () => {
    window.localStorage.setItem("graphmind.workbench.layout", "{");

    expect(readWorkbenchLayoutPreferences()).toEqual(defaultWorkbenchLayoutPreferences);
  });
});
