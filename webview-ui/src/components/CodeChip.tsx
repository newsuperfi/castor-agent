import { useCallback, useState } from "react";

interface CodeChipProps {
  fileName: string;
  content: string;
  onRemove: () => void;
}

export function CodeChip({ fileName, content, onRemove }: CodeChipProps) {
  const [showPreview, setShowPreview] = useState(false);

  const truncatedContent =
    content.length > 500 ? content.slice(0, 500) + "..." : content;

  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-vscode-input-bg border border-vscode-border">
      <span className="text-xs">📄</span>
      <span
        className="text-xs font-medium cursor-help"
        onMouseEnter={() => setShowPreview(true)}
        onMouseLeave={() => setShowPreview(false)}
      >
        {fileName}
      </span>
      <button
        onClick={onRemove}
        className="text-xs opacity-60 hover:opacity-100 ml-1"
      >
        ✕
      </button>

      {/* 프리뷰 툴팁 */}
      {showPreview && (
        <div className="absolute z-20 mt-8 p-2 max-w-md bg-vscode-input-bg border border-vscode-border rounded shadow-lg">
          <pre className="text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
            {truncatedContent}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * 코드 첨부 영역 훅
 */
export function useCodeChips() {
  const [chips, setChips] = useState<
    Array<{ id: string; fileName: string; content: string }>
  >([]);

  const addChip = useCallback((fileName: string, content: string) => {
    setChips((prev) => [
      ...prev,
      { id: crypto.randomUUID(), fileName, content },
    ]);
  }, []);

  const removeChip = useCallback((id: string) => {
    setChips((prev) => prev.filter((chip) => chip.id !== id));
  }, []);

  const clearChips = useCallback(() => {
    setChips([]);
  }, []);

  // 붙여넣기 핸들러
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text");

      if (text && isCodeLike(text)) {
        e.preventDefault();
        const fileName = detectFileName(text) || `code-${Date.now()}.txt`;
        addChip(fileName, text);
      }
    },
    [addChip],
  );

  // 드래그앤드롭 핸들러
  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();

      const files = e.dataTransfer?.files;
      if (files) {
        Array.from(files).forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            const content = reader.result as string;
            addChip(file.name, content);
          };
          reader.readAsText(file);
        });
      }
    },
    [addChip],
  );

  return {
    chips,
    addChip,
    removeChip,
    clearChips,
    handlePaste,
    handleDrop,
  };
}

/**
 * 코드처럼 보이는지 휴리스틱 검사
 */
function isCodeLike(text: string): boolean {
  // 여러 줄 + 특수 문자 포함
  if (text.split("\n").length > 3) return true;

  // 코드 패턴 감지
  const codePatterns = [
    /function\s+\w+/,
    /const\s+\w+\s*=/,
    /import\s+.*from/,
    /class\s+\w+/,
    /def\s+\w+/,
    /<\w+[\s>]/,
    /\{\s*\n/,
  ];

  return codePatterns.some((p) => p.test(text));
}

/**
 * 텍스트에서 파일명 추출 시도
 */
function detectFileName(text: string): string | null {
  // 첫 줄에서 파일 경로 패턴 찾기
  const firstLine = text.split("\n")[0];

  const patterns = [
    /\/\/\s*(.+\.\w+)/, // // filename.ts
    /#\s*(.+\.\w+)/, // # filename.py
    /<!--\s*(.+\.\w+)/, // <!-- filename.html
  ];

  for (const p of patterns) {
    const match = firstLine.match(p);
    if (match) return match[1];
  }

  return null;
}
