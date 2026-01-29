/**
 * Diff 미리보기 컴포넌트
 * 파일 변경사항 표시 + Accept/Reject 버튼
 */

import { useState } from "react";

// VS Code postMessage 타입
declare const vscode: { postMessage: (msg: unknown) => void } | undefined;

interface FileChange {
  id: string;
  filePath: string;
  fileName: string;
  changeType: "create" | "modify" | "delete";
  originalContent?: string;
  newContent: string;
  diff?: string;
  status: "pending" | "accepted" | "rejected";
}

interface DiffPreviewProps {
  changes: FileChange[];
  onAccept: (fileId: string) => void;
  onReject: (fileId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

export function DiffPreview({
  changes,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: DiffPreviewProps) {
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  const pendingChanges = changes.filter((c) => c.status === "pending");
  const selectedFile = changes[selectedFileIndex];

  const getChangeIcon = (type: FileChange["changeType"]) => {
    switch (type) {
      case "create":
        return "[+]";
      case "modify":
        return "[M]";
      case "delete":
        return "[-]";
    }
  };

  const getStatusBadge = (status: FileChange["status"]) => {
    switch (status) {
      case "accepted":
        return <span className="text-green-400 text-xs ml-2">Applied</span>;
      case "rejected":
        return <span className="text-red-400 text-xs ml-2">Rejected</span>;
      default:
        return null;
    }
  };

  if (changes.length === 0) return null;

  return (
    <div className="my-3 border border-vscode-border rounded-lg overflow-hidden bg-[#1e1e1e]">
      {/* 헤더: 파일 목록 + 전체 액션 */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-vscode-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Changed Files</span>
          <span className="text-xs opacity-60">
            ({pendingChanges.length}/{changes.length} 대기 중)
          </span>
        </div>
        {pendingChanges.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={onAcceptAll}
              className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white"
            >
              Accept All
            </button>
            <button
              onClick={onRejectAll}
              className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white"
            >
              Reject All
            </button>
          </div>
        )}
      </div>

      {/* 파일 탭 (여러 파일일 때) */}
      {changes.length > 1 && (
        <div className="flex overflow-x-auto border-b border-vscode-border bg-[#2d2d2d]">
          {changes.map((file, index) => (
            <button
              key={file.id}
              onClick={() => setSelectedFileIndex(index)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs whitespace-nowrap border-r border-vscode-border ${
                index === selectedFileIndex
                  ? "bg-[#1e1e1e] text-white"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <span>{getChangeIcon(file.changeType)}</span>
              <span>{file.fileName}</span>
              {getStatusBadge(file.status)}
            </button>
          ))}
        </div>
      )}

      {/* 선택된 파일 diff */}
      {selectedFile && (
        <div>
          {/* 파일 경로 + 개별 액션 */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#252526]">
            <div className="flex items-center gap-2 text-xs">
              <span>{getChangeIcon(selectedFile.changeType)}</span>
              <span className="opacity-60">{selectedFile.filePath}</span>
              {getStatusBadge(selectedFile.status)}
            </div>
            {selectedFile.status === "pending" && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (typeof vscode !== "undefined") {
                      vscode.postMessage({
                        type: "showDiffInEditor",
                        payload: {
                          fileId: selectedFile.id,
                          filePath: selectedFile.filePath,
                          originalContent: selectedFile.originalContent || "",
                          newContent: selectedFile.newContent,
                        },
                      });
                    }
                  }}
                  className="text-xs px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-400"
                >
                  Open in Editor
                </button>
                <button
                  onClick={() => onAccept(selectedFile.id)}
                  className="text-xs px-2 py-0.5 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400"
                >
                  Accept
                </button>
                <button
                  onClick={() => onReject(selectedFile.id)}
                  className="text-xs px-2 py-0.5 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400"
                >
                  Reject
                </button>
              </div>
            )}
          </div>

          {/* Diff 내용 */}
          <div className="max-h-80 overflow-auto">
            <DiffContent
              changeType={selectedFile.changeType}
              originalContent={selectedFile.originalContent}
              newContent={selectedFile.newContent}
              diff={selectedFile.diff}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Diff 내용 렌더링
 */
function DiffContent({
  changeType,
  originalContent,
  newContent,
  diff,
}: {
  changeType: FileChange["changeType"];
  originalContent?: string;
  newContent: string;
  diff?: string;
}) {
  // diff가 있으면 그대로 표시
  if (diff) {
    return (
      <pre className="text-xs font-mono p-3 overflow-x-auto">
        {diff.split("\n").map((line, i) => (
          <div
            key={i}
            className={
              line.startsWith("+")
                ? "bg-green-900/30 text-green-300"
                : line.startsWith("-")
                  ? "bg-red-900/30 text-red-300"
                  : line.startsWith("@@")
                    ? "text-blue-400"
                    : "opacity-70"
            }
          >
            {line}
          </div>
        ))}
      </pre>
    );
  }

  // 새 파일 생성
  if (changeType === "create") {
    return (
      <pre className="text-xs font-mono p-3 overflow-x-auto">
        {newContent.split("\n").map((line, i) => (
          <div key={i} className="bg-green-900/30 text-green-300">
            + {line}
          </div>
        ))}
      </pre>
    );
  }

  // 파일 삭제
  if (changeType === "delete" && originalContent) {
    return (
      <pre className="text-xs font-mono p-3 overflow-x-auto">
        {originalContent.split("\n").map((line, i) => (
          <div key={i} className="bg-red-900/30 text-red-300">
            - {line}
          </div>
        ))}
      </pre>
    );
  }

  // 수정 (간단한 전체 교체 표시)
  return (
    <pre className="text-xs font-mono p-3 overflow-x-auto">
      <div className="text-green-300 opacity-70 mb-2">// 새 내용</div>
      {newContent
        .split("\n")
        .slice(0, 50)
        .map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      {newContent.split("\n").length > 50 && (
        <div className="opacity-50">
          ... ({newContent.split("\n").length - 50}줄 생략)
        </div>
      )}
    </pre>
  );
}
