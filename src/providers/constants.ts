/**
 * Antigravity Provider 상수
 * Production 우선 정책, 헤더 랜덤화, thinkingConfig 상수
 */

// ============================================================================
// 엔드포인트
// ============================================================================

/** Production 엔드포인트 (기본값 - 429 회피를 위해 우선 사용) */
export const ANTIGRAVITY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";

/** Daily Sandbox 엔드포인트 (폴백용) */
export const ANTIGRAVITY_ENDPOINT_SANDBOX =
  "https://daily-cloudcode-pa.sandbox.googleapis.com";

/** 기본 엔드포인트 = Production */
export const ANTIGRAVITY_ENDPOINT = ANTIGRAVITY_ENDPOINT_PROD;

/** 폴백 순서: Production → Sandbox */
export const ANTIGRAVITY_ENDPOINT_FALLBACKS = [
  ANTIGRAVITY_ENDPOINT_PROD,
  ANTIGRAVITY_ENDPOINT_SANDBOX,
] as const;

// API Paths
export const API_PATH = {
  /** 스트리밍 생성 (구현 대상) */
  STREAM_GENERATE: "/v1internal:streamGenerateContent?alt=sse",
  /** 비스트리밍 생성 (참조용 - 미구현) */
  // GENERATE: "/v1internal:generateContent",
  /** 프로젝트 조회 */
  LOAD_CODE_ASSIST: "/v1internal:loadCodeAssist",
  /** 프로젝트 자동 프로비저닝 (PR #205) */
  ONBOARD_USER: "/v1internal:onboardUser",
} as const;

// ============================================================================
// 헤더 랜덤화 (Rate Limit 회피)
// ============================================================================

const ANTIGRAVITY_USER_AGENTS = [
  "antigravity/1.11.5 windows/amd64",
  "antigravity/1.11.4 darwin/arm64",
  "antigravity/1.11.3 linux/amd64",
  "antigravity/1.10.9 windows/amd64",
  "antigravity/1.10.8 darwin/amd64",
] as const;

const ANTIGRAVITY_API_CLIENTS = [
  "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "google-cloud-sdk vscode/1.96.0",
  "google-cloud-sdk jetbrains/2024.3",
  "google-cloud-sdk vscode/1.95.0",
] as const;

const GEMINI_CLI_USER_AGENTS = [
  "google-api-nodejs-client/9.15.1",
  "google-api-nodejs-client/9.14.0",
  "google-api-nodejs-client/9.13.0",
] as const;

const GEMINI_CLI_API_CLIENTS = [
  "gl-node/22.17.0",
  "gl-node/22.12.0",
  "gl-node/20.18.0",
  "gl-node/21.7.0",
] as const;

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export type HeaderStyle = "antigravity" | "gemini-cli";

export interface HeaderSet {
  "User-Agent": string;
  "X-Goog-Api-Client": string;
  "Client-Metadata": string;
}

/** 헤더 랜덤화 함수 - Rate limit 회피용 */
export function getRandomizedHeaders(style: HeaderStyle): HeaderSet {
  if (style === "gemini-cli") {
    return {
      "User-Agent": randomFrom(GEMINI_CLI_USER_AGENTS),
      "X-Goog-Api-Client": randomFrom(GEMINI_CLI_API_CLIENTS),
      "Client-Metadata":
        "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
    };
  }
  return {
    "User-Agent": randomFrom(ANTIGRAVITY_USER_AGENTS),
    "X-Goog-Api-Client": randomFrom(ANTIGRAVITY_API_CLIENTS),
    "Client-Metadata":
      '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
  };
}

// ============================================================================
// thinkingConfig 상수
// ============================================================================

/** Gemini 3용 Thinking Level */
export const THINKING_LEVEL = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type ThinkingLevel =
  (typeof THINKING_LEVEL)[keyof typeof THINKING_LEVEL];

/** Gemini 2.5 / Claude용 Thinking Budget */
export const THINKING_BUDGET = {
  MINIMAL: 4096,
  DEFAULT: 8192,
  EXTENDED: 16384,
  MAX_CLAUDE: 32768,
} as const;

/** Claude Thinking 모델 최대 출력 토큰 */
export const CLAUDE_THINKING_MAX_OUTPUT_TOKENS = 128000;

/** 기본 프로젝트 ID (폴백용) */
export const DEFAULT_PROJECT_ID = "rising-fact-p41fc";
