import * as vscode from "vscode";
import { AgentBrain } from "../agent/brain.js";
import { createAntigravityClient } from "../api/client.js";
import {
  deleteAccount,
  getLoginStatus,
  loginWithAntigravity,
  logout,
  switchAccount,
} from "../auth/antigravity.js";
import { AntigravityProvider } from "../providers/antigravity.js";
import { registerAllTools, toolRegistry } from "../tools/index.js";
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
  private agentBrain?: AgentBrain;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {
    // 도구 등록
    registerAllTools();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    console.log("[Castor] resolveWebviewView called!");
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
    console.log("[Castor] handleMessage received:", message.type);

    switch (message.type) {
      case "debug":
        console.log("[Castor/Debug]", message.payload);
        break;

      case "sendMessage":
        console.log("[Castor] Routing to handleSendMessage");
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
  private async handleSendMessage(payload: {
    content: string;
    model?: AIModel;
    mode?: "edit" | "plan";
  }): Promise<void> {
    vscode.window.showInformationMessage(
      `[Castor] handleSendMessage: ${payload.content.substring(0, 30)}`,
    );
    console.log(
      "[Castor] handleSendMessage called with:",
      payload.content.substring(0, 50),
    );

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: payload.content,
      timestamp: Date.now(),
    };

    this.messages.push(userMessage);
    // 사용자 메시지는 webview에서 이미 표시하므로 여기서 보내지 않음

    // 로그인 상태 확인
    console.log("[Castor] Checking login status...");
    const status = await getLoginStatus(this.context);
    console.log(
      "[Castor] Login status:",
      status.isLoggedIn,
      status.accounts?.length || 0,
      "accounts",
    );

    if (!status.isLoggedIn) {
      console.log("[Castor] Not logged in, returning error");
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "⚠️ 로그인이 필요합니다. 설정에서 로그인해주세요.",
        timestamp: Date.now(),
      };
      this.messages.push(errorMessage);
      this.postMessage({ type: "receiveMessage", payload: errorMessage });
      return;
    }

    // AI 응답 생성
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      toolCalls: [],
    };

    try {
      // AgentBrain 초기화 (필요 시)
      if (!this.agentBrain) {
        vscode.window.showInformationMessage("[Castor] Creating AgentBrain...");

        // 로그인 상태 확인
        const { getActiveAccount } = await import("../auth/secretStorage.js");
        const account = await getActiveAccount(this.context);
        if (!account) {
          throw new Error(
            "로그인이 필요합니다. 먼저 Antigravity 계정으로 로그인해주세요.",
          );
        }
        vscode.window.showInformationMessage(
          `[Castor] Logged in as: ${account.email}`,
        );

        const client = await createAntigravityClient(this.context);
        const provider = new AntigravityProvider(client);
        this.agentBrain = new AgentBrain(provider, {
          mode: payload.mode || "edit",
        });

        // 도구 등록
        for (const tool of toolRegistry.getAll()) {
          this.agentBrain.registerTool(
            {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
            (args) => tool.execute(args),
          );
        }
        vscode.window.showInformationMessage("[Castor] AgentBrain created!");
      }

      // 스트리밍 응답 처리
      const options = {
        model: payload.model || ("gemini-3-flash-preview" as AIModel),
        thinkingLevel: "HIGH" as const,
      };

      vscode.window.showInformationMessage(
        `[Castor] Starting run() with model: ${options.model}`,
      );

      let eventCount = 0;

      // 타임아웃 설정 (30초)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("API 응답 타임아웃 (30초)")), 30000);
      });

      try {
        const runGenerator = this.agentBrain.run(this.messages, options);

        for await (const event of runGenerator) {
          eventCount++;
          vscode.window.showInformationMessage(
            `[Castor] Event #${eventCount}: ${event.type}`,
          );

          switch (event.type) {
            case "thinking":
              assistantMessage.thinking =
                (assistantMessage.thinking || "") + event.content;
              this.postMessage({
                type: "streamChunk",
                payload: { type: "thinking", content: event.content },
              });
              break;

            case "text":
              assistantMessage.content += event.content;
              this.postMessage({
                type: "streamChunk",
                payload: { type: "text", content: event.content },
              });
              break;

            case "tool_start":
              if (event.toolCall) {
                assistantMessage.toolCalls?.push(event.toolCall);
                this.postMessage({
                  type: "streamChunk",
                  payload: { type: "tool_start", toolCall: event.toolCall },
                });
              }
              break;

            case "tool_end":
              if (event.toolCall) {
                const idx = assistantMessage.toolCalls?.findIndex(
                  (tc) => tc.id === event.toolCall?.id,
                );
                if (
                  idx !== undefined &&
                  idx >= 0 &&
                  assistantMessage.toolCalls
                ) {
                  assistantMessage.toolCalls[idx] = event.toolCall;
                }
                this.postMessage({
                  type: "streamChunk",
                  payload: { type: "tool_end", toolCall: event.toolCall },
                });
              }
              break;

            case "error":
              vscode.window.showErrorMessage(
                `[Castor] Agent error: ${event.error?.message}`,
              );
              assistantMessage.content += `\n\n⚠️ 오류: ${event.error?.message || "알 수 없는 오류"}`;
              break;
          }
        }
      } catch (timeoutError) {
        throw timeoutError;
      }

      vscode.window.showInformationMessage(
        `[Castor] Finished! Events: ${eventCount}`,
      );

      // 응답이 비어있으면 fallback 메시지
      if (!assistantMessage.content.trim()) {
        assistantMessage.content =
          "⚠️ AI 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.";
      }
    } catch (error) {
      console.error("[Castor] handleSendMessage error:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`[Castor] Error: ${errorMsg}`);
      assistantMessage.content = `⚠️ 오류가 발생했습니다: ${errorMsg}`;
    }

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
    // 개발 모드에서만 cache busting 적용
    const isDev =
      this.context.extensionMode === vscode.ExtensionMode.Development;
    const cacheBuster = isDev ? `?v=${Date.now()}` : "";

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}${cacheBuster}" rel="stylesheet">
  <title>Castor Agent</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}${cacheBuster}"></script>
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
