import { describe, expect, it, vi } from "vitest";
import {
  buildImportHealthOverview,
  buildImportHealthQueue,
  type ImportHealthOverview
} from "../src/components/importHealth";
import type { MessageKey } from "../src/i18n/messages";

const health: ImportHealthOverview = {
  status: "attention",
  sourceKindCount: 2,
  failedTaskCount: 1,
  pendingReviewCount: 2,
  highPriorityCount: 3,
  duplicateSuggestionCount: 4,
  multiSourceRelationshipCount: 5,
  extractedHighPriorityCount: 6,
  staleImportJobCount: 0,
  ignoredFileCount: 7
};

function t(key: MessageKey, values?: Record<string, string | number>): string {
  const count = values?.count;
  return count === undefined ? key : `${key}:${count}`;
}

describe("buildImportHealthQueue", () => {
  it("keeps import health queue priority stable and recommends the first item", () => {
    const queue = buildImportHealthQueue(
      health,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      t
    );

    expect(queue.map((item) => item.key)).toEqual([
      "failures",
      "pending",
      "highPriority",
      "duplicates"
    ]);
    expect(queue.map((item) => item.countLabel)).toEqual([
      "import.health.failures:1",
      "import.health.pending:2",
      "import.health.highPriority:3",
      "import.health.duplicates:4"
    ]);
    expect(queue.map((item) => Boolean(item.recommended))).toEqual([true, false, false, false]);
  });

  it("recommends recovering queued import jobs before other health work", () => {
    const onRecover = vi.fn();
    const queue = buildImportHealthQueue(
      health,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      t,
      { activeImportJobCount: 2, onRecover }
    );

    expect(queue.map((item) => item.key)).toEqual([
      "recoverJobs",
      "failures",
      "pending",
      "highPriority",
      "duplicates"
    ]);
    expect(queue[0]).toMatchObject({
      actionLabel: "import.health.action.recoverJobs",
      countLabel: "import.health.queue.recoverJobs.count:2",
      label: "import.health.queue.recoverJobs",
      recommended: true
    });
    expect(queue.slice(1).every((item) => item.recommended !== true)).toBe(true);
    queue[0]?.onClick();
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("marks recovery queue work disabled while recovery is already running", () => {
    const queue = buildImportHealthQueue(
      health,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      t,
      { activeImportJobCount: 2, disabled: true, onRecover: vi.fn() }
    );

    expect(queue[0]).toMatchObject({
      disabled: true,
      key: "recoverJobs"
    });
    expect(queue.slice(1).every((item) => item.disabled !== true)).toBe(true);
  });

  it("recommends the highest-priority available item when failures are absent", () => {
    const queue = buildImportHealthQueue(
      { ...health, failedTaskCount: 0 },
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      t
    );

    expect(queue.map((item) => item.key)).toEqual(["pending", "highPriority", "duplicates"]);
    expect(queue[0]?.recommended).toBe(true);
  });
});

describe("buildImportHealthOverview", () => {
  it("returns waiting when there is no import signal", () => {
    expect(
      buildImportHealthOverview(
        {
          tableCount: 0,
          fieldCount: 0,
          suggestionCount: 0,
          pendingSuggestionCount: 0,
          graphNodeCount: 0,
          graphEdgeCount: 0
        },
        [],
        [],
        [],
        null
      )
    ).toMatchObject({
      extractedHighPriorityCount: 0,
      failedTaskCount: 0,
      highPriorityCount: 0,
      ignoredFileCount: 0,
      multiSourceRelationshipCount: 0,
      pendingReviewCount: 0,
      sourceKindCount: 0,
      staleImportJobCount: 0,
      status: "waiting"
    });
  });

  it("returns attention when failed, pending, high-priority, or duplicate work exists", () => {
    expect(
      buildImportHealthOverview(
        {
          tableCount: 1,
          fieldCount: 2,
          suggestionCount: 3,
          pendingSuggestionCount: 4,
          graphNodeCount: 5,
          graphEdgeCount: 6
        },
        [
          {
            status: "partial",
            diagnostics: { ignored_file_count: 2 },
            stages: [{ diagnostics: { ignored_file_count: 99 } }]
          },
          {
            status: "succeeded",
            stages: [{ diagnostics: { ignored_file_count: 3 } }]
          }
        ],
        [{ source_kind: "document" }],
        [
          {
            review_priority: "high",
            quality_reasons: ["source:extracted_relationship", "evidence:multi_source"],
            evidence_payload: {
              source_kind: "extracted_relationship",
              evidence_refs: ["architecture.md#overview", "service.ts#CustomerService"]
            }
          },
          {
            review_priority: "medium",
            evidence_payload: { evidence_refs: ["orders.csv#field", "runbook.md#chunk-1"] }
          }
        ],
        { duplicate_suggestion_count: 7 }
      )
    ).toEqual({
      duplicateSuggestionCount: 7,
      extractedHighPriorityCount: 1,
      failedTaskCount: 1,
      highPriorityCount: 1,
      ignoredFileCount: 5,
      multiSourceRelationshipCount: 2,
      pendingReviewCount: 4,
      sourceKindCount: 1,
      staleImportJobCount: 0,
      status: "attention"
    });
  });

  it("counts stale persisted import jobs using the backend recovery threshold", () => {
    const now = Date.parse("2026-06-11T10:00:00Z");

    expect(
      buildImportHealthOverview(
        {
          tableCount: 0,
          fieldCount: 0,
          suggestionCount: 0,
          pendingSuggestionCount: 0,
          graphNodeCount: 1,
          graphEdgeCount: 0
        },
        [
          {
            jobId: 101,
            status: "running",
            updatedAt: Date.parse("2026-06-11T09:29:00Z")
          },
          {
            jobId: 102,
            status: "staging",
            updatedAt: Date.parse("2026-06-11T09:31:00Z")
          },
          {
            jobId: 103,
            status: "succeeded",
            updatedAt: Date.parse("2026-06-11T08:00:00Z")
          },
          {
            status: "running",
            updatedAt: Date.parse("2026-06-11T08:00:00Z")
          }
        ],
        [{ source_kind: "document" }],
        [],
        null,
        now
      )
    ).toMatchObject({
      staleImportJobCount: 1,
      status: "attention"
    });
  });

  it("returns healthy when imported data has no attention work", () => {
    expect(
      buildImportHealthOverview(
        {
          tableCount: 1,
          fieldCount: 2,
          suggestionCount: 0,
          pendingSuggestionCount: 0,
          graphNodeCount: 3,
          graphEdgeCount: 1
        },
        [{ status: "succeeded" }],
        [{ source_kind: "table" }],
        [],
        null
      ).status
    ).toBe("healthy");
  });
});
