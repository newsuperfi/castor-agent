import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { useStore, type AIModel } from "../store";

// 모델 설정
interface ModelConfig {
  value: AIModel;
  label: string;
  category: "antigravity" | "gemini-cli";
  hasThinking?: boolean;
}

const MODELS: ModelConfig[] = [
  // Antigravity 쿼터
  {
    value: "antigravity-gemini-3-flash",
    label: "Gemini 3 Flash",
    category: "antigravity",
    hasThinking: true,
  },
  {
    value: "antigravity-gemini-3-pro",
    label: "Gemini 3 Pro",
    category: "antigravity",
    hasThinking: true,
  },
  {
    value: "antigravity-claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    category: "antigravity",
  },
  {
    value: "antigravity-claude-sonnet-4-5-thinking",
    label: "Claude Sonnet 4.5 Thinking",
    category: "antigravity",
    hasThinking: true,
  },
  {
    value: "antigravity-claude-opus-4-5-thinking",
    label: "Claude Opus 4.5 Thinking",
    category: "antigravity",
    hasThinking: true,
  },
  // Gemini CLI 쿼터
  {
    value: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    category: "gemini-cli",
  },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", category: "gemini-cli" },
  {
    value: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    category: "gemini-cli",
  },
  {
    value: "gemini-3-pro-preview",
    label: "Gemini 3 Pro Preview",
    category: "gemini-cli",
  },
];

interface ChatInputBarProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInputBar({ onSend, disabled }: ChatInputBarProps) {
  const [input, setInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    mode,
    model,
    thinkingLevel,
    showModelPicker,
    setMode,
    setModel,
    cycleThinkingLevel,
    toggleModelPicker,
  } = useStore();

  const currentModel = MODELS.find((m) => m.value === model);
  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modKey = isMac ? "⌘" : "Ctrl";

  // 드롭다운 열릴 때 현재 모델 인덱스로 초기화 & 포커스
  useEffect(() => {
    if (showModelPicker) {
      const idx = MODELS.findIndex((m) => m.value === model);
      setSelectedIndex(idx >= 0 ? idx : 0);
      dropdownRef.current?.focus();
    }
  }, [showModelPicker, model]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleDropdownKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, MODELS.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        setModel(MODELS[selectedIndex].value);
        toggleModelPicker();
        break;
      case "Escape":
        e.preventDefault();
        toggleModelPicker();
        break;
    }
  };

  return (
    <div className="border-t border-vscode-border bg-vscode-bg relative">
      {/* 모델 선택 팝업 (위로 열림) */}
      {showModelPicker && (
        <div
          ref={dropdownRef}
          tabIndex={0}
          onKeyDown={handleDropdownKeyDown}
          onBlur={(e) => {
            // 드롭다운 외부 클릭 시 닫기
            if (!e.currentTarget.contains(e.relatedTarget)) {
              toggleModelPicker();
            }
          }}
          className="absolute bottom-full left-0 right-0 mb-2 mx-4 bg-vscode-input border border-vscode-border rounded-lg shadow-xl max-h-64 overflow-y-auto z-10 outline-none"
        >
          <div className="p-2">
            <div className="text-xs opacity-50 px-2 py-1">Antigravity</div>
            {MODELS.filter((m) => m.category === "antigravity").map((m) => {
              const globalIndex = MODELS.findIndex((x) => x.value === m.value);
              return (
                <button
                  key={m.value}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    globalIndex === selectedIndex
                      ? "bg-blue-600 text-white"
                      : model === m.value
                        ? "bg-vscode-hover"
                        : "hover:bg-vscode-hover"
                  }`}
                  onClick={() => setModel(m.value)}
                >
                  {globalIndex === selectedIndex && (
                    <span className="mr-2">→</span>
                  )}
                  {m.label}
                  {m.hasThinking && (
                    <span className="ml-2 text-xs opacity-70">[T]</span>
                  )}
                </button>
              );
            })}
            <div className="text-xs opacity-50 px-2 py-1 mt-2">Gemini CLI</div>
            {MODELS.filter((m) => m.category === "gemini-cli").map((m) => {
              const globalIndex = MODELS.findIndex((x) => x.value === m.value);
              return (
                <button
                  key={m.value}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    globalIndex === selectedIndex
                      ? "bg-blue-600 text-white"
                      : model === m.value
                        ? "bg-vscode-hover"
                        : "hover:bg-vscode-hover"
                  }`}
                  onClick={() => setModel(m.value)}
                >
                  {globalIndex === selectedIndex && (
                    <span className="mr-2">→</span>
                  )}
                  {m.label}
                </button>
              );
            })}
          </div>
          <div className="text-[10px] opacity-40 text-center pb-2">
            ↑↓ 이동 · Enter 선택 · Esc 닫기
          </div>
        </div>
      )}

      {/* 입력 영역 */}
      <div className="p-3">
        <form onSubmit={handleSubmit}>
          <div className="bg-vscode-input rounded-lg border border-vscode-border focus-within:border-vscode-focus">
            {/* 텍스트 입력 */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("inputPlaceholder")}
              className="w-full bg-transparent p-3 resize-none focus:outline-none text-sm"
              rows={3}
              disabled={disabled}
            />

            {/* 하단 컨트롤 바 */}
            <div className="flex items-center justify-between px-3 pb-2 border-t border-vscode-border pt-2">
              {/* 왼쪽: 모드 & 모델 */}
              <div className="flex items-center gap-2">
                {/* 모드 토글 (Edit / Plan) */}
                <div className="flex bg-vscode-bg rounded overflow-hidden text-xs">
                  <button
                    type="button"
                    className={`px-2 py-1 ${
                      mode === "edit"
                        ? "bg-vscode-button text-vscode-button-fg"
                        : "opacity-60 hover:opacity-100"
                    }`}
                    onClick={() => setMode("edit")}
                    title="Edit (Ctrl+')"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-1 ${
                      mode === "plan"
                        ? "bg-vscode-button text-vscode-button-fg"
                        : "opacity-60 hover:opacity-100"
                    }`}
                    onClick={() => setMode("plan")}
                    title="Plan (Ctrl+')"
                  >
                    Plan
                  </button>
                </div>

                {/* 모델 선택 버튼 */}
                <button
                  type="button"
                  className="text-xs opacity-60 hover:opacity-100 flex items-center gap-1"
                  onClick={toggleModelPicker}
                  title={`${modKey}+/`}
                >
                  <span>{currentModel?.label || model}</span>
                  <span className="text-[10px]">▲</span>
                </button>

                {/* Thinking Level (지원 모델에만 표시) */}
                {currentModel?.hasThinking && (
                  <button
                    type="button"
                    className="text-xs opacity-60 hover:opacity-100 border border-vscode-border rounded px-2 py-0.5"
                    onClick={cycleThinkingLevel}
                    title={`Thinking: ${thinkingLevel} (Ctrl+.)`}
                  >
                    <span className="capitalize">{thinkingLevel}</span>
                  </button>
                )}
              </div>

              {/* 오른쪽: 전송 버튼 */}
              <button
                type="submit"
                disabled={!input.trim() || disabled}
                className="btn-primary text-xs px-3 py-1 disabled:opacity-50"
              >
                {t("send")}
              </button>
            </div>
          </div>
        </form>

        {/* 단축키 힌트 */}
        <div className="flex justify-center gap-4 mt-2 text-[10px] opacity-40">
          <span>{modKey}+/ 모델</span>
          <span>Ctrl+. 사고레벨</span>
          <span>Ctrl+' 모드</span>
        </div>
      </div>
    </div>
  );
}
