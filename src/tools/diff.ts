/**
 * Diff 도구
 * 파일에 부분 변경사항 적용
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import type { ITool } from "./registry.js";

// 정규표현식 특수문자 이스케이프
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const applyDiffTool: ITool = {
  name: "apply_diff",
  description:
    "파일의 특정 부분을 새 내용으로 교체합니다. 찾을 텍스트와 교체할 텍스트를 지정하세요.",
  parameters: {
    path: {
      type: "string",
      description: "수정할 파일 경로",
      required: true,
    },
    search: {
      type: "string",
      description: "찾을 텍스트 (정확히 일치해야 함)",
      required: true,
    },
    replace: {
      type: "string",
      description: "교체할 새 텍스트",
      required: true,
    },
    all: {
      type: "boolean",
      description: "true면 모든 일치 항목 교체 (기본: false, 첫 번째만)",
      required: false,
    },
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = args.path as string;
    const search = args.search as string;
    const replace = args.replace as string;
    const replaceAll = args.all === true;

    if (!filePath || search === undefined || replace === undefined) {
      throw new Error("path, search, replace가 모두 필요합니다.");
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error("워크스페이스가 열려있지 않습니다.");
    }

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspaceRoot, filePath);

    // 파일 읽기
    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf-8");
    } catch {
      throw new Error(`파일을 읽을 수 없습니다: ${filePath}`);
    }

    // 검색 텍스트 확인
    if (!content.includes(search)) {
      throw new Error(
        `찾을 텍스트가 파일에 없습니다.\n\n찾은 텍스트:\n${search.slice(0, 200)}...`,
      );
    }

    // 교체
    let newContent: string;
    let matchCount: number;

    if (replaceAll) {
      // 모든 일치 항목 교체
      const regex = new RegExp(escapeRegex(search), "g");
      matchCount = (content.match(regex) || []).length;
      newContent = content.replace(regex, replace);
    } else {
      // 첫 번째만 교체
      matchCount = 1;
      newContent = content.replace(search, replace);
    }

    // 파일 쓰기
    await fs.writeFile(absolutePath, newContent, "utf-8");

    // 변경사항 요약
    const linesChanged = replace.split("\n").length - search.split("\n").length;
    const changeDesc =
      linesChanged > 0
        ? `+${linesChanged} 줄`
        : linesChanged < 0
          ? `${linesChanged} 줄`
          : "줄 수 동일";

    return `✓ ${filePath} 수정됨\n  - ${matchCount}개 항목 교체\n  - ${changeDesc}`;
  },
};

export const diffTools: ITool[] = [applyDiffTool];
