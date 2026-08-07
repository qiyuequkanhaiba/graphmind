import "@testing-library/jest-dom/vitest";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererSpies = vi.hoisted(() => ({
  dispose: vi.fn(),
  render: vi.fn(),
  setPixelRatio: vi.fn(),
  setSize: vi.fn()
}));

vi.mock("three/src/renderers/WebGLRenderer.js", () => ({
  WebGLRenderer: class {
    dispose = rendererSpies.dispose;
    render = rendererSpies.render;
    setPixelRatio = rendererSpies.setPixelRatio;
    setSize = rendererSpies.setSize;
  }
}));

import { BufferGeometry } from "three/src/core/BufferGeometry.js";
import { LineBasicMaterial } from "three/src/materials/LineBasicMaterial.js";
import { MeshStandardMaterial } from "three/src/materials/MeshStandardMaterial.js";
import GraphCanvas3D from "../src/components/graph/GraphCanvas3D";

const graph = {
  nodes: [
    {
      id: 1,
      node_type: "table" as const,
      label: "Orders",
      source_ref: "orders",
      metadata: {},
      position_x: 0,
      position_y: 0
    }
  ],
  edges: [
    {
      id: 2,
      source_node_id: 1,
      target_node_id: 1,
      edge_type: "foreign_key",
      confidence: 0.9,
      status: "accepted",
      evidence_ref: "orders.customer_id",
      created_from_suggestion_id: null,
      metadata: {},
      evidence_summary: null,
      evidence_payload: null
    }
  ]
};
const originalUserAgent = window.navigator.userAgent;

describe("GraphCanvas3D lifecycle", () => {
  let mediaQuery: MediaQueryList;
  let mediaChangeListener: ((event: MediaQueryListEvent) => void) | null;

  beforeEach(() => {
    mediaChangeListener = null;
    mediaQuery = {
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn((_type, listener) => {
        mediaChangeListener = listener as (event: MediaQueryListEvent) => void;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    };
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Chrome"
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(_callback: IntersectionObserverCallback) {}
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 41);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.values(rendererSpies).forEach((spy) => spy.mockClear());
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent
    });
  });

  it("uses a static frame for reduced motion and disposes all owned resources", () => {
    Object.defineProperty(mediaQuery, "matches", { configurable: true, value: true });
    const lineDispose = vi.spyOn(LineBasicMaterial.prototype, "dispose");
    const meshDispose = vi.spyOn(MeshStandardMaterial.prototype, "dispose");
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");

    const view = render(<GraphCanvas3D graph={graph} language="zh-CN" />);

    expect(rendererSpies.render).toHaveBeenCalled();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    view.unmount();

    expect(lineDispose).toHaveBeenCalledTimes(1);
    expect(meshDispose).toHaveBeenCalledTimes(6);
    expect(geometryDispose).toHaveBeenCalledTimes(2);
    expect(rendererSpies.dispose).toHaveBeenCalledTimes(1);
  });

  it("cancels continuous rendering when reduced motion becomes active", () => {
    render(<GraphCanvas3D graph={graph} language="en-US" />);
    expect(window.requestAnimationFrame).toHaveBeenCalled();

    Object.defineProperty(mediaQuery, "matches", { configurable: true, value: true });
    act(() => {
      mediaChangeListener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(41);
    expect(rendererSpies.render).toHaveBeenCalled();
  });
});
