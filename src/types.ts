/**
 * Castor Agent - 타입 정의
 */

// AI 제공자 관련 타입
export type ThinkingLevel = "HIGH" | "LOW" | "MINIMAL";

export type AntigravityModel =
  | "gemini-3-pro-preview"
  | "gemini-3-flash-preview"
  | "claude-opus-4.5"
  | "claude-sonnet-4.5";

export type PersonalModel =
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-3-pro-preview"
  | "gemini-3-flash-preview";

export type AIModel = AntigravityModel | PersonalModel;

export interface GenerateOptions {
  model: AIModel;
  thinkingLevel?: ThinkingLevel;
  thinkingBudget?: number;
}

// 채팅 메시지 타입
export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  thinking?: string;
  toolCalls?: ToolCall[];
  tokenUsage?: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// 도구 관련 타입
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: "pending" | "running" | "completed" | "error";
}

// 대기 중인 파일 변경사항 (Accept/Reject 용)
export interface FileChange {
  id: string;
  filePath: string;
  fileName: string;
  changeType: "create" | "modify" | "delete";
  originalContent?: string; // 원본 내용 (수정/삭제 시)
  newContent: string; // 새 내용
  diff?: string; // unified diff 형식
  status: "pending" | "accepted" | "rejected";
}

export interface PendingChanges {
  id: string;
  toolCallId: string;
  files: FileChange[];
  createdAt: number;
}

// AI 제공자 인터페이스
export interface IAIProvider {
  providerId: string;
  generateResponse(
    messages: ChatMessage[],
    tools: ToolDef[],
    options: GenerateOptions,
  ): AsyncIterable<StreamChunk>;
  checkHealth(): Promise<boolean>;
}

export interface StreamChunk {
  type: "thinking" | "text" | "tool_call" | "token_usage" | "error";
  content: string;
  toolCall?: ToolCall;
  tokenUsage?: TokenUsage;
}

// 키 관리 타입
export type KeyStatus = "active" | "cooldown" | "exhausted";

export interface KeyState {
  id: string;
  status: KeyStatus;
  lastUsed: number;
  errorCount: number;
  retryAfter?: number;
}

// 인증 토큰 타입
export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  accountEmail?: string;
}

// 실행 권한 레벨
export type AutoRunMode = "Strict" | "Balanced" | "High_Risk" | "God_Mode";

// 명령어 위험도
export type RiskLevel = "SAFE" | "MODERATE" | "HIGH";

// Webview 메시지 타입
export type WebviewMessageType =
  | "debug"
  | "ready"
  | "sendMessage"
  | "receiveMessage"
  | "streamChunk"
  | "login"
  | "logout"
  | "addAccount"
  | "switchAccount"
  | "deleteAccount"
  | "selectModel"
  | "updateSettings"
  | "confirmAction"
  | "cancelAction"
  | "error"
  // 세션 관련
  | "newSession"
  | "loadSession"
  | "deleteSession"
  | "getSessions"
  | "sessionsUpdated"
  // 컨텍스트 관련
  | "getContext"
  | "getSelection"
  | "contextResult"
  // 스트리밍 제어
  | "abortStreaming"
  // 대화 내보내기
  | "exportConversation"
  // 코드 블록 실행
  | "runCodeBlock"
  // Diff Accept/Reject
  | "pendingChanges"
  | "acceptChange"
  | "rejectChange"
  | "acceptAllChanges"
  | "rejectAllChanges"
  // Editor Diff View
  | "showDiffInEditor";

export interface WebviewMessage {
  type: WebviewMessageType;
  payload: unknown;
}

// 채팅 세션 타입
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
