/**
 * Terminal Tool - 명령어 실행
 */

import { spawn, type ChildProcess } from "child_process";
import * as vscode from "vscode";

import type { ITool } from "./registry.js";

interface ProcessInfo {
  process: ChildProcess;
  output: string[];
  exitCode: number | null;
}

// 실행 중인 프로세스 관리
const runningProcesses: Map<string, ProcessInfo> = new Map();

/**
 * run_command: 터미널 명령어 실행
 */
export const runCommandTool: ITool = {
  name: "run_command",
  description: "터미널에서 명령어를 실행합니다. 명령어 실행 결과를 반환합니다.",
  parameters: {
    command: {
      type: "string",
      description: "실행할 명령어",
      required: true,
    },
    cwd: {
      type: "string",
      description: "작업 디렉토리 (기본값: 워크스페이스 루트)",
      required: false,
    },
    timeout: {
      type: "number",
      description: "타임아웃 (밀리초, 기본값: 30000)",
      required: false,
    },
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    const command = args.command as string;
    const cwd =
      (args.cwd as string) ||
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
      process.cwd();
    const timeout = (args.timeout as number) || 30000;

    if (!command) {
      throw new Error("command 파라미터가 필요합니다.");
    }

    return new Promise((resolve, reject) => {
      const output: string[] = [];
      let isResolved = false;

      // 플랫폼별 쉘 설정
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
      const shellFlag = process.platform === "win32" ? "/c" : "-c";

      const child = spawn(shell, [shellFlag, command], {
        cwd,
        env: { ...process.env },
      });

      const processId = crypto.randomUUID();
      runningProcesses.set(processId, {
        process: child,
        output,
        exitCode: null,
      });

      child.stdout?.on("data", (data: Buffer) => {
        output.push(data.toString());
      });

      child.stderr?.on("data", (data: Buffer) => {
        output.push(data.toString());
      });

      child.on("close", (code) => {
        if (!isResolved) {
          isResolved = true;
          const processInfo = runningProcesses.get(processId);
          if (processInfo) {
            processInfo.exitCode = code;
          }
          runningProcesses.delete(processId);

          const result = output.join("");
          if (code === 0) {
            resolve(result || "(명령어 실행 완료, 출력 없음)");
          } else {
            resolve(`[Exit Code: ${code}]\n${result}`);
          }
        }
      });

      child.on("error", (err) => {
        if (!isResolved) {
          isResolved = true;
          runningProcesses.delete(processId);
          reject(new Error(`명령어 실행 실패: ${err.message}`));
        }
      });

      // 타임아웃 처리
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          child.kill("SIGTERM");
          runningProcesses.delete(processId);
          const result = output.join("");
          resolve(`[Timeout after ${timeout}ms]\n${result}`);
        }
      }, timeout);
    });
  },
};

/**
 * 모든 터미널 도구 목록
 */
export const terminalTools: ITool[] = [runCommandTool];
