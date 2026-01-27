import { useState } from "react";
import { t } from "../i18n";

interface ThinkingAccordionProps {
  content: string;
}

type ThinkingStatus = "thinking" | "tool_use" | "decision";

export function ThinkingAccordion({ content }: ThinkingAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  // 상태 감지
  const status = detectStatus(content);

  const statusConfig = {
    thinking: { label: t("thinking"), color: "text-blue-400" },
    tool_use: { label: "Tool...", color: "text-green-400" },
    decision: { label: "Done", color: "text-orange-400" },
  };

  const config = statusConfig[status];

  return (
    <div className="border border-vscode-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full px-4 py-2 flex items-center justify-between
          hover:bg-vscode-input-bg transition-colors
        `}
      >
        <div className={`flex items-center gap-2 ${config.color}`}>
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          <span className="text-sm">{config.label}</span>
        </div>
        <span className="text-xs opacity-50">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="px-4 py-3 border-t border-vscode-border bg-black/10">
          <pre className="text-xs whitespace-pre-wrap opacity-80 max-h-48 overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * 사고 내용에서 상태 감지
 */
function detectStatus(content: string): ThinkingStatus {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes("call:") || lowerContent.includes("tool")) {
    return "tool_use";
  }

  if (lowerContent.includes("decision") || lowerContent.includes("결정")) {
    return "decision";
  }

  return "thinking";
}
