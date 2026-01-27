import type { GenerateOptions, IAIProvider, StreamChunk } from "../types.js";

/**
 * AI 제공자 기본 인터페이스 (재export)
 */
export type { GenerateOptions, IAIProvider, StreamChunk };

/**
 * 지원 모델 목록
 */
export const ANTIGRAVITY_MODELS = [
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "claude-opus-4.5",
  "claude-sonnet-4.5",
] as const;

export const PERSONAL_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
] as const;

/**
 * 모델이 Gemini 3 계열인지 확인
 */
export function isGemini3Model(model: string): boolean {
  return model.startsWith("gemini-3");
}

/**
 * 모델이 Claude 계열인지 확인
 */
export function isClaudeModel(model: string): boolean {
  return model.startsWith("claude-");
}

/**
 * 모델별 기본 설정 반환
 */
export function getModelDefaults(model: string): Partial<GenerateOptions> {
  if (isGemini3Model(model)) {
    return { thinkingLevel: "HIGH" };
  }

  if (model.startsWith("gemini-2.5")) {
    return { thinkingBudget: 8192 };
  }

  return {};
}
