import * as vscode from "vscode";
import {
  deleteAccount,
  getLoginStatus,
  loginWithAntigravity,
  logout,
  switchAccount,
} from "../auth/antigravity.js";
import type {
  AIModel,
  ChatMessage,
  GenerateOptions,
  WebviewMessage,
} from "../types.js";

/**
 * Sidebar 채팅창 Webview Provider
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Webview 메시지 수신
    webviewView.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        await this.handleMessage(message);
      },
      undefined,
      this.context.subscriptions,
    );

    // 초기 상태 전송
    this.sendInitialState();
  }

  /**
   * 로그인 처리 (PKCE OAuth) - 새 계정 추가
   */
  async handleLogin(): Promise<void> {
    try {
      const result = await loginWithAntigravity(this.context);

      if (result) {
        // 다중 계정 상태 갱신
        const status = await getLoginStatus(this.context);
        this.postMessage({
          type: "login",
          payload: {
            success: true,
            email: result.email,
            accounts: status.accounts,
            activeIndex: status.activeIndex,
          },
        });
      } else {
        this.postMessage({
          type: "error",
          payload: { message: "로그인이 취소되었거나 실패했습니다." },
        });
      }
    } catch (error) {
      this.postMessage({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : "로그인 실패",
        },
      });
    }
  }

  /**
   * 로그아웃 처리 (모든 계정)
   */
  async handleLogout(): Promise<void> {
    await logout(this.context);
    this.postMessage({
      type: "logout",
      payload: {},
    });
  }

  /**
   * 계정 전환
   */
  async handleSwitchAccount(index: number): Promise<void> {
    const success = await switchAccount(this.context, index);
    if (success) {
      const status = await getLoginStatus(this.context);
      this.postMessage({
        type: "updateSettings",
        payload: {
          isLoggedIn: status.isLoggedIn,
          currentEmail: status.email,
          accounts: status.accounts,
          activeIndex: status.activeIndex,
        },
      });
    }
  }

  /**
   * 특정 계정 삭제
   */
  async handleDeleteAccount(index: number): Promise<void> {
    await deleteAccount(this.context, index);
    const status = await getLoginStatus(this.context);
    this.postMessage({
      type: "updateSettings",
      payload: {
        isLoggedIn: status.isLoggedIn,
        currentEmail: status.email,
        accounts: status.accounts,
        activeIndex: status.activeIndex,
      },
    });
  }

  /**
   * Webview 메시지 처리
   */
  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "sendMessage":
        await this.handleSendMessage(message.payload as { content: string });
        break;

      case "login":
        await this.handleLogin();
        break;

      case "logout":
        await this.handleLogout();
        break;

      case "switchAccount":
        await this.handleSwitchAccount(
          (message.payload as { index: number }).index,
        );
        break;

      case "deleteAccount":
        await this.handleDeleteAccount(
          (message.payload as { index: number }).index,
        );
        break;

      case "selectModel":
        await this.handleSelectModel(message.payload as { model: AIModel });
        break;

      case "updateSettings":
        await this.handleUpdateSettings(
          message.payload as Partial<GenerateOptions>,
        );
        break;

      case "confirmAction":
      case "cancelAction":
        // TODO: 에이전트 액션 승인/거부 처리
        break;
    }
  }

  /**
   * 메시지 전송 처리
   */
  private async handleSendMessage(payload: { content: string }): Promise<void> {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: payload.content,
      timestamp: Date.now(),
    };

    this.messages.push(userMessage);

    // TODO: AI 응답 생성 (Agent 모듈 연동)
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `메시지를 받았습니다: "${payload.content}"\n\n아직 AI 연동이 완료되지 않았습니다. Phase 2에서 완성될 예정입니다.`,
      timestamp: Date.now(),
    };

    this.messages.push(assistantMessage);
    this.postMessage({ type: "receiveMessage", payload: assistantMessage });
  }

  /**
   * 모델 선택 처리
   */
  private async handleSelectModel(payload: { model: AIModel }): Promise<void> {
    const config = vscode.workspace.getConfiguration("castor");
    await config.update(
      "defaultModel",
      payload.model,
      vscode.ConfigurationTarget.Global,
    );
  }

  /**
   * 설정 업데이트 처리
   */
  private async handleUpdateSettings(
    payload: Partial<GenerateOptions>,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration("castor");

    if (payload.thinkingLevel) {
      await config.update(
        "thinkingLevel",
        payload.thinkingLevel,
        vscode.ConfigurationTarget.Global,
      );
    }

    if (payload.thinkingBudget) {
      await config.update(
        "thinkingBudget",
        payload.thinkingBudget,
        vscode.ConfigurationTarget.Global,
      );
    }
  }

  /**
   * 초기 상태 전송 (다중 계정 포함)
   */
  private async sendInitialState(): Promise<void> {
    const config = vscode.workspace.getConfiguration("castor");
    const loginStatus = await getLoginStatus(this.context);

    this.postMessage({
      type: "updateSettings",
      payload: {
        isLoggedIn: loginStatus.isLoggedIn,
        currentEmail: loginStatus.email,
        accounts: loginStatus.accounts,
        activeIndex: loginStatus.activeIndex,
        model: config.get("defaultModel"),
        thinkingLevel: config.get("thinkingLevel"),
        thinkingBudget: config.get("thinkingBudget"),
        autoRunMode: config.get("autoRunMode"),
        messages: this.messages,
      },
    });
  }

  /**
   * Webview에 메시지 전송
   */
  private postMessage(message: WebviewMessage): void {
    this._view?.webview.postMessage(message);
  }

  /**
   * Webview HTML 생성
   */
  private getHtmlContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.css"),
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>Castor Agent</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * CSP nonce 생성
   */
  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
