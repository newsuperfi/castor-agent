import { useEffect, useRef, useState } from "react";
import { ChatBubble } from "./components/ChatBubble";
import { ChatInputBar } from "./components/ChatInputBar";
import { HeaderBar } from "./components/HeaderBar";
import { SettingsPage } from "./components/SettingsPage";
import { ThinkingAccordion } from "./components/ThinkingAccordion";
import { t } from "./i18n";
import { useStore } from "./store";

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    currentThinking,
    isLoggedIn,
    sendMessage,
    login,
  } = useStore();

  // 메시지 추가 시 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 로그인 필요 시
  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold">{t("welcomeTitle")}</h1>
          <p className="text-sm opacity-80">{t("welcomeDescription")}</p>
          <button onClick={login} className="btn-primary">
            {t("loginWithAntigravity")}
          </button>
          <div className="pt-4 border-t border-vscode-border mt-4">
            <button
              onClick={() =>
                useStore.setState({
                  isLoggedIn: true,
                  currentEmail: "dev@test.com",
                })
              }
              className="btn-secondary text-xs opacity-60"
            >
              {t("devMode")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 설정 페이지
  if (showSettings) {
    return <SettingsPage onClose={() => setShowSettings(false)} />;
  }

  return (
    <div className="flex flex-col h-screen relative">
      {/* 헤더 - 간소화된 상태 표시 + 설정 버튼 */}
      <HeaderBar onSettingsClick={() => setShowSettings(true)} />

      {/* 채팅 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 opacity-60">
            <p>{t("emptyChat")}</p>
            <p className="text-xs mt-2">{t("emptyChatHint")}</p>
          </div>
        )}

        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}

        {/* 사고 과정 표시 */}
        {isStreaming && currentThinking && (
          <ThinkingAccordion content={currentThinking} />
        )}

        {/* 로딩 인디케이터 */}
        {isStreaming && !currentThinking && (
          <div className="flex items-center gap-2 text-sm opacity-60">
            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            <span>{t("thinking")}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 하단 입력 영역 (Cursor 스타일) */}
      <ChatInputBar onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
