/**
 * 이미지 드롭존 컴포넌트
 * 드래그앤드롭 또는 클릭으로 이미지 첨부
 */

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useState } from "react";

export interface ImageAttachment {
  id: string;
  name: string;
  type: string;
  data: string; // base64
  size: number;
}

interface ImageDropZoneProps {
  onImagesAdded: (images: ImageAttachment[]) => void;
  maxImages?: number;
  maxSizeBytes?: number;
}

export function ImageDropZone({
  onImagesAdded,
  maxImages = 5,
  maxSizeBytes = 10 * 1024 * 1024, // 10MB
}: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setError(null);
      const images: ImageAttachment[] = [];

      for (let i = 0; i < Math.min(files.length, maxImages); i++) {
        const file = files[i];

        // 이미지 타입 확인
        if (!file.type.startsWith("image/")) {
          setError(`${file.name}은(는) 이미지 파일이 아닙니다.`);
          continue;
        }

        // 크기 확인
        if (file.size > maxSizeBytes) {
          setError(
            `${file.name}이(가) 너무 큽니다. (최대 ${Math.round(maxSizeBytes / 1024 / 1024)}MB)`,
          );
          continue;
        }

        // Base64로 변환
        try {
          const base64 = await fileToBase64(file);
          images.push({
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type,
            data: base64,
            size: file.size,
          });
        } catch {
          setError(`${file.name} 처리 중 오류가 발생했습니다.`);
        }
      }

      if (images.length > 0) {
        onImagesAdded(images);
      }
    },
    [onImagesAdded, maxImages, maxSizeBytes],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles],
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files);
      e.target.value = ""; // 같은 파일 다시 선택 가능
    },
    [processFiles],
  );

  return (
    <div className="relative">
      {/* 드래그 영역 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-3 text-center text-xs
          transition-colors cursor-pointer
          ${
            isDragging
              ? "border-blue-400 bg-blue-400/10"
              : "border-vscode-border hover:border-vscode-focus"
          }
        `}
      >
        <label className="cursor-pointer flex items-center justify-center gap-2 opacity-60 hover:opacity-100">
          <span>📎</span>
          <span>이미지를 드래그하거나 클릭해서 첨부</span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      </div>

      {/* 에러 메시지 */}
      {error && <div className="text-xs text-red-400 mt-1 px-1">{error}</div>}
    </div>
  );
}

/**
 * 첨부된 이미지 미리보기
 */
interface ImagePreviewProps {
  images: ImageAttachment[];
  onRemove: (id: string) => void;
}

export function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap p-2">
      {images.map((img) => (
        <div
          key={img.id}
          className="relative group w-16 h-16 rounded overflow-hidden border border-vscode-border"
        >
          <img
            src={`data:${img.type};base64,${img.data}`}
            alt={img.name}
            className="w-full h-full object-cover"
          />
          {/* 삭제 버튼 */}
          <button
            onClick={() => onRemove(img.id)}
            className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 text-xs
                       opacity-0 group-hover:opacity-100 transition-opacity"
            title="삭제"
          >
            ✕
          </button>
          {/* 파일 크기 */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-center py-0.5">
            {formatBytes(img.size)}
          </div>
        </div>
      ))}
    </div>
  );
}

// 유틸리티 함수
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/png;base64,XXX 에서 XXX 부분만 추출
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
