/**
 * 에러 처리 유틸리티
 * Rate Limit, 네트워크 오류 등 처리
 */

import type { AxiosError } from "axios";

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * 에러 타입 분류
 */
export type ErrorType =
  | "rate_limit"
  | "auth_error"
  | "network_error"
  | "server_error"
  | "timeout"
  | "unknown";

export interface ClassifiedError {
  type: ErrorType;
  message: string;
  retryable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
}

/**
 * Axios 에러 분류
 */
export function classifyError(error: unknown): ClassifiedError {
  const axiosError = error as AxiosError;

  // 네트워크 에러 (응답 없음)
  if (!axiosError.response) {
    if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
      return {
        type: "timeout",
        message: "요청 시간이 초과되었습니다. 다시 시도해주세요.",
        retryable: true,
      };
    }
    return {
      type: "network_error",
      message: "네트워크 연결을 확인해주세요.",
      retryable: true,
    };
  }

  const status = axiosError.response.status;
  const data = axiosError.response.data as Record<string, unknown> | undefined;

  // 상태 코드별 분류
  switch (status) {
    case 401:
    case 403:
      return {
        type: "auth_error",
        message: "인증이 만료되었습니다. 다시 로그인해주세요.",
        retryable: false,
        statusCode: status,
      };

    case 429: {
      // Rate Limit - Retry-After 헤더 확인
      const retryAfter = axiosError.response.headers["retry-after"];
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
      return {
        type: "rate_limit",
        message: "요청 한도에 도달했습니다. 잠시 후 다시 시도합니다.",
        retryable: true,
        statusCode: 429,
        retryAfterMs,
      };
    }

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        type: "server_error",
        message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        retryable: true,
        statusCode: status,
      };

    default:
      return {
        type: "unknown",
        message: (data?.message as string) || `오류가 발생했습니다 (${status})`,
        retryable: false,
        statusCode: status,
      };
  }
}

/**
 * 지수 백오프 딜레이 계산
 */
export function calculateBackoff(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  const delay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs,
  );
  // 지터 추가 (±20%)
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  return Math.floor(delay + jitter);
}

/**
 * 지정된 시간만큼 대기
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 사용자 친화적 에러 메시지 생성
 */
export function formatErrorForUser(error: ClassifiedError): string {
  switch (error.type) {
    case "rate_limit":
      return `⚠️ ${error.message}`;
    case "auth_error":
      return `🔒 ${error.message}`;
    case "network_error":
      return `📡 ${error.message}`;
    case "server_error":
      return `🔧 ${error.message}`;
    case "timeout":
      return `⏱️ ${error.message}`;
    default:
      return `❌ ${error.message}`;
  }
}
