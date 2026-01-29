/**
 * File System Tools - 파일 읽기/쓰기/목록
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import type { ITool } from "./registry.js";

/**
 * 상대 경로를 워크스페이스 기준 절대 경로로 변환
 */
function resolveWorkspacePath(inputPath: string): string {
  // 이미 절대 경로면 그대로 반환
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  // 워크스페이스 폴더 기준으로 변환
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return path.join(workspaceFolders[0].uri.fsPath, inputPath);
  }

  // 워크스페이스가 없으면 그대로 반환 (에러 발생할 수 있음)
  return inputPath;
}

/**
 * read_file: 파일 내용 읽기
 */
export const readFileTool: ITool = {
  name: "read_file",
  description: "파일 내용을 읽습니다.",
  parameters: {
    path: {
      type: "string",
      description: "읽을 파일의 절대 경로",
      required: true,
    },
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    const inputPath = args.path as string;
    if (!inputPath) {
      throw new Error("path 파라미터가 필요합니다.");
    }

    const filePath = resolveWorkspacePath(inputPath);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (err) {
      throw new Error(`파일 읽기 실패: ${filePath} - ${err}`);
    }
  },
};

/**
 * write_file: 파일 내용 쓰기 (인라인 Diff 미리보기 후 Accept/Reject)
 */
export const writeFileTool: ITool = {
  name: "write_file",
  description:
    "파일에 내용을 씁니다. 변경사항은 에디터에서 인라인으로 표시되며 Accept/Reject로 결정합니다.",
  parameters: {
    path: {
      type: "string",
      description: "쓸 파일의 절대 경로",
      required: true,
    },
    content: {
      type: "string",
      description: "파일에 쓸 내용",
      required: true,
    },
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    const inputPath = args.path as string;
    const content = args.content as string;

    if (!inputPath || content === undefined) {
      throw new Error("path와 content 파라미터가 필요합니다.");
    }

    const filePath = resolveWorkspacePath(inputPath);

    // 기존 파일 내용 읽기 (없으면 빈 문자열)
    let originalContent = "";
    try {
      originalContent = await fs.readFile(filePath, "utf-8");
    } catch {
      // 새 파일인 경우
      originalContent = "";
    }

    // VS Code 사용 가능 시 인라인 diff 표시
    try {
      const { showInlineDiff } = await import("../ui/inlineDiffManager.js");
      await showInlineDiff(filePath, originalContent, content);
      return `파일 변경 미리보기가 열렸습니다: ${filePath}\n에디터 상단의 "Accept Changes" 또는 "Reject Changes"를 클릭하세요.`;
    } catch {
      // VS Code 환경이 아닌 경우 직접 저장
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return `파일 저장 완료: ${filePath}`;
    }
  },
};

/**
 * list_dir: 디렉토리 목록
 */
export const listDirTool: ITool = {
  name: "list_dir",
  description: "디렉토리의 파일과 폴더 목록을 반환합니다.",
  parameters: {
    path: {
      type: "string",
      description: "목록을 조회할 디렉토리 경로",
      required: true,
    },
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    const inputPath = args.path as string;
    if (!inputPath) {
      throw new Error("path 파라미터가 필요합니다.");
    }

    const dirPath = resolveWorkspacePath(inputPath);
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const result = entries.map((entry) => {
        const type = entry.isDirectory() ? "[DIR]" : "[FILE]";
        return `${type} ${entry.name}`;
      });
      return result.join("\n");
    } catch (err) {
      throw new Error(`디렉토리 조회 실패: ${dirPath} - ${err}`);
    }
  },
};

/**
 * 모든 파일 도구 목록
 */
export const fileTools: ITool[] = [readFileTool, writeFileTool, listDirTool];
