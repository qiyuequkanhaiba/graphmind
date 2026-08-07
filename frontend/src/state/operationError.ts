import { ApiError } from "../api/client";

export type WorkspaceOperationError = {
  code: string | null;
  fieldErrors: Record<string, string>;
  message: string;
  retryable: boolean;
  userAction: string | null;
};

export function toWorkspaceOperationError(
  error: unknown,
  fallbackMessage: string
): WorkspaceOperationError {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      fieldErrors: error.fieldErrors,
      message: error.message,
      retryable: error.retryable,
      userAction: error.userAction || null
    };
  }
  return {
    code: null,
    fieldErrors: {},
    message: error instanceof Error ? error.message : fallbackMessage,
    retryable: false,
    userAction: null
  };
}

export function workspaceOperationErrorPatch(error: unknown, fallbackMessage: string) {
  const operationError = toWorkspaceOperationError(error, fallbackMessage);
  return { error: operationError.message, operationError };
}
