/**
 * 코드베이스 검색 도구
 * grep 기반 텍스트 검색
 */

import { spawn } from "child_process";
import * as vscode from "vscode";
import type { ITool } from "./registry.js";

interface SearchResult {
  file: string;
  line: number;
  content: string;
}

export const codebaseSearchTool: ITool = {
  name: "codebase_search",
  description:
    "코드베이스에서 텍스트를 검색합니다. grep을 사용하여 파일과 라인을 찾습니다.",
  parameters: {
    query: {
      type: "string",
      description: "검색할 텍스트 패턴",
      required: true,
    },
    path: {
      type: "string",
      description: "검색할 디렉토리 경로 (기본: 워크스페이스 루트)",
      required: false,
    },
    include: {
      type: "string",
      description: "포함할 파일 패턴 (예: *.ts, *.tsx)",
      required: false,
    },
    maxResults: {
      type: "number",
      description: "최대 결과 수 (기본: 50)",
      required: false,
    },
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    const query = args.query as string;
    const pathArg = args.path as string | undefined;
    const include = args.include as string | undefined;
    const maxResults = (args.maxResults as number) || 50;

    if (!query) {
      throw new Error("검색어가 필요합니다.");
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error("워크스페이스가 열려있지 않습니다.");
    }

    const searchPath = pathArg || workspaceRoot;

    return new Promise((resolve, reject) => {
      const results: SearchResult[] = [];

      // grep 명령어 구성
      const grepArgs = [
        "-rn", // recursive, line numbers
        "-I", // ignore binary files
        "--color=never", // no color codes
        "-m",
        "5", // max 5 matches per file
      ];

      // 파일 패턴 추가
      if (include) {
        grepArgs.push("--include", include);
      }

      // 일반적인 제외 패턴
      grepArgs.push(
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        "--exclude-dir=dist",
        "--exclude-dir=build",
        "--exclude-dir=.next",
      );

      grepArgs.push(query, searchPath);

      const grep = spawn("grep", grepArgs);

      let output = "";
      let errorOutput = "";

      grep.stdout.on("data", (data) => {
        output += data.toString();
      });

      grep.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      grep.on("close", (code) => {
        // grep returns 1 if no matches found (not an error)
        if (code !== 0 && code !== 1) {
          reject(new Error(`검색 실패: ${errorOutput}`));
          return;
        }

        const lines = output.split("\n").filter((l) => l.trim());

        for (const line of lines.slice(0, maxResults)) {
          // 파싱: file:line:content
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (match) {
            const relativePath = match[1].startsWith(workspaceRoot)
              ? match[1].slice(workspaceRoot.length + 1)
              : match[1];
            results.push({
              file: relativePath,
              line: parseInt(match[2], 10),
              content: match[3].trim().slice(0, 200),
            });
          }
        }

        if (results.length === 0) {
          resolve(`검색 결과 없음: "${query}"`);
          return;
        }

        // 결과 포맷팅
        let formatted = `검색 결과 (${results.length}개):\n\n`;
        for (const r of results) {
          formatted += `${r.file}:${r.line}\n  ${r.content}\n\n`;
        }

        resolve(formatted);
      });

      grep.on("error", (error) => {
        reject(new Error(`grep 실행 실패: ${error.message}`));
      });
    });
  },
};

export const searchTools: ITool[] = [codebaseSearchTool];
