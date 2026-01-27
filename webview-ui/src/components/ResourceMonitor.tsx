import { t } from "../i18n";
import { Locale, useStore } from "../store";

export function ResourceMonitor() {
  const { currentEmail, model, locale, logout, setLocale } = useStore();

  // 제공자 표시
  const isAntigravity = model.includes("3") || model.includes("claude");
  const provider = isAntigravity ? "Antigravity" : "Personal";

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
          <span className="opacity-60">{model.replace("-preview", "")}</span>
        </div>

        {/* 계정 정보 & 설정 */}
        <div className="flex items-center gap-3">
          {/* 언어 선택 */}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="input text-xs py-0.5 px-1 w-auto opacity-60"
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>

          {currentEmail && (
            <span className="opacity-60 truncate max-w-32">{currentEmail}</span>
          )}
          <button
            onClick={logout}
            className="opacity-60 hover:opacity-100 transition-opacity"
            title={t("logout")}
          >
            [{t("logout")}]
          </button>
        </div>
      </div>
    </div>
  );
}
