import { GoogleGenAI } from "@google/genai";
import type {
  ChatMessage,
  GenerateOptions,
  IAIProvider,
  PersonalModel,
  StreamChunk,
  ToolDef,
} from "../types.js";
import { isGemini3Model } from "./base.js";

/**
 * Personal Provider
 * Gemini API Key 기반 - Gemini 2.5/3 지원
 */
export class PersonalProvider implements IAIProvider {
  readonly providerId = "personal";
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async *generateResponse(
    messages: ChatMessage[],
    tools: ToolDef[],
    options: GenerateOptions,
  ): AsyncIterable<StreamChunk> {
    const model = options.model as PersonalModel;

    try {
      const config = this.buildConfig(tools, options);
      const contents = this.buildContents(messages);

      const response = await this.client.models.generateContentStream({
        model,
        contents,
        config,
      });

      for await (const chunk of response) {
        // 사고 과정
        const candidates = chunk.candidates as
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

        if (candidates?.[0]?.content?.parts) {
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
        }

        // 토큰 사용량
        if (chunk.usageMetadata) {
          yield {
            type: "token_usage",
            content: "",
            tokenUsage: {
              inputTokens: chunk.usageMetadata.promptTokenCount || 0,
              outputTokens: chunk.usageMetadata.candidatesTokenCount || 0,
              totalTokens: chunk.usageMetadata.totalTokenCount || 0,
            },
          };
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
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 생성 설정 구성
   */
  private buildConfig(
    tools: ToolDef[],
    options: GenerateOptions,
  ): Record<string, unknown> {
    const config: Record<string, unknown> = {
      temperature: 1,
      topP: 0.95,
      topK: 64,
    };

    // 사고 설정
    if (isGemini3Model(options.model)) {
      config.thinkingConfig = {
        includeThoughts: true,
        thinkingLevel: options.thinkingLevel || "HIGH",
      };
    } else if (options.model.startsWith("gemini-2.5")) {
      config.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: options.thinkingBudget || 8192,
      };
    }

    // 도구 설정
    if (tools.length > 0) {
      config.tools = [
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

    return config;
  }

  /**
   * 메시지를 Gemini 형식으로 변환
   */
  private buildContents(messages: ChatMessage[]): Array<{
    role: string;
    parts: Array<{ text: string }>;
  }> {
    return messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : msg.role,
      parts: [{ text: msg.content }],
    }));
  }
}
