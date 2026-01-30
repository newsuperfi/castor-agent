/**
 * Plan Preview Panel - 커스텀 Webview Panel for Implementation Plan
 * Markdown Preview + 인터랙티브 버튼 (실행/리뷰)
 */

import { marked } from "marked";
import * as vscode from "vscode";

export class PlanPreviewPanel {
  public static currentPanel: PlanPreviewPanel | undefined;
  private static readonly viewType = "castor.planPreview";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private currentPlanUri: vscode.Uri | null = null;

  public static createOrShow(
    extensionUri: vscode.Uri,
    planUri: vscode.Uri,
    content: string,
  ): void {
    const column = vscode.ViewColumn.One;

    // 이미 패널이 있으면 업데이트
    if (PlanPreviewPanel.currentPanel) {
      PlanPreviewPanel.currentPanel.update(planUri, content);
      PlanPreviewPanel.currentPanel.panel.reveal(column);
      return;
    }

    // 새 패널 생성
    const panel = vscode.window.createWebviewPanel(
      PlanPreviewPanel.viewType,
      "📋 Implementation Plan",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    PlanPreviewPanel.currentPanel = new PlanPreviewPanel(
      panel,
      extensionUri,
      planUri,
      content,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    planUri: vscode.Uri,
    content: string,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.currentPlanUri = planUri;

    // 초기 HTML 설정
    this.update(planUri, content);

    // 패널 닫힐 때 정리
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Webview 메시지 수신
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "execute":
            if (this.currentPlanUri) {
              await vscode.commands.executeCommand(
                "castor.plan.execute",
                this.currentPlanUri,
              );
            }
            break;
          case "review":
            if (this.currentPlanUri) {
              await vscode.commands.executeCommand(
                "castor.plan.review",
                this.currentPlanUri,
              );
            }
            break;
          case "openInEditor":
            if (this.currentPlanUri) {
              const doc = await vscode.workspace.openTextDocument(
                this.currentPlanUri,
              );
              await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            }
            break;
        }
      },
      null,
      this.disposables,
    );
  }

  public update(planUri: vscode.Uri, content: string): void {
    this.currentPlanUri = planUri;
    this.panel.title = "📋 Implementation Plan";
    this.panel.webview.html = this.getHtmlForWebview(content);
  }

  private getHtmlForWebview(markdownContent: string): string {
    // Markdown을 HTML로 변환
    const htmlContent = marked.parse(markdownContent);

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Implementation Plan</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      --button-primary-bg: #0078d4;
      --button-primary-hover: #106ebe;
      --button-secondary-bg: #3c3c3c;
      --button-secondary-hover: #505050;
    }
    
    body {
      font-family: var(--vscode-font-family);
      padding: 0;
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      backdrop-filter: blur(10px);
    }
    
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .btn-primary {
      background: var(--button-primary-bg);
      color: white;
    }
    
    .btn-primary:hover {
      background: var(--button-primary-hover);
    }
    
    .btn-secondary {
      background: var(--button-secondary-bg);
      color: var(--vscode-foreground);
    }
    
    .btn-secondary:hover {
      background: var(--button-secondary-hover);
    }
    
    .btn-icon {
      font-size: 16px;
    }
    
    .content {
      padding: 20px;
      max-width: 900px;
      margin: 0 auto;
      line-height: 1.6;
    }
    
    /* Markdown 스타일 */
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    
    h1 { font-size: 2em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    
    p { margin-bottom: 16px; }
    
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 85%;
    }
    
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    
    pre code {
      background: none;
      padding: 0;
    }
    
    ul, ol {
      padding-left: 2em;
      margin-bottom: 16px;
    }
    
    li { margin-bottom: 4px; }
    
    blockquote {
      border-left: 4px solid var(--vscode-textBlockQuote-border);
      padding-left: 16px;
      margin: 16px 0;
      color: var(--vscode-textBlockQuote-foreground);
    }
    
    hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 24px 0;
    }
    
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
    
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }
    
    th, td {
      border: 1px solid var(--vscode-panel-border);
      padding: 8px 12px;
      text-align: left;
    }
    
    th {
      background: var(--vscode-textCodeBlock-background);
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn btn-primary" onclick="execute()">
      <span class="btn-icon">🚀</span>
      <span>계획 실행</span>
    </button>
    <button class="btn btn-secondary" onclick="review()">
      <span class="btn-icon">💬</span>
      <span>AI 리뷰</span>
    </button>
    <button class="btn btn-secondary" onclick="openInEditor()">
      <span class="btn-icon">📝</span>
      <span>에디터에서 열기</span>
    </button>
  </div>
  
  <div class="content">
    ${htmlContent}
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    
    function execute() {
      vscode.postMessage({ command: 'execute' });
    }
    
    function review() {
      vscode.postMessage({ command: 'review' });
    }
    
    function openInEditor() {
      vscode.postMessage({ command: 'openInEditor' });
    }
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    PlanPreviewPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
