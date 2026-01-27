import { t } from "../i18n";
import { Locale, useStore } from "../store";

interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const {
    accounts,
    activeIndex,
    locale,
    logout,
    addAccount,
    switchAccount,
    deleteAccount,
    setLocale,
  } = useStore();

  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-vscode-bg">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-border">
        <h2 className="font-semibold">{t("settings")}</h2>
        <button
          onClick={onClose}
          className="opacity-60 hover:opacity-100 text-lg"
          title="Close"
        >
          ×
        </button>
      </div>

      {/* 설정 내용 */}
      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* 계정 섹션 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium opacity-80">{t("account")}</h3>
            <button
              onClick={addAccount}
              className="text-xs opacity-60 hover:opacity-100"
              title="계정 추가"
            >
              + 추가
            </button>
          </div>

          <div className="bg-vscode-input rounded space-y-1 overflow-hidden">
            {accounts.length > 0 ? (
              accounts.map((account, index) => (
                <div
                  key={account.email}
                  className={`flex items-center justify-between p-3 cursor-pointer hover:bg-vscode-hover ${
                    index === activeIndex ? "bg-vscode-hover" : ""
                  }`}
                  onClick={() => switchAccount(index)}
                >
                  <div className="flex items-center gap-2">
                    {index === activeIndex && (
                      <span className="text-green-500">●</span>
                    )}
                    <span className="text-sm">{account.email}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAccount(index);
                    }}
                    className="opacity-40 hover:opacity-100 text-xs hover:text-red-400"
                    title="계정 삭제"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="p-3 text-sm opacity-60">{t("notLoggedIn")}</div>
            )}
          </div>

          {accounts.length > 0 && (
            <button
              onClick={handleLogout}
              className="w-full btn-secondary text-sm py-2"
            >
              모두 로그아웃
            </button>
          )}
        </section>

        {/* 언어 섹션 */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium opacity-80">{t("language")}</h3>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="input w-full"
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </section>

        {/* 정보 섹션 */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium opacity-80">{t("about")}</h3>
          <div className="text-xs opacity-60 space-y-1">
            <p>Castor Agent v0.0.1</p>
          </div>
        </section>
      </div>
    </div>
  );
}
