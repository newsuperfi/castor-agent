/**
 * 컨텍스트 유틸리티
 * @파일명 멘션 파싱 및 파일 내용 첨부
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

// @파일명 패턴 (예: @src/index.ts, @package.json)
const FILE_MENTION_PATTERN = /@([\w./\-]+\.\w+)/g;

export interface FileContext {
  path: string;
  content: string;
}

/**
 * 메시지에서 @파일명 멘션을 파싱하고 파일 내용을 가져옴
 */
export async function parseFileMentions(
  message: string,
): Promise<{ message: string; contexts: FileContext[] }> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return { message, contexts: [] };
  }

  const contexts: FileContext[] = [];
  const mentions = message.matchAll(FILE_MENTION_PATTERN);

  for (const match of mentions) {
    const filePath = match[1];
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspaceRoot, filePath);

    try {
      const content = await fs.readFile(absolutePath, "utf-8");
      contexts.push({
        path: filePath,
        content,
      });
    } catch {
      // 파일을 찾을 수 없으면 무시
      console.log(`[Castor] @멘션 파일 찾을 수 없음: ${filePath}`);
    }
  }

  return { message, contexts };
}

/**
 * 파일 컨텍스트를 메시지에 통합
 */
export function formatMessageWithContext(
  originalMessage: string,
  contexts: FileContext[],
): string {
  if (contexts.length === 0) {
    return originalMessage;
  }

  let contextSection = "\n\n---\n**첨부된 파일:**\n";
  for (const ctx of contexts) {
    const ext = path.extname(ctx.path).slice(1) || "text";
    contextSection += `\n### ${ctx.path}\n\`\`\`${ext}\n${ctx.content}\n\`\`\`\n`;
  }

  return originalMessage + contextSection;
}

/**
 * 현재 열린 에디터의 파일 컨텍스트 가져오기
 */
export function getActiveEditorContext(): FileContext | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  const document = editor.document;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  let relativePath = document.fileName;
  if (workspaceRoot && document.fileName.startsWith(workspaceRoot)) {
    relativePath = document.fileName.slice(workspaceRoot.length + 1);
  }

  return {
    path: relativePath,
    content: document.getText(),
  };
}

/**
 * 현재 선택된 텍스트 가져오기
 */
export function getSelectedTextContext(): {
  path: string;
  content: string;
  selection: string;
} | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return null;

  const document = editor.document;
  const selection = document.getText(editor.selection);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  let relativePath = document.fileName;
  if (workspaceRoot && document.fileName.startsWith(workspaceRoot)) {
    relativePath = document.fileName.slice(workspaceRoot.length + 1);
  }

  const startLine = editor.selection.start.line + 1;
  const endLine = editor.selection.end.line + 1;

  return {
    path: `${relativePath}:${startLine}-${endLine}`,
    content: document.getText(),
    selection,
  };
}
