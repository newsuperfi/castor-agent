import { useStore } from "../store";

/**
 * 모델명으로 Provider 판별
 */
function getProviderFromModel(
  model: string,
): "Antigravity" | "Gemini CLI" | "Personal" {
  // Antigravity 모델: antigravity- 프리픽스
  if (model.startsWith("antigravity-")) {
    return "Antigravity";
  }

  // Gemini CLI 모델: gemini-2.5 또는 gemini-3 (프리픽스 없음)
  if (model.startsWith("gemini-2.5-") || model.startsWith("gemini-3-")) {
    return "Gemini CLI";
  }

  // 나머지는 Personal
  return "Personal";
}

interface HeaderBarProps {
  onSettingsClick: () => void;
}

export function HeaderBar({ onSettingsClick }: HeaderBarProps) {
  const { model } = useStore();

  const provider = getProviderFromModel(model);

  // 모델명 간소화 (antigravity- 프리픽스 제거)
  const displayModel = model
    .replace("antigravity-", "")
    .replace("-preview", "");

  return (
    <div className="sticky top-0 z-10 bg-vscode-bg border-b border-vscode-border px-4 py-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {/* 제공자 상태 */}
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-medium">{provider}</span>
          </div>

          {/* 현재 모델 */}
          <span className="opacity-60">{displayModel}</span>
        </div>

        {/* 설정 버튼 */}
        <button
          onClick={onSettingsClick}
          className="opacity-60 hover:opacity-100 transition-opacity p-1"
          title="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
