import type { AxiosInstance } from "axios";
import type {
  AntigravityModel,
  ChatMessage,
  GenerateOptions,
  IAIProvider,
  StreamChunk,
  ToolDef,
} from "../types.js";
import { isClaudeModel, isGemini3Model } from "./base.js";
import {
  ANTIGRAVITY_ENDPOINT_FALLBACKS,
  API_PATH,
  DEFAULT_PROJECT_ID,
  getRandomizedHeaders,
  THINKING_BUDGET,
} from "./constants.js";

// 프로젝트 ID 캐시
let cachedProjectId: string | null = null;

/**
 * 캐시된 프로젝트 ID 무효화 (계정 전환 시 호출)
 */
export function clearCachedProjectId(): void {
  console.log("[Castor/Provider] Clearing cached project ID");
  cachedProjectId = null;
}

/**
 * onboardUser API를 호출하여 새 프로젝트를 자동 생성
 * PR #205: 2026-01-15부터 유효한 프로젝트 ID가 필수
 */
async function onboardManagedProject(
  client: AxiosInstance,
  tierId: string = "FREE",
  attempts: number = 5,
  delayMs: number = 3000,
): Promise<string | undefined> {
  const metadata = {
    ideType: "IDE_UNSPECIFIED",
    platform: "PLATFORM_UNSPECIFIED",
    pluginType: "GEMINI",
  };

  const headers = getRandomizedHeaders("antigravity");

  for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        console.log(
          `[Castor/Provider] onboardUser attempt ${attempt + 1}/${attempts} at:`,
          endpoint,
        );

        const response = await client.post(
          `${endpoint}${API_PATH.ONBOARD_USER}`,
          { tierId, metadata },
          {
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
          },
        );

        const payload = response.data;
        console.log(
          "[Castor/Provider] onboardUser response:",
          JSON.stringify(payload, null, 2),
        );

        // 프로비저닝 완료 확인
        const managedProjectId = payload?.response?.cloudaicompanionProject?.id;
        if (payload?.done && managedProjectId) {
          console.log(
            "[Castor/Provider] Successfully provisioned project:",
            managedProjectId,
          );
          return managedProjectId;
        }

        // 아직 완료되지 않았으면 대기 후 재시도
        if (!payload?.done) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      } catch (error) {
        console.log(
          "[Castor/Provider] onboardUser failed at",
          endpoint,
          ":",
          error,
        );
        break; // 다음 엔드포인트 시도
      }
    }
  }

  return undefined;
}

/**
 * loadCodeAssist API를 호출하여 사용자의 managed project ID를 가져옴
 * 없으면 onboardUser로 자동 프로비저닝 시도 (PR #205)
 */
async function loadManagedProjectId(client: AxiosInstance): Promise<string> {
  if (cachedProjectId) {
    console.log("[Castor/Provider] Using cached project ID:", cachedProjectId);
    return cachedProjectId;
  }

  // Production 우선 폴백 순서 사용
  const endpoints = ANTIGRAVITY_ENDPOINT_FALLBACKS;

  const metadata = {
    ideType: "IDE_UNSPECIFIED",
    platform: "PLATFORM_UNSPECIFIED",
    pluginType: "GEMINI",
  };

  let allowedTiers: Array<{ id?: string; isDefault?: boolean }> = [];

  for (const endpoint of endpoints) {
    try {
      console.log("[Castor/Provider] Trying loadCodeAssist at:", endpoint);

      // 랜덤화된 헤더 사용
      const headers = getRandomizedHeaders("antigravity");

      const response = await client.post(
        `${endpoint}${API_PATH.LOAD_CODE_ASSIST}`,
        { metadata },
        {
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        },
      );

      const payload = response.data;
      console.log(
        "[Castor/Provider] loadCodeAssist response:",
        JSON.stringify(payload, null, 2),
      );

      // allowedTiers 저장 (onboarding에 필요)
      if (payload?.allowedTiers) {
        allowedTiers = payload.allowedTiers;
      }

      // cloudaicompanionProject에서 프로젝트 ID 추출
      let projectId: string | undefined;
      if (typeof payload?.cloudaicompanionProject === "string") {
        projectId = payload.cloudaicompanionProject;
      } else if (payload?.cloudaicompanionProject?.id) {
        projectId = payload.cloudaicompanionProject.id;
      }

      if (projectId) {
        console.log("[Castor/Provider] Got managed project ID:", projectId);
        cachedProjectId = projectId;
        return projectId;
      }
    } catch (error) {
      console.log(
        "[Castor/Provider] loadCodeAssist failed at",
        endpoint,
        ":",
        error,
      );
    }
  }

  // 프로젝트 ID가 없으면 자동 프로비저닝 시도 (PR #205)
  console.log(
    "[Castor/Provider] No project found, attempting auto-provision...",
  );

  // 기본 tier ID 선택
  const defaultTier = allowedTiers.find((t) => t.isDefault) || allowedTiers[0];
  const tierId = defaultTier?.id || "FREE";

  const provisionedId = await onboardManagedProject(client, tierId);
  if (provisionedId) {
    cachedProjectId = provisionedId;
    return provisionedId;
  }

  console.log(
    "[Castor/Provider] Auto-provision failed, using fallback:",
    DEFAULT_PROJECT_ID,
  );
  return DEFAULT_PROJECT_ID;
}

/**
 * Antigravity Provider
 * Gemini 3 Pro/Flash + Claude Opus/Sonnet 지원
 */
export class AntigravityProvider implements IAIProvider {
  readonly providerId = "antigravity";

  constructor(private client: AxiosInstance) {}

  async *generateResponse(
    messages: ChatMessage[],
    tools: ToolDef[],
    options: GenerateOptions,
  ): AsyncIterable<StreamChunk> {
    const model = options.model as AntigravityModel;

    console.log("[Castor/Provider] generateResponse called with model:", model);
    console.log("[Castor/Provider] messages count:", messages.length);

    try {
      // 모델 이름 매핑: UI 모델명을 Gemini-CLI API 모델 ID로 변환
      // Ref: https://github.com/google-gemini/gemini-cli/packages/core/src/config/models.ts
      const MODEL_MAP: Record<string, string> = {
        // Gemini 3 모델 (gemini-cli 공식 모델 ID)
        "gemini-3-flash-preview": "gemini-3-flash-preview",
        "gemini-3-pro-preview": "gemini-3-pro-preview",
        // Claude 모델 (레거시 매핑 유지)
        "claude-sonnet-4.5": "claude-sonnet-4-5",
        "claude-opus-4.5": "claude-opus-4-5-thinking",
        // Gemini 2.5 모델 (직접 전달)
        "gemini-2.5-pro": "gemini-2.5-pro",
        "gemini-2.5-flash": "gemini-2.5-flash",
        "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
      };
      const apiModel = MODEL_MAP[model] || model;

      const requestBody = await this.buildRequestBody(
        messages,
        tools,
        options,
        apiModel,
      );

      // 스트리밍 엔드포인트 (비스트리밍: API_PATH.GENERATE - 미구현)
      const endpoint = API_PATH.STREAM_GENERATE;
      console.log("[Castor/Provider] API endpoint:", endpoint);
      console.log("[Castor/Provider] API model:", apiModel);
      console.log(
        "[Castor/Provider] Request body:",
        JSON.stringify(requestBody).substring(0, 500),
      );

      // gemini-cli 스타일: 최소한의 헤더만 사용
      // Ref: https://github.com/google-gemini/gemini-cli/packages/core/src/code_assist/server.ts
      const response = await this.client.post(endpoint, requestBody, {
        responseType: "stream",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("[Castor/Provider] Got response, status:", response.status);

      const stream = response.data;
      let buffer = "";
      let chunkCount = 0;

      for await (const chunk of stream) {
        const chunkStr = chunk.toString();
        buffer += chunkStr;
        chunkCount++;

        // 디버그: 청크 내용 로깅
        console.log(
          `[Castor/Provider] Chunk #${chunkCount}:`,
          chunkStr.substring(0, 200),
        );

        // 줄 단위로 파싱
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          console.log("[Castor/Provider] Line:", line.substring(0, 100));

          if (!line.trim() || line.startsWith("data: [DONE]")) {
            continue;
          }

          // SSE 형식 (data: prefix)
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log(
                "[Castor/Provider] Parsed SSE data:",
                JSON.stringify(data).substring(0, 100),
              );
              yield* this.parseChunk(data);
            } catch (e) {
              console.log("[Castor/Provider] SSE parse error:", e);
            }
          } else {
            // SSE가 아닌 경우 직접 JSON 파싱 시도
            try {
              const data = JSON.parse(line);
              console.log(
                "[Castor/Provider] Parsed raw JSON:",
                JSON.stringify(data).substring(0, 100),
              );
              yield* this.parseChunk(data);
            } catch {
              // 파싱 실패 무시
            }
          }
        }
      }

      console.log("[Castor/Provider] Stream finished, chunks:", chunkCount);
    } catch (error) {
      console.error("[Castor/Provider] API Error:", error);

      // 429 등의 에러 응답 상세 내용 로깅
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as {
          response?: {
            status?: number;
            data?: NodeJS.ReadableStream | string;
            statusText?: string;
          };
        };
        console.error(
          "[Castor/Provider] Response status:",
          axiosError.response?.status,
        );
        console.error(
          "[Castor/Provider] Response statusText:",
          axiosError.response?.statusText,
        );

        // 스트림인 경우 읽어서 출력
        const data = axiosError.response?.data;
        if (data && typeof data === "object" && "on" in data) {
          try {
            let errorBody = "";
            const stream = data as NodeJS.ReadableStream;
            for await (const chunk of stream) {
              errorBody += chunk.toString();
            }
            console.error("[Castor/Provider] Error response body:", errorBody);
          } catch (e) {
            console.error("[Castor/Provider] Failed to read error stream:", e);
          }
        } else if (typeof data === "string") {
          console.error("[Castor/Provider] Response data:", data);
        }
      }

      yield {
        type: "error",
        content: error instanceof Error ? error.message : "알 수 없는 오류",
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get("/models");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 요청 본문 생성 (gemini-cli 공식 구조와 동일)
   * Ref: https://github.com/google-gemini/gemini-cli/packages/core/src/code_assist/converter.ts
   */
  private async buildRequestBody(
    messages: ChatMessage[],
    tools: ToolDef[],
    options: GenerateOptions,
    apiModel: string,
  ): Promise<Record<string, unknown>> {
    const contents = messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : msg.role,
      parts: [{ text: msg.content }],
    }));

    const generationConfig: Record<string, unknown> = {
      temperature: 1,
      topP: 0.95,
      topK: 64,
    };

    // 사고 설정 (gemini-cli 스타일)
    if (isGemini3Model(options.model)) {
      // Gemini 3: thinkingLevel 사용 (대문자 유지 - gemini-cli 공식)
      // Ref: defaultModelConfigs.ts - ThinkingLevel.HIGH
      generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingLevel: options.thinkingLevel || "HIGH",
      };
    } else if (isClaudeModel(options.model)) {
      // Claude: snake_case 및 thinking_budget 사용
      generationConfig.thinkingConfig = {
        include_thoughts: true,
        thinking_budget: options.thinkingBudget || THINKING_BUDGET.DEFAULT,
      };
    } else if (options.model.startsWith("gemini-2.5")) {
      // Gemini 2.5: thinkingBudget 사용
      generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: options.thinkingBudget || THINKING_BUDGET.DEFAULT,
      };
    }

    // 동적으로 사용자의 managed project ID 가져오기
    const projectId = await loadManagedProjectId(this.client);

    // 세션 ID: gemini-cli에서는 빈 문자열로 초기화
    // Ref: CodeAssistServer constructor in server.ts
    const sessionId = "";

    // 시스템 프롬프트: AI가 VS Code 확장에서 동작하고 도구를 사용할 수 있음을 알림
    const systemInstruction = {
      parts: [
        {
          text: `You are Castor, an AI coding assistant integrated into VS Code.
You have access to tools that allow you to:
- Read and write files in the user's workspace
- Execute terminal commands
- Search code and navigate the codebase
- Make code edits and refactors

When the user asks you to modify code, create files, or run commands, you should use your available tools to accomplish the task directly.
Always respond in the same language as the user's message.
Be concise and helpful. Focus on solving the user's problem efficiently.`,
        },
      ],
    };

    // gemini-cli 공식 구조: request 내부에 session_id 포함
    const request: Record<string, unknown> = {
      contents,
      generationConfig,
      systemInstruction,
      session_id: sessionId,
    };

    // 도구를 Gemini API 형식으로 변환
    // Gemini API는 JSON Schema 형식의 parameters를 요구
    if (tools.length > 0) {
      const functionDeclarations = tools.map((tool) => {
        // ITool.parameters를 JSON Schema 형식으로 변환
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const [key, param] of Object.entries(tool.parameters)) {
          const paramDef = param as {
            type: string;
            description: string;
            required?: boolean;
          };
          properties[key] = {
            type: paramDef.type,
            description: paramDef.description,
          };
          if (paramDef.required) {
            required.push(key);
          }
        }

        return {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties,
            required,
          },
        };
      });

      request.tools = [{ functionDeclarations }];
    }

    // gemini-cli 공식 구조와 동일
    // Ref: CAGenerateContentRequest in converter.ts
    return {
      model: apiModel,
      project: projectId,
      user_prompt_id: crypto.randomUUID(),
      request,
    };
  }

  /**
   * 응답 청크 파싱
   * gemini-cli 응답 구조: { response: { candidates: [...] }, traceId: "..." }
   */
  private *parseChunk(data: Record<string, unknown>): Generator<StreamChunk> {
    // gemini-cli 응답은 response 래퍼를 가짐
    const response = data.response as Record<string, unknown> | undefined;
    const candidates = (response?.candidates || data.candidates) as
      | Array<{
          content?: {
            parts?: Array<{
              text?: string;
              thought?: boolean;
              functionCall?: {
                name: string;
                args: Record<string, unknown>;
              };
            }>;
          };
        }>
      | undefined;

    if (!candidates?.[0]?.content?.parts) {
      return;
    }

    for (const part of candidates[0].content.parts) {
      // gemini-cli 응답: thought=true이면 text가 thinking 내용
      // thought=false 또는 없으면 text가 일반 응답
      if (part.thought && part.text) {
        yield { type: "thinking", content: part.text };
      } else if (part.text) {
        yield { type: "text", content: part.text };
      }

      if (part.functionCall) {
        yield {
          type: "tool_call",
          content: "",
          toolCall: {
            id: crypto.randomUUID(),
            name: part.functionCall.name,
            arguments: part.functionCall.args,
            status: "pending",
          },
        };
      }
    }

    // 토큰 사용량
    const usageMetadata = data.usageMetadata as
      | {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        }
      | undefined;

    if (usageMetadata?.totalTokenCount) {
      yield {
        type: "token_usage",
        content: "",
        tokenUsage: {
          inputTokens: usageMetadata.promptTokenCount || 0,
          outputTokens: usageMetadata.candidatesTokenCount || 0,
          totalTokens: usageMetadata.totalTokenCount,
        },
      };
    }
  }
}
