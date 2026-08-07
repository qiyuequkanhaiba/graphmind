import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { subscribeSessionAuthChallenges } from "../api/client";
import type { WorkspaceState } from "./workspaceStore";

export function useSessionAuthChallenge(
  setState: Dispatch<SetStateAction<WorkspaceState>>
): void {
  useEffect(
    () =>
      subscribeSessionAuthChallenges((error) => {
        setState((current) => ({
          ...current,
          projectId: null,
          workspaceVersion: null,
          status: "error",
          error: error.message,
          errorCode: error.code,
          operationError: null
        }));
      }),
    [setState]
  );
}
