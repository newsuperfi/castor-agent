import * as vscode from "vscode";

/**
 * Implementation Plan 파일에 실행/리뷰 버튼을 제공하는 CodeLens Provider
 */
export class PlanningCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  constructor(private context: vscode.ExtensionContext) {}

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    // implementation_plan.md 파일만 대상
    if (!document.fileName.endsWith("implementation_plan.md")) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    // 문서 상단(첫 줄)에 CodeLens 추가
    const range = new vscode.Range(0, 0, 0, 0);

    // 1. 실행 버튼
    codeLenses.push(
      new vscode.CodeLens(range, {
        title: "$(rocket) 계획 실행 (Execute)",
        command: "castor.plan.execute",
        arguments: [document.uri],
        tooltip: "이 구현 계획을 바탕으로 코드 작성을 시작합니다.",
      }),
    );

    // 2. 리뷰 버튼
    codeLenses.push(
      new vscode.CodeLens(range, {
        title: "$(comment-discussion) AI 리뷰 (Review)",
        command: "castor.plan.review",
        arguments: [document.uri],
        tooltip: "AI에게 이 계획에 대한 피드백을 요청합니다.",
      }),
    );

    return codeLenses;
  }
}
