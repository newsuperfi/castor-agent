/**
 * Agent Brain - ReAct Loop 구현
 * Think → Act → Observe 사이클
 */

import type {
  ChatMessage,
  GenerateOptions,
  IAIProvider,
  ToolCall,
  ToolDef,
} from "../types.js";

export interface AgentConfig {
  maxTurns: number; // 도구 호출 최대 횟수
  mode: "edit" | "plan"; // 실행 모드
}

export interface AgentTurn {
  thinking?: string;
  text?: string;
  toolCalls: ToolCall[];
}

export interface AgentState {
  turns: AgentTurn[];
  currentTurn: number;
  isRunning: boolean;
  aborted: boolean;
}

type AgentEventType =
  | "thinking"
  | "text"
  | "tool_start"
  | "tool_end"
  | "turn_complete"
  | "done"
  | "error";

export interface AgentEvent {
  type: AgentEventType;
  content?: string;
  toolCall?: ToolCall;
  error?: Error;
}

/**
 * AgentBrain: AI 에이전트의 핵심 로직
 */
export class AgentBrain {
  private provider: IAIProvider;
  private tools: Map<string, ToolDef> = new Map();
  private toolExecutors: Map<
    string,
    (args: Record<string, unknown>) => Promise<string>
  > = new Map();
  private config: AgentConfig;
  private state: AgentState;

  constructor(provider: IAIProvider, config: Partial<AgentConfig> = {}) {
    this.provider = provider;
    this.config = {
      maxTurns: config.maxTurns ?? 25,
      mode: config.mode ?? "edit",
    };
    this.state = this.createInitialState();
  }

  private createInitialState(): AgentState {
    return {
      turns: [],
      currentTurn: 0,
      isRunning: false,
      aborted: false,
    };
  }

  /**
   * 도구 등록
   */
  registerTool(
    def: ToolDef,
    executor: (args: Record<string, unknown>) => Promise<string>,
  ): void {
    this.tools.set(def.name, def);
    this.toolExecutors.set(def.name, executor);
  }

  /**
   * 에이전트 실행 (스트리밍)
   */
  async *run(
    messages: ChatMessage[],
    options: GenerateOptions,
  ): AsyncGenerator<AgentEvent> {
    this.state = this.createInitialState();
    this.state.isRunning = true;

    const toolDefs = Array.from(this.tools.values());
    let conversationMessages = [...messages];

    try {
      while (
        this.state.currentTurn < this.config.maxTurns &&
        !this.state.aborted
      ) {
        console.log(
          "[Castor/Brain] Turn",
          this.state.currentTurn + 1,
          "starting",
        );
        const turn: AgentTurn = { toolCalls: [] };

        // AI 응답 스트리밍
        console.log("[Castor/Brain] Calling provider.generateResponse...");
        for await (const chunk of this.provider.generateResponse(
          conversationMessages,
          toolDefs,
          options,
        )) {
          if (this.state.aborted) break;

          if (chunk.type === "thinking") {
            turn.thinking = (turn.thinking || "") + chunk.content;
            yield { type: "thinking", content: chunk.content };
          } else if (chunk.type === "text") {
            turn.text = (turn.text || "") + chunk.content;
            yield { type: "text", content: chunk.content };
          } else if (chunk.type === "tool_call" && chunk.toolCall) {
            turn.toolCalls.push(chunk.toolCall);
            yield { type: "tool_start", toolCall: chunk.toolCall };
          }
        }

        this.state.turns.push(turn);
        yield { type: "turn_complete" };

        // 도구 호출이 없으면 종료
        if (turn.toolCalls.length === 0) {
          break;
        }

        // 도구 실행
        for (const toolCall of turn.toolCalls) {
          if (this.state.aborted) break;

          const executor = this.toolExecutors.get(toolCall.name);
          if (!executor) {
            toolCall.status = "error";
            toolCall.result = `Unknown tool: ${toolCall.name}`;
          } else {
            toolCall.status = "running";
            try {
              const result = await executor(toolCall.arguments);
              toolCall.status = "completed";
              toolCall.result = result;
            } catch (err) {
              toolCall.status = "error";
              toolCall.result =
                err instanceof Error ? err.message : String(err);
            }
          }

          yield { type: "tool_end", toolCall };
        }

        // 도구 결과를 대화에 추가
        const toolResultMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: turn.toolCalls
            .map((tc) => `Tool ${tc.name}: ${tc.result || "No result"}`)
            .join("\n"),
          timestamp: Date.now(),
          toolCalls: turn.toolCalls,
        };
        conversationMessages.push(toolResultMessage);

        this.state.currentTurn++;
      }

      yield { type: "done" };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      this.state.isRunning = false;
    }
  }

  /**
   * 실행 중단
   */
  abort(): void {
    this.state.aborted = true;
  }

  /**
   * 상태 조회
   */
  getState(): AgentState {
    return { ...this.state };
  }
}
