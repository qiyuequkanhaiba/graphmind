import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistWorkbenchTheme, readWorkbenchTheme } from "../src/state/workbenchTheme";

const localStorageStub = (() => {
  let values: Record<string, string> = {};
  return {
    clear: () => {
      values = {};
    },
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    }
  };
})();

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageStub
});

describe("workbench theme preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to the dark product theme", () => {
    expect(readWorkbenchTheme()).toBe("dark");
  });

  it("reads and persists the light theme preference", () => {
    persistWorkbenchTheme("light");

    expect(window.localStorage.getItem("graphmind.workbench.theme")).toBe("light");
    expect(readWorkbenchTheme()).toBe("light");
  });

  it("falls back to dark when storage contains an unsupported value", () => {
    window.localStorage.setItem("graphmind.workbench.theme", "system");

    expect(readWorkbenchTheme()).toBe("dark");
  });

  it("keeps the UI usable when storage writes are blocked", () => {
    const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => persistWorkbenchTheme("light")).not.toThrow();

    setItemSpy.mockRestore();
  });
});
