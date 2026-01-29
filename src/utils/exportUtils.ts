/**
 * 대화 내보내기 유틸리티
 * 대화 내용을 Markdown 파일로 저장
 */

import * as vscode from "vscode";
import type { ChatMessage } from "../types.js";

/**
 * 대화를 Markdown 형식으로 변환
 */
export function formatConversationAsMarkdown(
  messages: ChatMessage[],
  title: string = "Castor 대화",
): string {
  const lines: string[] = [];

  // 헤더
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> 내보낸 시간: ${new Date().toLocaleString("ko-KR")}`);
  lines.push(`> 메시지 수: ${messages.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 메시지 변환
  for (const msg of messages) {
    const roleLabel = msg.role === "user" ? "👤 **사용자**" : "🤖 **AI**";
    const time = new Date(msg.timestamp).toLocaleTimeString("ko-KR");

    lines.push(`### ${roleLabel} (${time})`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");

    // 도구 호출이 있으면 표시
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push("<details>");
      lines.push("<summary>🔧 도구 호출</summary>");
      lines.push("");
      for (const tool of msg.toolCalls) {
        lines.push(`- **${tool.name}**: ${tool.status}`);
        if (tool.result) {
          lines.push("  ```");
          lines.push(
            `  ${tool.result.slice(0, 500)}${tool.result.length > 500 ? "..." : ""}`,
          );
          lines.push("  ```");
        }
      }
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }

    // 사고 과정이 있으면 표시
    if (msg.thinking) {
      lines.push("<details>");
      lines.push("<summary>💭 사고 과정</summary>");
      lines.push("");
      lines.push("```");
      lines.push(msg.thinking.slice(0, 1000));
      if (msg.thinking.length > 1000) lines.push("...(생략)");
      lines.push("```");
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * 대화 내보내기 실행
 */
export async function exportConversation(
  messages: ChatMessage[],
  title?: string,
): Promise<void> {
  if (messages.length === 0) {
    vscode.window.showWarningMessage("내보낼 대화가 없습니다.");
    return;
  }

  // 저장 위치 선택
  const uri = await vscode.window.showSaveDialog({
    filters: { Markdown: ["md"] },
    defaultUri: vscode.Uri.file(
      `castor-chat-${new Date().toISOString().slice(0, 10)}.md`,
    ),
  });

  if (!uri) {
    return; // 사용자가 취소
  }

  // Markdown 생성 및 저장
  const content = formatConversationAsMarkdown(messages, title);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));

  vscode.window.showInformationMessage(`대화가 저장되었습니다: ${uri.fsPath}`);
}
