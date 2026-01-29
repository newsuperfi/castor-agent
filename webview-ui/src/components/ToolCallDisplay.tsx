/**
 * 도구 호출 표시 컴포넌트
 * 진행 상황, 성공/실패 상태 시각화
 */

import { useState } from "react";

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: "pending" | "running" | "completed" | "error";
}

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  isCompact?: boolean;
}

export function ToolCallDisplay({
  toolCall,
  isCompact = false,
}: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusConfig: Record<
    string,
    { icon: string; color: string; label: string; animate?: boolean }
  > = {
    pending: { icon: "⏳", color: "text-gray-400", label: "대기 중" },
    running: {
      icon: "⚡",
      color: "text-yellow-400",
      label: "실행 중",
      animate: true,
    },
    completed: { icon: "[ok]", color: "text-green-400", label: "Done" },
    error: { icon: "[x]", color: "text-red-400", label: "Error" },
  };

  const config = statusConfig[toolCall.status];

  // 도구별 아이콘
  const toolIcons: Record<string, string> = {
    read_file: "[R]",
    write_file: "[W]",
    list_dir: "[D]",
    run_command: "[C]",
  };
  const toolIcon = toolIcons[toolCall.name] || "[T]";

  // 간단한 인자 요약
  const getArgsSummary = () => {
    const args = toolCall.arguments;
    if (toolCall.name === "read_file" || toolCall.name === "write_file") {
      return args.path || args.filePath || "";
    }
    if (toolCall.name === "list_dir") {
      return args.path || args.directory || "";
    }
    if (toolCall.name === "run_command") {
      const cmd = String(args.command || "");
      return cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd;
    }
    return "";
  };

  if (isCompact) {
    return (
      <div className={`flex items-center gap-2 text-xs ${config.color}`}>
        <span className={config.animate ? "animate-pulse" : ""}>
          {config.icon}
        </span>
        <span className="font-mono">{toolCall.name}</span>
        {toolCall.status === "running" && (
          <span className="opacity-60 animate-pulse">실행 중...</span>
        )}
      </div>
    );
  }

  return (
    <div className="border border-vscode-border rounded-lg overflow-hidden text-sm">
      {/* 헤더 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-vscode-hover transition-colors ${config.color}`}
      >
        {/* 도구 아이콘 */}
        <span className="text-base">{toolIcon}</span>

        {/* 도구 이름 */}
        <span className="font-mono font-medium">{toolCall.name}</span>

        {/* 인자 요약 */}
        <span className="opacity-50 truncate flex-1 text-left text-xs">
          {String(getArgsSummary())}
        </span>

        {/* 상태 */}
        <span
          className={`flex items-center gap-1 ${config.animate ? "animate-pulse" : ""}`}
        >
          {toolCall.status === "running" && (
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          )}
          <span>{config.icon}</span>
        </span>

        {/* 확장 아이콘 */}
        <span className="opacity-50 text-xs">{isExpanded ? "▼" : "▶"}</span>
      </button>

      {/* 확장된 내용 */}
      {isExpanded && (
        <div className="border-t border-vscode-border">
          {/* 인자 */}
          <div className="px-3 py-2 bg-black/10">
            <div className="text-xs opacity-60 mb-1">인자</div>
            <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>

          {/* 결과 */}
          {toolCall.result && (
            <div className="px-3 py-2 border-t border-vscode-border">
              <div className="text-xs opacity-60 mb-1">결과</div>
              <pre className="text-xs whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto bg-black/20 p-2 rounded">
                {toolCall.result.length > 1000
                  ? toolCall.result.slice(0, 1000) + "\n... (truncated)"
                  : toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 도구 호출 목록 컴포넌트
 */
interface ToolCallListProps {
  toolCalls: ToolCall[];
}

export function ToolCallList({ toolCalls }: ToolCallListProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="space-y-2 my-2">
      {toolCalls.map((tc) => (
        <ToolCallDisplay key={tc.id} toolCall={tc} />
      ))}
    </div>
  );
}
