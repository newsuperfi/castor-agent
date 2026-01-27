import { create } from "zustand";
import { getLocale, type Locale, setLocale as setI18nLocale } from "./i18n";

export type { Locale };

// VS Code API 타입
declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

// 메시지 타입
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  thinking?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

// Antigravity 쿼터 모델
type AntigravityModel =
  | "antigravity-gemini-3-pro"
  | "antigravity-gemini-3-flash"
  | "antigravity-claude-sonnet-4-5"
  | "antigravity-claude-sonnet-4-5-thinking"
  | "antigravity-claude-opus-4-5-thinking";

// Gemini CLI 쿼터 모델
type GeminiCliModel =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-3-flash-preview"
  | "gemini-3-pro-preview";

type AIModel = AntigravityModel | GeminiCliModel;

// 사고 레벨 (모델별로 지원 범위 다름)
type ThinkingLevel = "high" | "medium" | "low" | "minimal";

// 에이전트 모드
type AgentMode = "edit" | "plan";

interface Account {
  index: number;
  email: string;
  isActive: boolean;
}

interface AppState {
  // 인증 상태
  isLoggedIn: boolean;
  currentEmail: string | null;
  accounts: Array<{ email: string; isActive: boolean }>;
  activeIndex: number;

  // 모드 & 설정
  mode: AgentMode;
  model: AIModel;
  thinkingLevel: ThinkingLevel;
  locale: Locale;

  // UI 상태
  showModelPicker: boolean;

  // 채팅
  messages: ChatMessage[];
  isStreaming: boolean;
  currentThinking: string | null;

  // 토큰 사용량
  totalTokensUsed: number;

  // 액션
  sendMessage: (content: string) => void;
  setModel: (model: AIModel) => void;
  setMode: (mode: AgentMode) => void;
  cycleThinkingLevel: () => void;
  toggleModelPicker: () => void;
  login: () => void;
  logout: () => void;
  addAccount: () => void;
  switchAccount: (index: number) => void;
  deleteAccount: (index: number) => void;
  setLocale: (locale: Locale) => void;
}

// 모델별 지원 thinking level
const MODEL_THINKING_LEVELS: Record<string, ThinkingLevel[]> = {
  "antigravity-gemini-3-pro": ["low", "high"],
  "antigravity-gemini-3-flash": ["minimal", "low", "medium", "high"],
  "antigravity-claude-sonnet-4-5-thinking": ["low", "high"],
  "antigravity-claude-opus-4-5-thinking": ["low", "high"],
};

// VS Code API 인스턴스
let vscode: ReturnType<typeof acquireVsCodeApi> | null = null;
try {
  vscode = acquireVsCodeApi();
} catch {
  console.log("VS Code API not available (development mode)");
}

/**
 * Zustand 스토어
 */
export const useStore = create<AppState>((set, get) => ({
  // 초기 상태
  isLoggedIn: false,
  currentEmail: null,
  accounts: [],
  activeIndex: -1,
  mode: "edit",
  model: "antigravity-gemini-3-flash",
  thinkingLevel: "high",
  locale: getLocale(),
  showModelPicker: false,
  messages: [],
  isStreaming: false,
  currentThinking: null,
  totalTokensUsed: 0,

  // 액션
  sendMessage: (content: string) => {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, message],
      isStreaming: true,
    }));

    const { mode, model, thinkingLevel } = get();
    vscode?.postMessage({
      type: "sendMessage",
      payload: { content, mode, model, thinkingLevel },
    });
  },

  setModel: (model: AIModel) => {
    // 모델 변경 시 thinking level도 유효한 값으로 조정
    const supportedLevels = MODEL_THINKING_LEVELS[model] || ["high"];
    const currentLevel = get().thinkingLevel;
    const newLevel = supportedLevels.includes(currentLevel)
      ? currentLevel
      : supportedLevels[supportedLevels.length - 1];

    set({ model, thinkingLevel: newLevel, showModelPicker: false });
    vscode?.postMessage({ type: "selectModel", payload: { model } });
  },

  setMode: (mode: AgentMode) => {
    set({ mode });
    vscode?.postMessage({ type: "updateSettings", payload: { mode } });
  },

  cycleThinkingLevel: () => {
    const { model, thinkingLevel } = get();
    const levels = MODEL_THINKING_LEVELS[model] || ["high"];
    const currentIndex = levels.indexOf(thinkingLevel);
    const nextIndex = (currentIndex + 1) % levels.length;
    const newLevel = levels[nextIndex];

    set({ thinkingLevel: newLevel });
    vscode?.postMessage({
      type: "updateSettings",
      payload: { thinkingLevel: newLevel },
    });
  },

  toggleModelPicker: () => {
    set((state) => ({ showModelPicker: !state.showModelPicker }));
  },

  login: () => {
    vscode?.postMessage({ type: "login", payload: {} });
  },

  logout: () => {
    vscode?.postMessage({ type: "logout", payload: {} });
    set({
      isLoggedIn: false,
      currentEmail: null,
      accounts: [],
      activeIndex: -1,
    });
  },

  addAccount: () => {
    vscode?.postMessage({ type: "login", payload: {} });
  },

  switchAccount: (index: number) => {
    vscode?.postMessage({ type: "switchAccount", payload: { index } });
  },

  deleteAccount: (index: number) => {
    vscode?.postMessage({ type: "deleteAccount", payload: { index } });
  },

  setLocale: (locale: Locale) => {
    setI18nLocale(locale);
    set({ locale });
  },
}));

// Extension에서 오는 메시지 핸들러
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    const message = event.data;

    switch (message.type) {
      case "receiveMessage":
        useStore.setState((state) => ({
          messages: [...state.messages, message.payload],
          isStreaming: false,
        }));
        break;

      case "streamChunk":
        if (message.payload.type === "thinking") {
          useStore.setState({ currentThinking: message.payload.content });
        } else if (message.payload.type === "token_usage") {
          useStore.setState((state) => ({
            totalTokensUsed:
              state.totalTokensUsed + message.payload.tokenUsage.totalTokens,
          }));
        }
        break;

      case "login":
        if (message.payload.success) {
          useStore.setState({
            isLoggedIn: true,
            currentEmail: message.payload.email,
            accounts: message.payload.accounts ?? [],
            activeIndex: message.payload.activeIndex ?? 0,
          });
        }
        break;

      case "logout":
        useStore.setState({
          isLoggedIn: false,
          currentEmail: null,
          accounts: [],
          activeIndex: -1,
        });
        break;

      case "updateSettings":
        useStore.setState({
          isLoggedIn: message.payload.isLoggedIn ?? false,
          currentEmail: message.payload.currentEmail ?? null,
          accounts: message.payload.accounts ?? [],
          activeIndex: message.payload.activeIndex ?? -1,
          model: message.payload.model ?? "antigravity-gemini-3-flash",
          thinkingLevel: message.payload.thinkingLevel ?? "high",
          mode: message.payload.mode ?? "edit",
          messages: message.payload.messages ?? [],
        });
        break;

      case "error":
        console.error("Error from extension:", message.payload.message);
        break;
    }
  });

  // 키보드 단축키 핸들러
  window.addEventListener("keydown", (event) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modKey = isMac ? event.metaKey : event.ctrlKey;

    // Ctrl + .: Thinking Level 순환
    if (event.ctrlKey && event.key === ".") {
      event.preventDefault();
      useStore.getState().cycleThinkingLevel();
    }

    // Cmd/Ctrl + /: 모델 선택 토글
    if (modKey && event.key === "/") {
      event.preventDefault();
      useStore.getState().toggleModelPicker();
    }

    // Ctrl + ': Edit ↔ Plan 모드 전환
    if (event.ctrlKey && event.key === "'") {
      event.preventDefault();
      const currentMode = useStore.getState().mode;
      useStore.getState().setMode(currentMode === "plan" ? "edit" : "plan");
    }
  });
}

export type { Account, AgentMode, AIModel, ChatMessage, ThinkingLevel };
