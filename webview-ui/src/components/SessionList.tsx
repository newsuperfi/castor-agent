import { useStore } from "../store";

/**
 * 세션 목록 사이드패널
 */
export function SessionList() {
  const {
    sessions,
    currentSessionId,
    showSessionList,
    newSession,
    loadSession,
    deleteSession,
    toggleSessionList,
  } = useStore();

  if (!showSessionList) return null;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "방금";
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50" onClick={toggleSessionList}>
      <div
        className="absolute left-0 top-0 bottom-0 w-72 bg-vscode-bg border-r border-vscode-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-border">
          <h2 className="font-semibold text-sm">대화 목록</h2>
          <button
            onClick={toggleSessionList}
            className="opacity-60 hover:opacity-100 text-lg"
          >
            ×
          </button>
        </div>

        {/* 새 대화 버튼 */}
        <div className="p-2">
          <button
            onClick={() => {
              newSession();
              toggleSessionList();
            }}
            className="w-full btn-primary text-sm py-2 flex items-center justify-center gap-2"
          >
            <span>+</span>
            <span>새 대화</span>
          </button>
        </div>

        {/* 세션 목록 */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-center py-8 opacity-50 text-sm">
              대화 기록이 없습니다
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer ${
                    session.id === currentSessionId
                      ? "bg-vscode-button text-vscode-button-fg"
                      : "hover:bg-vscode-hover"
                  }`}
                  onClick={() => {
                    loadSession(session.id);
                    toggleSessionList();
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {session.title}
                    </div>
                    <div className="text-xs opacity-60 flex items-center gap-2">
                      <span>{formatDate(session.updatedAt)}</span>
                      <span>·</span>
                      <span>{session.messageCount}개 메시지</span>
                    </div>
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("이 대화를 삭제하시겠습니까?")) {
                        deleteSession(session.id);
                      }
                    }}
                    className={`opacity-0 group-hover:opacity-60 hover:opacity-100 ml-2 p-1 hover:text-red-400 ${
                      session.id === currentSessionId ? "text-white" : ""
                    }`}
                    title="삭제"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
