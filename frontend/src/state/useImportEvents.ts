import { useEffect } from "react";
import type { ImportEvent } from "../api/types";

export function useImportEvents(
  projectId: number | null,
  onEvent: (event: ImportEvent) => void
) {
  useEffect(() => {
    if (projectId === null || typeof EventSource === "undefined") {
      return;
    }

    const eventSource = new EventSource(`/api/projects/${projectId}/import-events`);
    const handleSnapshot = (event: MessageEvent) => {
      try {
        onEvent(JSON.parse(event.data) as ImportEvent);
      } catch {
        // Ignore malformed event payloads; polling remains the fallback path.
      }
    };

    eventSource.addEventListener("import_job_snapshot", handleSnapshot);
    return () => eventSource.close();
  }, [onEvent, projectId]);
}
