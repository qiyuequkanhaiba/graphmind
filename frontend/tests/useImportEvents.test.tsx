import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useImportEvents } from "../src/state/useImportEvents";
import type { ImportEvent } from "../src/api/types";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners[type] ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

function Harness({
  projectId,
  onEvent
}: {
  projectId: number | null;
  onEvent: (event: ImportEvent) => void;
}) {
  useImportEvents(projectId, onEvent);
  return null;
}

describe("useImportEvents", () => {
  afterEach(() => {
    FakeEventSource.instances = [];
    vi.unstubAllGlobals();
  });

  it("subscribes to import job snapshots and closes on unmount", async () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const onEvent = vi.fn();

    const rendered = render(<Harness projectId={42} onEvent={onEvent} />);

    expect(FakeEventSource.instances[0].url).toBe("/api/projects/42/import-events");
    FakeEventSource.instances[0].emit("import_job_snapshot", {
      type: "import_job_snapshot",
      jobs: [{ id: 7, label: "customers.csv" }]
    });

    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({
        type: "import_job_snapshot",
        jobs: [{ id: 7, label: "customers.csv" }]
      });
    });

    rendered.unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it("does nothing when EventSource is unavailable", () => {
    const onEvent = vi.fn();

    render(<Harness projectId={42} onEvent={onEvent} />);

    expect(FakeEventSource.instances).toEqual([]);
  });
});
