type ToastKind = "success" | "error" | "info";
type ApiErrorSeverity = "error" | "warning" | "info";

export type NormalizedApiError = {
  code: string;
  message: string;
  traceId?: string;
  severity: ApiErrorSeverity;
};

type ApiErrorLike = {
  code?: string;
  message?: string;
  traceId?: string;
  details?: {
    traceId?: string;
  };
};

const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE: "보유 포인트보다 많이 차감할 수 없습니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "이 작업을 수행할 권한이 없습니다.",
  VALIDATION_ERROR: "입력값을 다시 확인하세요.",
  NOT_FOUND: "요청한 데이터를 찾을 수 없습니다.",
  CONFLICT: "다른 변경사항과 충돌했습니다. 새로고침 후 다시 시도하세요.",
};

const DEFAULT_ERROR_MESSAGE = "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.";

export function normalizeApiError(error: unknown): NormalizedApiError {
  const apiError = toApiErrorLike(error);
  const code = apiError.code ?? "UNKNOWN";

  return {
    code,
    message: ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE,
    traceId: apiError.traceId ?? apiError.details?.traceId,
    severity: "error",
  };
}

export function getToastOptions(kind: ToastKind): { duration: number } {
  const durations = {
    success: 3000,
    error: 6000,
    info: 4000,
  } as const;

  return { duration: durations[kind] };
}

export function formatApiErrorMessage(error: unknown): string {
  const normalizedError = normalizeApiError(error);
  return normalizedError.traceId
    ? `${normalizedError.message} (traceId: ${normalizedError.traceId})`
    : normalizedError.message;
}

function toApiErrorLike(error: unknown): ApiErrorLike {
  if (error && typeof error === "object") {
    return error as ApiErrorLike;
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return {};
}
