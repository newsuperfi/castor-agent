/**
 * OAuth 상수
 * Gemini-CLI 공식 OAuth 사용 (google-gemini/gemini-cli)
 * Ref: https://github.com/google-gemini/gemini-cli/packages/core/src/code_assist/oauth2.ts
 */

// ============================================================================
// Gemini-CLI 공식 OAuth 설정 (현재 사용)
// ============================================================================
export const ANTIGRAVITY_CLIENT_ID =
  "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
export const ANTIGRAVITY_CLIENT_SECRET = "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";

export const ANTIGRAVITY_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// ============================================================================
// Antigravity OAuth 설정 (레거시 - 주석 처리)
// ============================================================================
// export const ANTIGRAVITY_CLIENT_ID =
//   "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
// export const ANTIGRAVITY_CLIENT_SECRET = "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";
//
// export const ANTIGRAVITY_SCOPES: readonly string[] = [
//   "https://www.googleapis.com/auth/cloud-platform",
//   "https://www.googleapis.com/auth/userinfo.email",
//   "https://www.googleapis.com/auth/userinfo.profile",
//   "https://www.googleapis.com/auth/cclog",
//   "https://www.googleapis.com/auth/experimentsandconfigs",
// ];
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL =
  "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";

// Antigravity API 엔드포인트 (Fallback 순서)
export const ANTIGRAVITY_ENDPOINT_DAILY =
  "https://daily-cloudcode-pa.sandbox.googleapis.com";
export const ANTIGRAVITY_ENDPOINT_AUTOPUSH =
  "https://autopush-cloudcode-pa.sandbox.googleapis.com";
export const ANTIGRAVITY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";

export const ANTIGRAVITY_ENDPOINT_FALLBACKS = [
  ANTIGRAVITY_ENDPOINT_DAILY,
  ANTIGRAVITY_ENDPOINT_AUTOPUSH,
  ANTIGRAVITY_ENDPOINT_PROD,
] as const;

// Gemini CLI 엔드포인트 (별도 쿼터)
export const GEMINI_CLI_ENDPOINT = ANTIGRAVITY_ENDPOINT_PROD;

// 기본 프로젝트 ID (Antigravity가 반환하지 않을 경우)
export const ANTIGRAVITY_DEFAULT_PROJECT_ID = "rising-fact-p41fc";

// Antigravity API 헤더
export const ANTIGRAVITY_HEADERS = {
  "User-Agent": "antigravity/1.11.5 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata":
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
} as const;

// Gemini CLI API 헤더
export const GEMINI_CLI_HEADERS = {
  "User-Agent": "google-api-nodejs-client/9.15.1",
  "X-Goog-Api-Client": "gl-node/22.17.0",
  "Client-Metadata":
    "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
} as const;

// 사고 서명 우회 (캐시 미스 등에서 사용)
export const SKIP_THOUGHT_SIGNATURE = "skip_thought_signature_validator";
