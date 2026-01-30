/**
 * Inline Diff Manager v2
 * Hunk 단위 Accept/Reject + 대화 요청 단위 관리
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

// Diff Hunk 인터페이스
interface DiffHunk {
  id: string;
  startLine: number; // 0-indexed
  endLine: number; // exclusive
  originalLines: string[];
  newLines: string[];
  status: "pending" | "accepted" | "rejected";
}

// 파일별 Pending Edit
interface PendingFileEdit {
  filePath: string;
  sessionId: string; // 대화 요청 ID
  hunks: DiffHunk[];
  originalContent: string;
  newContent: string;
  status: "pending" | "completed"; // Undo 복구용 상태
  baseContent: string; // diff 계산 기준 (에디터 현재 내용)
  acceptedContent?: string; // Accept 시점의 에디터 내용 (Undo 감지용)
}

// 전역 상태
const pendingEdits = new Map<string, PendingFileEdit>();
let addedDecoration: vscode.TextEditorDecorationType;
let removedDecoration: vscode.TextEditorDecorationType;
let hunkSeparatorDecoration: vscode.TextEditorDecorationType;
let codeLensProvider: vscode.Disposable | undefined;
let codeLensEventEmitter: vscode.EventEmitter<void>;
let isInitialized = false;
let extensionContext: vscode.ExtensionContext; // 영구 저장용 context

const PENDING_EDITS_KEY = "castor.pendingEdits";

/**
 * Pending Edits를 globalState에 저장
 */
async function savePendingEdits(): Promise<void> {
  if (!extensionContext) return;

  // Map을 직렬화 가능한 형태로 변환
  const serializable: Array<[string, PendingFileEdit]> = Array.from(
    pendingEdits.entries(),
  );
  await extensionContext.globalState.update(PENDING_EDITS_KEY, serializable);
}

/**
 * globalState에서 Pending Edits 복원
 */
async function loadPendingEdits(): Promise<void> {
  if (!extensionContext) return;

  const saved =
    extensionContext.globalState.get<Array<[string, PendingFileEdit]>>(
      PENDING_EDITS_KEY,
    );
  if (!saved || saved.length === 0) return;

  for (const [filePath, edit] of saved) {
    // pending 상태인 것만 복원
    if (
      edit.status === "pending" &&
      edit.hunks.some((h) => h.status === "pending")
    ) {
      pendingEdits.set(filePath, edit);
    }
  }

  // 복원된 파일이 있으면 CodeLens 갱신 및 알림
  if (pendingEdits.size > 0) {
    codeLensEventEmitter?.fire();
    vscode.window.showInformationMessage(
      `${pendingEdits.size}개의 미적용 변경사항이 복원되었습니다. Accept/Reject를 선택해주세요.`,
    );

    // 복원된 파일 열기 (첫 번째 파일)
    const firstFilePath = Array.from(pendingEdits.keys())[0];
    if (firstFilePath) {
      const doc = await vscode.workspace.openTextDocument(firstFilePath);
      const editor = await vscode.window.showTextDocument(doc);
      updateDecorations(editor);
    }
  }
}

/**
 * 인라인 diff 매니저 초기화
 */
export function initInlineDiffManager(context: vscode.ExtensionContext): void {
  if (isInitialized) return;
  isInitialized = true;
  extensionContext = context; // 영구 저장용 context 저장

  // 추가된 줄 스타일
  addedDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(46, 160, 67, 0.2)",
    isWholeLine: true,
    gutterIconPath: context.asAbsolutePath("resources/plus.svg"),
  });

  // 삭제 표시용 (삭제된 줄 위에 표시)
  removedDecoration = vscode.window.createTextEditorDecorationType({
    before: {
      contentText: "",
      textDecoration: "none",
    },
    after: {
      contentText: " (deleted lines above)",
      color: "rgba(248, 81, 73, 0.6)",
      fontStyle: "italic",
    },
  });

  // Hunk 구분선
  hunkSeparatorDecoration = vscode.window.createTextEditorDecorationType({
    borderWidth: "2px 0 0 0",
    borderStyle: "dashed",
    borderColor: "rgba(100, 100, 100, 0.4)",
  });

  // CodeLens 갱신 이벤트
  codeLensEventEmitter = new vscode.EventEmitter<void>();

  // CodeLens Provider - Hunk별 Accept/Reject
  codeLensProvider = vscode.languages.registerCodeLensProvider("*", {
    onDidChangeCodeLenses: codeLensEventEmitter.event,
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
      const edit = pendingEdits.get(document.uri.fsPath);
      if (!edit) return [];

      const lenses: vscode.CodeLens[] = [];
      const pendingHunks = edit.hunks.filter((h) => h.status === "pending");

      if (pendingHunks.length === 0) return [];

      // 파일 상단: 전체 Accept/Reject
      const topRange = new vscode.Range(0, 0, 0, 0);
      lenses.push(
        new vscode.CodeLens(topRange, {
          title: `✓ Accept All (${pendingHunks.length} changes)`,
          command: "castor.acceptAllHunks",
          arguments: [document.uri.fsPath],
        }),
        new vscode.CodeLens(topRange, {
          title: "✗ Reject All",
          command: "castor.rejectAllHunks",
          arguments: [document.uri.fsPath],
        }),
      );

      // 각 Hunk별 Accept/Reject
      for (const hunk of pendingHunks) {
        const hunkRange = new vscode.Range(
          hunk.startLine,
          0,
          hunk.startLine,
          0,
        );
        lenses.push(
          new vscode.CodeLens(hunkRange, {
            title: "✓ Accept",
            command: "castor.acceptHunk",
            arguments: [document.uri.fsPath, hunk.id],
          }),
          new vscode.CodeLens(hunkRange, {
            title: "✗ Reject",
            command: "castor.rejectHunk",
            arguments: [document.uri.fsPath, hunk.id],
          }),
        );
      }

      return lenses;
    },
  });

  // 명령어 등록
  context.subscriptions.push(
    vscode.commands.registerCommand("castor.acceptHunk", acceptHunk),
    vscode.commands.registerCommand("castor.rejectHunk", rejectHunk),
    vscode.commands.registerCommand("castor.acceptAllHunks", acceptAllHunks),
    vscode.commands.registerCommand("castor.rejectAllHunks", rejectAllHunks),
    // 기존 호환성
    vscode.commands.registerCommand("castor.acceptInlineEdit", (id: string) => {
      // 기존 ID 형식에서 filePath 추출
      const edit = Array.from(pendingEdits.values()).find((e) =>
        e.hunks.some((h) => h.id === id),
      );
      if (edit) acceptAllHunks(edit.filePath);
    }),
    vscode.commands.registerCommand("castor.rejectInlineEdit", (id: string) => {
      const edit = Array.from(pendingEdits.values()).find((e) =>
        e.hunks.some((h) => h.id === id),
      );
      if (edit) rejectAllHunks(edit.filePath);
    }),
    addedDecoration,
    removedDecoration,
    hunkSeparatorDecoration,
    codeLensProvider,
    codeLensEventEmitter,
  );

  // 에디터 변경 시 데코레이션 업데이트
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) updateDecorations(editor);
    }),
  );

  // Phase 4: Undo 감지 - 정확한 조건으로 상태 복구
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const edit = pendingEdits.get(event.document.uri.fsPath);

      // 조건 1, 2: completed 상태이고 acceptedContent가 있어야 함
      if (!edit || edit.status !== "completed" || !edit.acceptedContent) return;

      const currentContent = event.document.getText();

      // 조건 3: 현재 내용이 acceptedContent와 다름 (변경됨)
      if (currentContent === edit.acceptedContent) return;

      // 조건 4: 현재 내용에 Accept 마커가 없으면 Undo로 간주 (마커가 제거됨)
      const acceptMarker = "\n// __CASTOR_ACCEPT_MARKER__";
      if (
        edit.acceptedContent?.includes(acceptMarker) &&
        !currentContent.includes(acceptMarker)
      ) {
        // Undo로 판단 → pending 상태로 복구
        edit.status = "pending";
        edit.acceptedContent = undefined;

        for (const hunk of edit.hunks) {
          hunk.status = "pending";
        }

        codeLensEventEmitter.fire();

        const editor = vscode.window.activeTextEditor;
        if (editor?.document.uri.fsPath === edit.filePath) {
          updateDecorations(editor);
        }

        vscode.window.showInformationMessage(
          "Undo detected. You can Accept or Reject again.",
        );
      }
    }),
  );

  // Phase 6: 파일 저장 시 pendingEdit 완전 삭제
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      const edit = pendingEdits.get(document.uri.fsPath);
      if (edit && edit.status === "completed") {
        // 파일 저장되면 pendingEdit 완전 삭제
        pendingEdits.delete(document.uri.fsPath);
        codeLensEventEmitter.fire();
      }
    }),
  );

  // 저장된 Pending Edits 복원
  loadPendingEdits();
}

/**
 * 두 텍스트 간의 diff를 계산하여 hunks 추출
 */
function computeHunks(
  originalLines: string[],
  newLines: string[],
  sessionId: string,
): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let hunkId = 0;

  // 간단한 LCS 기반 diff
  const maxLen = Math.max(originalLines.length, newLines.length);
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < maxLen; i++) {
    const origLine = i < originalLines.length ? originalLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (origLine !== newLine) {
      // 변경 감지
      if (!currentHunk) {
        currentHunk = {
          id: `${sessionId}-hunk-${hunkId++}`,
          startLine: i,
          endLine: i + 1,
          originalLines: [],
          newLines: [],
          status: "pending",
        };
      } else {
        currentHunk.endLine = i + 1;
      }

      if (origLine !== undefined) currentHunk.originalLines.push(origLine);
      if (newLine !== undefined) currentHunk.newLines.push(newLine);
    } else {
      // 변경 없음 - 현재 hunk 종료
      if (currentHunk) {
        hunks.push(currentHunk);
        currentHunk = null;
      }
    }
  }

  // 마지막 hunk 저장
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * 인라인 diff 표시
 */
export async function showInlineDiff(
  filePath: string,
  originalContent: string,
  newContent: string,
  sessionId?: string,
): Promise<string> {
  const editId = sessionId || `session-${Date.now()}`;

  // Phase 2.1: 기존 pendingEdit 처리
  const existingEdit = pendingEdits.get(filePath);
  let existingPendingHunks: DiffHunk[] = [];

  if (existingEdit) {
    // 기존 pending hunk 수집 (아직 Accept/Reject 안 한 것들)
    existingPendingHunks = existingEdit.hunks.filter(
      (h) => h.status === "pending",
    );

    // completed 상태이고 pending hunk가 없으면 삭제
    if (
      existingEdit.status === "completed" &&
      existingPendingHunks.length === 0
    ) {
      pendingEdits.delete(filePath);
    }
  }

  // 기존 파일이 없으면 새 파일로 생성
  let fileExists = true;
  try {
    await fs.access(filePath);
  } catch {
    fileExists = false;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "", "utf-8");
  }

  // Phase 2.2: 에디터가 열려있으면 현재 내용을 baseContent로 사용
  let baseContent = fileExists ? originalContent : "";
  const existingDocument = vscode.workspace.textDocuments.find(
    (doc) => doc.uri.fsPath === filePath,
  );
  if (existingDocument) {
    baseContent = existingDocument.getText();
  }

  // baseContent와 newContent 비교하여 새 hunks 계산
  const newHunks = computeHunks(
    baseContent.split("\n"),
    newContent.split("\n"),
    editId,
  );

  // 변경 사항이 없으면 직접 저장
  if (newHunks.length === 0 && existingPendingHunks.length === 0) {
    await fs.writeFile(filePath, newContent, "utf-8");
    return editId;
  }

  // Phase 2.3: 기존 pending hunk와 새 hunk 병합
  const mergedHunks: DiffHunk[] = [];

  for (const existingHunk of existingPendingHunks) {
    // 중복 방지: 라인 범위가 겹치면 새 hunk 우선
    const overlaps = newHunks.some(
      (nh) =>
        !(
          nh.endLine <= existingHunk.startLine ||
          nh.startLine >= existingHunk.endLine
        ),
    );
    if (!overlaps) {
      mergedHunks.push(existingHunk);
    }
  }
  mergedHunks.push(...newHunks);

  // 라인 순서대로 정렬
  mergedHunks.sort((a, b) => a.startLine - b.startLine);

  // Phase 2.4: Pending edit 저장
  pendingEdits.set(filePath, {
    filePath,
    sessionId: editId,
    hunks: mergedHunks,
    originalContent: fileExists ? originalContent : "",
    newContent,
    status: "pending",
    baseContent,
    acceptedContent: undefined,
  });

  // 파일 열기 (새 내용으로)
  const document = await vscode.workspace.openTextDocument(filePath);
  const editor = await vscode.window.showTextDocument(document);

  // 새 내용 적용 (저장하지 않음)
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );

  await editor.edit((editBuilder) => {
    editBuilder.replace(fullRange, newContent);
  });

  // 데코레이션 적용
  updateDecorations(editor);

  // global state에도 저장
  const globalState = global as Record<string, unknown>;
  globalState.castorCurrentDiff = {
    fileId: editId,
    filePath,
    originalContent,
    newContent,
  };

  // 영구 저장
  await savePendingEdits();

  return editId;
}

/**
 * 데코레이션 업데이트
 */
function updateDecorations(editor: vscode.TextEditor): void {
  const edit = pendingEdits.get(editor.document.uri.fsPath);
  if (!edit) {
    // 데코레이션 제거
    editor.setDecorations(addedDecoration, []);
    editor.setDecorations(hunkSeparatorDecoration, []);
    return;
  }

  const addedRanges: vscode.DecorationOptions[] = [];
  const separatorRanges: vscode.DecorationOptions[] = [];

  for (const hunk of edit.hunks) {
    if (hunk.status !== "pending") continue;

    // Hunk 구분선
    separatorRanges.push({
      range: new vscode.Range(hunk.startLine, 0, hunk.startLine, 0),
    });

    // 추가된 줄 하이라이트
    for (
      let i = hunk.startLine;
      i < hunk.endLine && i < editor.document.lineCount;
      i++
    ) {
      addedRanges.push({
        range: new vscode.Range(i, 0, i, editor.document.lineAt(i).text.length),
      });
    }
  }

  editor.setDecorations(addedDecoration, addedRanges);
  editor.setDecorations(hunkSeparatorDecoration, separatorRanges);
}

/**
 * 단일 Hunk Accept
 */
async function acceptHunk(filePath: string, hunkId: string): Promise<void> {
  const edit = pendingEdits.get(filePath);
  if (!edit) return;

  const hunk = edit.hunks.find((h) => h.id === hunkId);
  if (!hunk) return;

  hunk.status = "accepted";
  await savePendingEdits(); // 영구 저장

  // 모든 hunk가 처리되었는지 확인
  const pendingHunks = edit.hunks.filter((h) => h.status === "pending");
  if (pendingHunks.length === 0) {
    await finalizeEdit(filePath);
  } else {
    // CodeLens 및 데코레이션 업데이트
    codeLensEventEmitter.fire();
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.fsPath === filePath) {
      updateDecorations(editor);
    }
    vscode.window.showInformationMessage(
      `Hunk accepted. ${pendingHunks.length} remaining.`,
    );
  }
}

/**
 * 단일 Hunk Reject
 */
async function rejectHunk(filePath: string, hunkId: string): Promise<void> {
  const edit = pendingEdits.get(filePath);
  if (!edit) return;

  const hunk = edit.hunks.find((h) => h.id === hunkId);
  if (!hunk) return;

  hunk.status = "rejected";
  await savePendingEdits(); // 영구 저장

  // Reject된 hunk의 원본 내용으로 되돌리기 위해 전체 재계산 필요
  // 현재는 간단하게: reject된 hunk를 제외하고 나머지 accepted로 처리
  const pendingHunks = edit.hunks.filter((h) => h.status === "pending");
  if (pendingHunks.length === 0) {
    await finalizeEdit(filePath);
  } else {
    // 에디터에서 해당 부분 원본으로 되돌리기
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.fsPath === filePath) {
      // 간단한 구현: 원본 라인으로 교체
      await editor.edit((editBuilder) => {
        const range = new vscode.Range(hunk.startLine, 0, hunk.endLine, 0);
        editBuilder.replace(
          range,
          hunk.originalLines.join("\n") +
            (hunk.originalLines.length > 0 ? "\n" : ""),
        );
      });
      codeLensEventEmitter.fire();
      updateDecorations(editor);
    }
    vscode.window.showInformationMessage(
      `Hunk rejected. ${pendingHunks.length} remaining.`,
    );
  }
}

/**
 * 모든 Hunk Accept
 */
async function acceptAllHunks(filePath: string): Promise<void> {
  const edit = pendingEdits.get(filePath);
  if (!edit) return;

  // 모든 pending hunk를 accepted로
  for (const hunk of edit.hunks) {
    if (hunk.status === "pending") {
      hunk.status = "accepted";
    }
  }

  await finalizeEdit(filePath);
}

/**
 * 모든 Hunk Reject
 */
async function rejectAllHunks(filePath: string): Promise<void> {
  const edit = pendingEdits.get(filePath);
  if (!edit) return;

  // 원본으로 되돌리기 (파일 저장 안 함 - dirty 상태 유지)
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.fsPath === filePath) {
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length),
    );
    await editor.edit((editBuilder) => {
      editBuilder.replace(fullRange, edit.originalContent);
    });
    // Phase 5: Reject 시점의 에디터 내용 저장
    edit.acceptedContent = edit.baseContent;

    editor.setDecorations(addedDecoration, []);
    editor.setDecorations(hunkSeparatorDecoration, []);
  }

  edit.status = "completed";
  for (const hunk of edit.hunks) {
    hunk.status = "rejected";
  }
  codeLensEventEmitter.fire();

  // global state 정리
  const globalState = global as Record<string, unknown>;
  globalState.castorCurrentDiff = undefined;

  vscode.window.showInformationMessage(
    "All changes rejected. Press Cmd+S to save, or Ctrl+Z to undo.",
  );
}

/**
 * 편집 완료 (저장)
 */
async function finalizeEdit(filePath: string): Promise<void> {
  const edit = pendingEdits.get(filePath);
  if (!edit) return;

  // rejected hunk만 원본으로, 나머지는 새 내용 유지
  const finalLines: string[] = [];
  const newLines = edit.newContent.split("\n");
  const originalLines = edit.originalContent.split("\n");

  let newIndex = 0;
  let origIndex = 0;

  for (const hunk of edit.hunks.sort((a, b) => a.startLine - b.startLine)) {
    // hunk 전까지의 라인 복사 (변경 없음)
    while (newIndex < hunk.startLine) {
      finalLines.push(newLines[newIndex]);
      newIndex++;
      origIndex++;
    }

    if (hunk.status === "accepted") {
      // 새 내용 사용
      for (
        let i = hunk.startLine;
        i < hunk.endLine && i < newLines.length;
        i++
      ) {
        finalLines.push(newLines[i]);
      }
      newIndex = hunk.endLine;
      origIndex += hunk.originalLines.length;
    } else if (hunk.status === "rejected") {
      // 원본 내용 사용
      for (const line of hunk.originalLines) {
        finalLines.push(line);
      }
      newIndex = hunk.endLine;
      origIndex += hunk.originalLines.length;
    }
  }

  // 나머지 라인 추가
  while (newIndex < newLines.length) {
    finalLines.push(newLines[newIndex]);
    newIndex++;
  }

  const finalContent = finalLines.join("\n");

  // 파일 저장 안 함 - dirty 상태 유지 (사용자가 Cmd+S로 직접 저장)
  // await fs.writeFile(filePath, finalContent, "utf-8");

  // Phase 3: Accept 마커 삽입 (Ctrl+Z로 되돌릴 수 있게)
  const acceptMarker = "\n// __CASTOR_ACCEPT_MARKER__";
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.fsPath === filePath) {
    // 마커 삽입 (Undo 스택에 기록됨)
    await editor.edit((editBuilder) => {
      const endPos = editor.document.positionAt(
        editor.document.getText().length,
      );
      editBuilder.insert(endPos, acceptMarker);
    });

    edit.acceptedContent = editor.document.getText();
    editor.setDecorations(addedDecoration, []);
    editor.setDecorations(hunkSeparatorDecoration, []);
  }

  // 상태를 completed로 변경 (Undo 시 복구 가능)
  edit.status = "completed";
  codeLensEventEmitter.fire();
  await savePendingEdits(); // 영구 저장 (completed 상태도 저장)

  // global state 정리
  const globalState = global as Record<string, unknown>;
  globalState.castorCurrentDiff = undefined;

  vscode.window.showInformationMessage(
    `Changes accepted. Press Cmd+S to save, or Ctrl+Z to undo.`,
  );
}

/**
 * 현재 pending edit 가져오기
 */
export function getCurrentPendingEdit(): PendingFileEdit | undefined {
  return Array.from(pendingEdits.values())[0];
}

/**
 * Pending edit 가져오기
 */
export function getPendingEdit(filePath: string): PendingFileEdit | undefined {
  return pendingEdits.get(filePath);
}
