import { t } from "../i18n";
import type { ChatMessage } from "../store";

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[85%] rounded-lg px-4 py-3 space-y-2
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

        {/* 메시지 내용 */}
        <div className="whitespace-pre-wrap break-words">
          {formatMessage(message.content)}
        </div>

        {/* 도구 실행 결과 (접기/펴기) */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2 mt-2">
            {message.toolCalls.map((tc) => (
              <details
                key={tc.id}
                className="text-xs border border-vscode-border rounded overflow-hidden"
              >
                <summary
                  className={`cursor-pointer px-3 py-2 hover:bg-vscode-hover flex items-center gap-2 ${
                    tc.status === "completed"
                      ? "text-green-400"
                      : tc.status === "error"
                        ? "text-red-400"
                        : "text-yellow-400"
                  }`}
                >
                  <span className="font-mono">{tc.name}</span>
                  <span className="opacity-50">
                    {tc.status === "completed"
                      ? "✓"
                      : tc.status === "error"
                        ? "✗"
                        : "⋯"}
                  </span>
                </summary>
                {tc.result && (
                  <pre className="px-3 py-2 bg-black/20 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                    {tc.result}
                  </pre>
                )}
              </details>
            ))}
          </div>
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
 * 메시지 포맷팅 (마크다운 일부 지원)
 */
function formatMessage(content: string): React.ReactNode {
  // 코드 블록 처리
  const parts = content.split(/(```[\s\S]*?```)/g);

  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const codeContent = part.slice(3, -3);
      const firstNewline = codeContent.indexOf("\n");
      const language =
        firstNewline > 0 ? codeContent.slice(0, firstNewline) : "";
      const code =
        firstNewline > 0 ? codeContent.slice(firstNewline + 1) : codeContent;

      return (
        <pre key={i} className="code-block my-2">
          {language && (
            <div className="text-xs opacity-50 mb-1">{language}</div>
          )}
          <code>{code}</code>
        </pre>
      );
    }

    // 인라인 코드 처리
    return part.split(/(`[^`]+`)/g).map((segment, j) => {
      if (segment.startsWith("`") && segment.endsWith("`")) {
        return (
          <code key={`${i}-${j}`} className="px-1 py-0.5 rounded bg-black/20">
            {segment.slice(1, -1)}
          </code>
        );
      }
      return segment;
    });
  });
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
