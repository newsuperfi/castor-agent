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

const ANTIGRAVITY_API_BASE = "https://antigravity.googleapis.com/v1";

// 프로젝트 ID 캐시
let cachedProjectId: string | null = null;

/**
 * loadCodeAssist API를 호출하여 사용자의 managed project ID를 가져옴
 */
async function loadManagedProjectId(client: AxiosInstance): Promise<string> {
  const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

  if (cachedProjectId) {
    console.log("[Castor/Provider] Using cached project ID:", cachedProjectId);
    return cachedProjectId;
  }

  const endpoints = [
    "https://cloudcode-pa.googleapis.com",
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  ];

  const metadata = {
    ideType: "IDE_UNSPECIFIED",
    platform: "PLATFORM_UNSPECIFIED",
    pluginType: "GEMINI",
  };

  for (const endpoint of endpoints) {
    try {
      console.log("[Castor/Provider] Trying loadCodeAssist at:", endpoint);

      const response = await client.post(
        `${endpoint}/v1internal:loadCodeAssist`,
        { metadata },
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "google-api-nodejs-client/9.15.1",
            "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
            "Client-Metadata": JSON.stringify(metadata),
          },
        },
      );

      const payload = response.data;
      console.log(
        "[Castor/Provider] loadCodeAssist response:",
        JSON.stringify(payload, null, 2),
      );

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

  console.log(
    "[Castor/Provider] Using fallback project ID:",
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
      // 모델 이름 매핑: antigravity-* 형식을 Antigravity API 모델 ID로 변환
      // Ref: https://github.com/NoeFabris/opencode-antigravity-auth/docs/ANTIGRAVITY_API_SPEC.md
      const MODEL_MAP: Record<string, string> = {
        "antigravity-gemini-3-flash": "gemini-3-pro-low",
        "antigravity-gemini-3-pro": "gemini-3-pro-high",
        "antigravity-claude-sonnet-4-5": "claude-sonnet-4-5",
        "antigravity-claude-sonnet-4-5-thinking": "claude-sonnet-4-5-thinking",
        "antigravity-claude-opus-4-5-thinking": "claude-opus-4-5-thinking",
      };
      const apiModel = MODEL_MAP[model] || model;

      const requestBody = await this.buildRequestBody(
        messages,
        tools,
        options,
        apiModel,
      );

      // Antigravity API 엔드포인트: /v1internal:streamGenerateContent?alt=sse
      const endpoint = `/v1internal:streamGenerateContent?alt=sse`;
      console.log("[Castor/Provider] API endpoint:", endpoint);
      console.log("[Castor/Provider] API model:", apiModel);
      console.log(
        "[Castor/Provider] Request body:",
        JSON.stringify(requestBody).substring(0, 500),
      );

      const response = await this.client.post(endpoint, requestBody, {
        responseType: "stream",
        headers: {
          "Content-Type": "application/json",
          // gemini-cli 스타일 헤더 (prod 엔드포인트용)
          "User-Agent": "google-api-nodejs-client/9.15.1",
          "X-Goog-Api-Client": "gl-node/22.17.0",
          "Client-Metadata":
            "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
          Accept: "text/event-stream",
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
   * 요청 본문 생성
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

    // 사고 설정
    if (isGemini3Model(options.model) || isClaudeModel(options.model)) {
      generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingLevel: options.thinkingLevel || "HIGH",
      };
    } else if (options.model.startsWith("gemini-2.5")) {
      generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: options.thinkingBudget || 8192,
      };
    }

    const request: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    // TODO: Gemini 3 모델에서 tools 형식 문제 해결 필요
    // 현재 "Unknown name 'parameters'" 에러 발생
    // 참조: https://github.com/NoeFabris/opencode-antigravity-auth README
    // if (tools.length > 0) {
    //   request.tools = [...];
    // }

    // 동적으로 사용자의 managed project ID 가져오기
    const projectId = await loadManagedProjectId(this.client);

    // Antigravity API 요청 구조
    // Ref: https://github.com/NoeFabris/opencode-antigravity-auth/docs/ANTIGRAVITY_API_SPEC.md
    return {
      project: projectId,
      model: apiModel,
      request,
      userAgent: "antigravity",
      requestId: crypto.randomUUID(),
    };
  }

  /**
   * 응답 청크 파싱
   */
  private *parseChunk(data: Record<string, unknown>): Generator<StreamChunk> {
    const candidates = data.candidates as
      | Array<{
          content?: {
            parts?: Array<{
              text?: string;
              thought?: string;
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
      if (part.thought) {
        yield { type: "thinking", content: part.thought };
      }

      if (part.text) {
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
