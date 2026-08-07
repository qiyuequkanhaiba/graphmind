import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const motionMocks = vi.hoisted(() => ({
  configs: [],
  fromTo: vi.fn(),
  registerPlugin: vi.fn(),
  revert: vi.fn()
}));

vi.mock("gsap", () => ({
  default: {
    fromTo: motionMocks.fromTo,
    registerPlugin: motionMocks.registerPlugin
  }
}));

vi.mock("@gsap/react", async () => {
  const React = await vi.importActual("react");
  return {
    useGSAP(callback, config) {
      motionMocks.configs.push(config);
      React.useLayoutEffect(() => {
        callback();
        return () => motionMocks.revert();
      }, config.dependencies ?? []);
    }
  };
});

import {
  motionDurations,
  motionEase,
  motionOffsets,
  shouldReduceMotion
} from "../src/motion/tokens";
import {
  useDialogEntranceMotion,
  usePanelEntranceMotion,
  useStaggeredListMotion
} from "../src/motion/useWorkbenchMotion";

const originalUserAgent = window.navigator.userAgent;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  motionMocks.configs.length = 0;
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: originalUserAgent
  });
});

describe("GSAP motion system", () => {
  it("defines shared product motion tokens", () => {
    expect(motionDurations.panel).toBeGreaterThan(0);
    expect(motionDurations.reduced).toBe(0);
    expect(motionEase.entrance).toBe("power2.out");
    expect(motionOffsets.panelY).toBeGreaterThan(0);
  });

  it("detects reduced-motion preference", () => {
    useBrowserUserAgent();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    expect(shouldReduceMotion()).toBe(true);
  });

  it("scopes panel motion, reruns on its key, and cleans up on update and unmount", () => {
    useBrowserUserAgent();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    const view = render(<PanelHarness motionKey="first" />);
    const panel = view.getByTestId("motion-panel");

    expect(motionMocks.configs[0]).toMatchObject({ revertOnUpdate: true });
    expect(motionMocks.configs[0].scope.current).toBe(panel);
    expect(motionMocks.fromTo).toHaveBeenCalledWith(
      panel,
      expect.objectContaining({ autoAlpha: 0, y: motionOffsets.panelY }),
      expect.objectContaining({
        autoAlpha: 1,
        clearProps: "transform,visibility",
        duration: motionDurations.panel,
        y: 0
      })
    );

    view.rerender(<PanelHarness motionKey="second" />);
    expect(motionMocks.revert).toHaveBeenCalledTimes(1);
    expect(motionMocks.fromTo).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(motionMocks.revert).toHaveBeenCalledTimes(2);
  });

  it("renders dialog and list motion with zero-duration reduced-motion values", () => {
    useBrowserUserAgent();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const view = render(<DialogAndListHarness />);

    expect(motionMocks.fromTo).toHaveBeenCalledWith(
      view.getByTestId("motion-dialog"),
      expect.objectContaining({ opacity: 1, scale: 0.99, y: 0 }),
      expect.objectContaining({ duration: 0, opacity: 1, scale: 1, y: 0 })
    );
    expect(motionMocks.fromTo).toHaveBeenCalledWith(
      ".motion-item",
      expect.objectContaining({ autoAlpha: 1, y: 0 }),
      expect.objectContaining({ duration: 0, stagger: 0 })
    );
  });
});

function PanelHarness({ motionKey }) {
  const ref = useRef(null);
  usePanelEntranceMotion(ref, motionKey);
  return <section data-testid="motion-panel" ref={ref} />;
}

function DialogAndListHarness() {
  const dialogRef = useRef(null);
  const listRef = useRef(null);
  useDialogEntranceMotion(dialogRef);
  useStaggeredListMotion(listRef, ".motion-item", "items");
  return (
    <>
      <section data-testid="motion-dialog" ref={dialogRef} />
      <ul ref={listRef}>
        <li className="motion-item">Item</li>
      </ul>
    </>
  );
}

function useBrowserUserAgent() {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "Chrome"
  });
}
