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

    try {
      const requestBody = this.buildRequestBody(messages, tools, options);

      const response = await this.client.post(
        `/models/${model}:streamGenerateContent`,
        requestBody,
        {
          responseType: "stream",
        },
      );

      const stream = response.data;
      let buffer = "";

      for await (const chunk of stream) {
        buffer += chunk.toString();

        // 줄 단위로 파싱
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || line.startsWith("data: [DONE]")) {
            continue;
          }

          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              yield* this.parseChunk(data);
            } catch {
              // JSON 파싱 실패 무시
            }
          }
        }
      }
    } catch (error) {
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
  private buildRequestBody(
    messages: ChatMessage[],
    tools: ToolDef[],
    options: GenerateOptions,
  ): Record<string, unknown> {
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

    const body: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    // 도구 추가
    if (tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: {
              type: "object",
              properties: tool.parameters,
              required: Object.entries(tool.parameters)
                .filter(([, param]) => param.required)
                .map(([name]) => name),
            },
          })),
        },
      ];
    }

    return body;
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
