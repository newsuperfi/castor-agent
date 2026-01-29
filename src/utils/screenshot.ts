/**
 * 스크린샷 캡처 유틸리티
 * VS Code 창 또는 에디터 영역 캡처
 */

import { exec } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

export interface Screenshot {
  id: string;
  name: string;
  data: string; // base64
  timestamp: number;
}

/**
 * 시스템 스크린샷 캡처 (macOS)
 * macOS의 screencapture 명령어 사용
 */
export async function captureScreenshot(): Promise<Screenshot | null> {
  const tempFile = path.join(
    os.tmpdir(),
    `castor-screenshot-${Date.now()}.png`,
  );

  return new Promise((resolve, reject) => {
    // macOS screencapture 명령어
    // -i: 인터랙티브 모드 (영역 선택)
    // -x: 캡처 사운드 비활성화
    const command =
      process.platform === "darwin"
        ? `screencapture -i -x "${tempFile}"`
        : process.platform === "linux"
          ? `gnome-screenshot -a -f "${tempFile}"`
          : null;

    if (!command) {
      vscode.window.showWarningMessage(
        "스크린샷 캡처는 macOS와 Linux에서만 지원됩니다.",
      );
      resolve(null);
      return;
    }

    exec(command, async (error) => {
      if (error) {
        // 사용자가 ESC로 취소한 경우
        if (error.code === 1) {
          resolve(null);
          return;
        }
        reject(error);
        return;
      }

      try {
        // 파일 존재 확인
        await fs.access(tempFile);

        // base64로 읽기
        const buffer = await fs.readFile(tempFile);
        const base64 = buffer.toString("base64");

        // 임시 파일 삭제
        await fs.unlink(tempFile).catch(() => {});

        resolve({
          id: crypto.randomUUID(),
          name: `Screenshot ${new Date().toLocaleTimeString()}`,
          data: base64,
          timestamp: Date.now(),
        });
      } catch {
        // 파일이 없으면 사용자가 취소한 것
        resolve(null);
      }
    });
  });
}

/**
 * 스크린샷 캡처 명령어 등록
 */
export function registerScreenshotCommand(
  context: vscode.ExtensionContext,
  onCapture: (screenshot: Screenshot) => void,
): void {
  const command = vscode.commands.registerCommand(
    "castor.captureScreenshot",
    async () => {
      try {
        vscode.window.showInformationMessage("캡처할 영역을 선택하세요...");
        const screenshot = await captureScreenshot();

        if (screenshot) {
          onCapture(screenshot);
          vscode.window.showInformationMessage("스크린샷이 첨부되었습니다.");
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `스크린샷 캡처 실패: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  context.subscriptions.push(command);
}
