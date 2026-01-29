import { t } from "../i18n";
import type { ChatMessage } from "../store";
import { useStore } from "../store";
import { DiffPreview } from "./DiffPreview";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallList } from "./ToolCallDisplay";

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const {
    pendingChanges,
    acceptChange,
    rejectChange,
    acceptAllChanges,
    rejectAllChanges,
  } = useStore();

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          chat-message max-w-[85%] rounded-lg px-4 py-3 space-y-2 overflow-hidden
          ${
            isUser
              ? "bg-vscode-button-bg text-vscode-button-fg"
              : isSystem
                ? "bg-yellow-500/20 border border-yellow-500/40"
                : "bg-vscode-input-bg"
          }
        `}
      >
        {/* 역할 표시 */}
        {!isUser && (
          <div className="text-xs opacity-60 font-medium">
            {isSystem ? t("systemLabel") : t("assistantLabel")}
          </div>
        )}

        {/* 사고 과정 (있으면 접힌 상태로 표시) */}
        {message.thinking && (
          <details className="text-xs opacity-70">
            <summary className="cursor-pointer hover:opacity-100">
              {t("showThinking")}
            </summary>
            <pre className="mt-2 p-2 rounded bg-black/20 whitespace-pre-wrap overflow-x-auto">
              {message.thinking}
            </pre>
          </details>
        )}

        {/* 메시지 내용 - 마크다운 렌더링 */}
        <div className="prose prose-invert prose-sm max-w-none">
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>

        {/* 도구 실행 결과 */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallList toolCalls={message.toolCalls} />
        )}

        {/* Diff Preview (파일 변경사항) */}
        {pendingChanges.length > 0 && (
          <DiffPreview
            changes={pendingChanges}
            onAccept={acceptChange}
            onReject={rejectChange}
            onAcceptAll={acceptAllChanges}
            onRejectAll={rejectAllChanges}
          />
        )}

        {/* 토큰 사용량 */}
        {message.tokenUsage && (
          <div className="text-xs opacity-50 flex gap-2">
            <span>In: {message.tokenUsage.inputTokens}</span>
            <span>Out: {message.tokenUsage.outputTokens}</span>
          </div>
        )}

        {/* 타임스탬프 */}
        <div className="text-xs opacity-40">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

/**
 * 시간 포맷팅
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
