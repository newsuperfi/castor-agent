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
import {
  createNewSession,
  deleteSession as deleteSessionStorage,
  generateSessionTitle,
  getCurrentSessionId,
  listSessions,
  loadSession,
  saveSession,
  setCurrentSessionId,
  type ChatSession,
} from "../storage/sessionStorage.js";
import { registerAllTools, toolRegistry } from "../tools/index.js";
import type {
  AIModel,
  ChatMessage,
  GenerateOptions,
  WebviewMessage,
} from "../types.js";
import {
  formatMessageWithContext,
  getActiveEditorContext,
  getSelectedTextContext,
  parseFileMentions,
} from "../utils/contextUtils.js";
import { PlanPreviewPanel } from "./planPreviewPanel.js";

/**
 * Sidebar 채팅창 Webview Provider
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];
  private agentBrain?: AgentBrain;
  private currentSession?: ChatSession;
  private isAborted = false;
  private pendingChanges: Map<string, { filePath: string; content: string }> =
    new Map();
  private diffContentProvider?: Map<string, string>;
  private currentDiffFile?: {
    fileId: string;
    filePath: string;
    originalContent: string;
    newContent: string;
  };

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
      case "ready":
        // Webview가 준비되면 초기 상태 전송
        console.log("[Castor] Webview ready, sending initial state");
        await this.sendInitialState();
        break;

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

      // 세션 관련
      case "newSession":
        await this.handleNewSession();
        break;

      case "loadSession":
        await this.handleLoadSession(
          (message.payload as { sessionId: string }).sessionId,
        );
        break;

      case "deleteSession":
        await this.handleDeleteSession(
          (message.payload as { sessionId: string }).sessionId,
        );
        break;

      case "getSessions":
        await this.handleGetSessions();
        break;

      // 컨텍스트 관련
      case "getContext":
        this.handleGetContext();
        break;

      case "getSelection":
        this.handleGetSelection();
        break;

      case "abortStreaming":
        this.handleAbortStreaming();
        break;

      case "exportConversation":
        this.handleExportConversation();
        break;

      case "runCodeBlock":
        this.handleRunCodeBlock(
          message.payload as { code: string; language: string },
        );
        break;

      case "acceptChange":
        this.handleAcceptChange(message.payload as { fileId: string });
        break;

      case "rejectChange":
        this.handleRejectChange(message.payload as { fileId: string });
        break;

      case "acceptAllChanges":
        this.handleAcceptAllChanges();
        break;

      case "rejectAllChanges":
        this.handleRejectAllChanges();
        break;

      case "showDiffInEditor":
        this.handleShowDiffInEditor(
          message.payload as {
            fileId: string;
            filePath: string;
            originalContent: string;
            newContent: string;
          },
        );
        break;

      case "executeCommand":
        await vscode.commands.executeCommand(
          (message.payload as { command: string }).command,
        );
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
    thinkingLevel?: string; // webview에서 소문자로 옴
  }): Promise<void> {
    vscode.window.showInformationMessage(
      `[Castor] handleSendMessage: ${payload.content.substring(0, 30)}`,
    );
    const config = vscode.workspace.getConfiguration("castor");

    console.log(
      "[Castor] handleSendMessage called with:",
      payload.content.substring(0, 50),
    );

    // @파일명 멘션 파싱 및 파일 내용 첨부
    const { message: parsedMessage, contexts } = await parseFileMentions(
      payload.content,
    );
    const enhancedContent =
      contexts.length > 0
        ? formatMessageWithContext(parsedMessage, contexts)
        : parsedMessage;

    if (contexts.length > 0) {
      console.log(
        `[Castor] @멘션 ${contexts.length}개 파일 첨부됨:`,
        contexts.map((c) => c.path).join(", "),
      );
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: enhancedContent,
      timestamp: Date.now(),
    };

    this.messages.push(userMessage);
    // 사용자 메시지는 webview에서 이미 표시하므로 여기서 보내지 않음

    // 세션 제목 자동 생성 (첫 메시지일 때만)
    if (
      this.currentSession &&
      this.currentSession.title === "새 대화" &&
      this.messages.length === 1
    ) {
      // 첫 메시지의 처음 30자를 제목으로 사용
      const newTitle = parsedMessage.substring(0, 30).trim() || "새 대화";
      this.currentSession.title =
        newTitle + (parsedMessage.length > 30 ? "..." : "");
      await this.saveCurrentSession();
      await this.sendSessionsUpdate();
    }

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

        // 현재 계정 정보를 provider에 전달 (projectId 포함)
        const { setCurrentAccount } =
          await import("../providers/antigravity.js");
        setCurrentAccount(account.email, account.projectId);

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
      // thinkingLevel: webview(소문자) -> provider(대문자) 변환
      const thinkingLevel = (
        payload.thinkingLevel ||
        config.get<string>("thinkingLevel") ||
        "HIGH"
      ).toUpperCase();

      const options = {
        model: payload.model || ("gemini-3-flash-preview" as AIModel),
        thinkingLevel: thinkingLevel as import("../types.js").ThinkingLevel,
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
              if (event.thoughtSignature) {
                assistantMessage.thoughtSignature = event.thoughtSignature;
              }
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
      // 단, 도구 호출이 있으면 정상 응답으로 간주
      const hasToolCalls =
        assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0;
      if (!assistantMessage.content.trim() && !hasToolCalls) {
        assistantMessage.content =
          "⚠️ AI 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.";
      }
    } catch (error) {
      console.error("[Castor] handleSendMessage error:", error);

      // 에러 분류 및 사용자 친화적 메시지 생성
      const { classifyError, formatErrorForUser } =
        await import("../utils/errorUtils.js");
      const classified = classifyError(error);
      const userMessage = formatErrorForUser(classified);

      vscode.window.showErrorMessage(`[Castor] ${classified.message}`);
      assistantMessage.content = userMessage;
    }

    // Plan 모드에서는 먼저 uiType 설정 후 Markdown Preview로 표시
    if (payload.mode === "plan" && assistantMessage.content.trim()) {
      assistantMessage.uiType = "plan"; // Webview에서는 버튼으로 표시
      await this.showImplementationPlan(assistantMessage.content);
    }

    this.messages.push(assistantMessage);
    this.postMessage({ type: "receiveMessage", payload: assistantMessage });

    // 세션 저장
    await this.saveCurrentSession();
  }

  /**
   * Implementation Plan을 Markdown Preview로 표시
   */
  private async showImplementationPlan(content: string): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const crypto = await import("crypto");

    // 프로젝트별 디렉토리 생성
    const workspaceFolder =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "default";
    const projectHash = crypto
      .createHash("md5")
      .update(workspaceFolder)
      .digest("hex")
      .slice(0, 8);
    const projectName = path.basename(workspaceFolder);

    const projectDir = path.join(
      this.context.globalStorageUri.fsPath,
      "projects",
      `${projectName}-${projectHash}`,
    );

    // 디렉토리 생성
    await fs.mkdir(projectDir, { recursive: true });

    // Markdown 파일 생성
    const planPath = path.join(projectDir, "implementation_plan.md");
    const planUriObj = vscode.Uri.file(planPath);

    // Command Link 생성
    const args = encodeURIComponent(JSON.stringify([planUriObj]));
    const executeLink = `[🚀 계획 실행](command:castor.plan.execute?${args})`;
    const reviewLink = `[💬 AI 리뷰](command:castor.plan.review?${args})`;

    const markdownContent = `# Implementation Plan

> ${executeLink} &nbsp;&nbsp; ${reviewLink}

${content}

---
*Generated by Castor Agent*
`;
    await fs.writeFile(planPath, markdownContent, "utf-8");

    // 커스텀 Webview Panel로 Implementation Plan 표시
    PlanPreviewPanel.createOrShow(
      this.context.extensionUri,
      vscode.Uri.file(planPath),
      markdownContent,
    );
  }

  /**
   * 저장된 Implementation Plan 열기 (공개 메서드)
   */
  public async openLastImplementationPlan(): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const crypto = await import("crypto");

    // 프로젝트별 디렉토리 계산
    const workspaceFolder =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "default";
    const projectHash = crypto
      .createHash("md5")
      .update(workspaceFolder)
      .digest("hex")
      .slice(0, 8);
    const projectName = path.basename(workspaceFolder);

    const projectDir = path.join(
      this.context.globalStorageUri.fsPath,
      "projects",
      `${projectName}-${projectHash}`,
    );
    const planPath = path.join(projectDir, "implementation_plan.md");

    try {
      await fs.access(planPath); // 파일 존재 확인
      const content = await fs.readFile(planPath, "utf-8");
      // 커스텀 Webview Panel로 표시
      PlanPreviewPanel.createOrShow(
        this.context.extensionUri,
        vscode.Uri.file(planPath),
        content,
      );
    } catch {
      vscode.window.showInformationMessage("아직 생성된 구현 계획이 없습니다.");
    }
  }

  /**
   * 구현 계획 실행 (CodeLens)
   */
  public async executePlanFromURI(uri: vscode.Uri): Promise<void> {
    const fs = await import("fs/promises");
    try {
      const content = await fs.readFile(uri.fsPath, "utf-8");

      // Webview에 사용자 메시지 표시
      const userContent = "이 구현 계획대로 코드를 작성해 줘.";

      // 실제 처리 (request 구조체 생성)
      // text -> content로 수정 (handleSendMessage 스펙 준수)
      // 주의: 여기서 코드 블록으로 감싸면 중첩된 백틱으로 JSON 파싱 오류 발생
      const payload = {
        content: `${userContent}\n\n---\n\n${content}`,
        mode: "edit" as const, // 실행은 Edit 모드로
        thinkingLevel: "HIGH" as const, // 기본값
      };

      // 1. Webview에 사용자 메시지 추가 (UI 업데이트)
      this.postMessage({
        type: "receiveMessage",
        payload: {
          id: Date.now().toString(),
          role: "user",
          content: userContent, // UI에는 짧게 표시
          timestamp: Date.now(),
        },
      });

      // 2. 메시지 처리
      await this.handleSendMessage(payload as any);
    } catch (error) {
      vscode.window.showErrorMessage(`계획 파일 읽기 실패: ${error}`);
    }
  }

  /**
   * 구현 계획 리뷰 (CodeLens)
   */
  public async reviewPlanFromURI(uri: vscode.Uri): Promise<void> {
    const fs = await import("fs/promises");
    try {
      const content = await fs.readFile(uri.fsPath, "utf-8");

      const userContent = "이 구현 계획을 리뷰하고 개선점을 알려줘.";

      const payload = {
        content: `${userContent}\n\n---\n\n${content}`,
        mode: "plan" as const, // 리뷰는 Plan 모드로 유지
        thinkingLevel: "HIGH" as const,
      };

      this.postMessage({
        type: "receiveMessage",
        payload: {
          id: Date.now().toString(),
          role: "user",
          content: userContent,
          timestamp: Date.now(),
        },
      });

      await this.handleSendMessage(payload as any);
    } catch (error) {
      vscode.window.showErrorMessage(`계획 파일 읽기 실패: ${error}`);
    }
  }

  /**
   * 최신 구현 계획 실행 (Webview 버튼용)
   */
  public async executeLatestPlan(): Promise<void> {
    const planUri = await this.getLatestPlanUri();
    if (planUri) {
      await this.executePlanFromURI(planUri);
    } else {
      vscode.window.showWarningMessage("아직 생성된 구현 계획이 없습니다.");
    }
  }

  /**
   * 최신 구현 계획 AI 리뷰 (Webview 버튼용)
   */
  public async reviewLatestPlan(): Promise<void> {
    const planUri = await this.getLatestPlanUri();
    if (planUri) {
      await this.reviewPlanFromURI(planUri);
    } else {
      vscode.window.showWarningMessage("아직 생성된 구현 계획이 없습니다.");
    }
  }

  /**
   * 최신 구현 계획 파일 경로 가져오기
   */
  private async getLatestPlanUri(): Promise<vscode.Uri | null> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const crypto = await import("crypto");

    const workspaceFolder =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "default";
    const projectHash = crypto
      .createHash("md5")
      .update(workspaceFolder)
      .digest("hex")
      .slice(0, 8);
    const projectName = path.basename(workspaceFolder);

    const projectDir = path.join(
      this.context.globalStorageUri.fsPath,
      "projects",
      `${projectName}-${projectHash}`,
    );
    const planPath = path.join(projectDir, "implementation_plan.md");

    try {
      await fs.access(planPath);
      return vscode.Uri.file(planPath);
    } catch {
      return null;
    }
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

  // ===== 세션 핸들러 =====

  /**
   * 새 세션 생성
   */
  async handleNewSession(): Promise<void> {
    // 현재 세션 저장
    if (this.currentSession && this.currentSession.messages.length > 0) {
      this.currentSession.updatedAt = Date.now();
      await saveSession(this.context, this.currentSession);
    }

    // 새 세션 생성
    this.currentSession = createNewSession();
    this.messages = [];
    await setCurrentSessionId(this.context, this.currentSession.id);

    // 세션 목록 전송
    await this.sendSessionsUpdate();
  }

  /**
   * 세션 로드
   */
  private async handleLoadSession(sessionId: string): Promise<void> {
    // 현재 세션 저장
    if (this.currentSession && this.currentSession.messages.length > 0) {
      this.currentSession.updatedAt = Date.now();
      await saveSession(this.context, this.currentSession);
    }

    // 세션 로드
    const session = await loadSession(this.context, sessionId);
    if (session) {
      this.currentSession = session;
      this.messages = session.messages;
      await setCurrentSessionId(this.context, session.id);

      // 메시지 전송
      this.postMessage({
        type: "updateSettings",
        payload: {
          messages: this.messages,
          currentSessionId: session.id,
          currentSessionTitle: session.title,
        },
      });
    }
  }

  /**
   * 세션 삭제
   */
  private async handleDeleteSession(sessionId: string): Promise<void> {
    await deleteSessionStorage(this.context, sessionId);

    // 현재 세션이 삭제된 경우 새 세션 생성
    if (this.currentSession?.id === sessionId) {
      await this.handleNewSession();
    }

    await this.sendSessionsUpdate();
  }

  /**
   * 세션 목록 조회
   */
  private async handleGetSessions(): Promise<void> {
    await this.sendSessionsUpdate();
  }

  /**
   * 세션 목록 업데이트 전송
   */
  private async sendSessionsUpdate(): Promise<void> {
    const sessions = await listSessions(this.context);
    this.postMessage({
      type: "sessionsUpdated",
      payload: {
        sessions: sessions.map((s) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
        })),
        currentSessionId: this.currentSession?.id,
      },
    });
  }

  // ===== 컨텍스트 핸들러 =====

  /**
   * 현재 열린 파일 컨텍스트 가져오기
   */
  private handleGetContext(): void {
    const context = getActiveEditorContext();
    this.postMessage({
      type: "contextResult",
      payload: {
        type: "activeFile",
        context,
      },
    });
  }

  /**
   * 현재 선택된 텍스트 가져오기
   */
  private handleGetSelection(): void {
    const context = getSelectedTextContext();
    this.postMessage({
      type: "contextResult",
      payload: {
        type: "selection",
        context,
      },
    });
  }

  /**
   * 스트리밍 중단 처리
   */
  private handleAbortStreaming(): void {
    console.log("[Castor] Abort streaming requested");
    this.isAborted = true;
    this.agentBrain?.abort();
  }

  /**
   * 대화 내보내기 처리
   */
  private async handleExportConversation(): Promise<void> {
    const { exportConversation } = await import("../utils/exportUtils.js");
    await exportConversation(this.messages, this.currentSession?.title);
  }

  /**
   * 코드 블록 실행 처리
   */
  private async handleRunCodeBlock(payload: {
    code: string;
    language: string;
  }): Promise<void> {
    const terminal = vscode.window.createTerminal({
      name: "Castor 실행",
      hideFromUser: false,
    });
    terminal.show();
    terminal.sendText(payload.code);
    vscode.window.showInformationMessage("코드가 터미널에서 실행되었습니다.");
  }

  /**
   * 변경사항 승인 (개별)
   */
  private async handleAcceptChange(payload: { fileId: string }): Promise<void> {
    const change = this.pendingChanges.get(payload.fileId);
    if (!change) {
      vscode.window.showWarningMessage("변경사항을 찾을 수 없습니다.");
      return;
    }

    try {
      const uri = vscode.Uri.file(change.filePath);
      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(change.content, "utf-8"),
      );
      this.pendingChanges.delete(payload.fileId);
      vscode.window.showInformationMessage(
        `파일이 저장되었습니다: ${change.filePath}`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(`파일 저장 실패: ${error}`);
    }
  }

  /**
   * 변경사항 거부 (개별)
   */
  private handleRejectChange(payload: { fileId: string }): void {
    this.pendingChanges.delete(payload.fileId);
    vscode.window.showInformationMessage("변경사항이 거부되었습니다.");
  }

  /**
   * 모든 변경사항 승인
   */
  private async handleAcceptAllChanges(): Promise<void> {
    for (const [id, change] of this.pendingChanges) {
      try {
        const uri = vscode.Uri.file(change.filePath);
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(change.content, "utf-8"),
        );
      } catch (error) {
        vscode.window.showErrorMessage(`파일 저장 실패: ${change.filePath}`);
      }
    }
    const count = this.pendingChanges.size;
    this.pendingChanges.clear();
    vscode.window.showInformationMessage(`${count}개 파일이 저장되었습니다.`);
  }

  /**
   * 모든 변경사항 거부
   */
  private handleRejectAllChanges(): void {
    const count = this.pendingChanges.size;
    this.pendingChanges.clear();
    vscode.window.showInformationMessage(
      `${count}개 변경사항이 거부되었습니다.`,
    );
  }

  /**
   * 에디터에서 Diff 뷰 열기
   */
  private async handleShowDiffInEditor(payload: {
    fileId: string;
    filePath: string;
    originalContent: string;
    newContent: string;
  }): Promise<void> {
    try {
      const originalUri = vscode.Uri.parse(
        `castor-diff:${payload.filePath}?original`,
      );
      const modifiedUri = vscode.Uri.parse(
        `castor-diff:${payload.filePath}?modified`,
      );

      // TextDocumentContentProvider 등록 (이미 등록되어 있지 않은 경우)
      if (!this.diffContentProvider) {
        this.diffContentProvider = new Map<string, string>();
        vscode.workspace.registerTextDocumentContentProvider("castor-diff", {
          provideTextDocumentContent: (uri) => {
            return this.diffContentProvider?.get(uri.toString()) || "";
          },
        });
      }

      // 현재 diff 파일 정보 저장 (Accept/Reject 버튼용)
      this.currentDiffFile = {
        fileId: payload.fileId,
        filePath: payload.filePath,
        originalContent: payload.originalContent,
        newContent: payload.newContent,
      };

      // 콘텐츠 저장
      this.diffContentProvider.set(
        originalUri.toString(),
        payload.originalContent,
      );
      this.diffContentProvider.set(modifiedUri.toString(), payload.newContent);

      // Diff 뷰어 열기
      const fileName = payload.filePath.split("/").pop() || "file";
      await vscode.commands.executeCommand(
        "vscode.diff",
        originalUri,
        modifiedUri,
        `${fileName} (Changes)`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Diff 뷰어 열기 실패: ${error}`);
    }
  }

  /**
   * 현재 Diff Accept (에디터 타이틀 버튼에서 호출)
   */
  public async handleAcceptCurrentDiff(): Promise<void> {
    // global state에서 현재 diff 정보 가져오기
    const globalState = global as Record<string, unknown>;
    const currentDiff = globalState.castorCurrentDiff as
      | {
          fileId: string;
          filePath: string;
          newContent: string;
        }
      | undefined;

    if (!currentDiff) {
      vscode.window.showWarningMessage("No pending changes to accept.");
      return;
    }

    try {
      // 디렉토리 생성 (없으면)
      const fs = await import("fs/promises");
      const path = await import("path");
      await fs.mkdir(path.dirname(currentDiff.filePath), { recursive: true });

      // 파일 저장
      await fs.writeFile(currentDiff.filePath, currentDiff.newContent, "utf-8");
      vscode.window.showInformationMessage(
        `File saved: ${currentDiff.filePath}`,
      );

      // Diff 에디터 닫기
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor",
      );

      // 저장된 파일 열기
      const uri = vscode.Uri.file(currentDiff.filePath);
      await vscode.window.showTextDocument(uri);

      // 상태 초기화
      globalState.castorCurrentDiff = undefined;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save file: ${error}`);
    }
  }

  /**
   * 현재 Diff Reject (에디터 타이틀 버튼에서 호출)
   */
  public async handleRejectCurrentDiff(): Promise<void> {
    // global state에서 현재 diff 정보 가져오기
    const globalState = global as Record<string, unknown>;
    const currentDiff = globalState.castorCurrentDiff as
      | { fileId: string }
      | undefined;

    if (!currentDiff) {
      vscode.window.showWarningMessage("No pending changes to reject.");
      return;
    }

    // Diff 에디터 닫기
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    vscode.window.showInformationMessage("Changes rejected.");

    // 상태 초기화
    globalState.castorCurrentDiff = undefined;
  }

  /**
   * 현재 세션에 메시지 추가 및 저장
   */
  private async saveCurrentSession(): Promise<void> {
    if (!this.currentSession) {
      this.currentSession = createNewSession();
      await setCurrentSessionId(this.context, this.currentSession.id);
    }

    this.currentSession.messages = this.messages;
    this.currentSession.updatedAt = Date.now();

    // 첫 메시지면 제목 생성
    if (this.messages.length === 1 && this.currentSession.title === "새 대화") {
      const firstUserMessage = this.messages[0].content;
      // 비동기로 제목 생성
      generateSessionTitle(this.context, firstUserMessage).then(
        async (title) => {
          if (this.currentSession) {
            this.currentSession.title = title;
            await saveSession(this.context, this.currentSession);
            // 제목 업데이트 알림
            this.postMessage({
              type: "sessionsUpdated",
              payload: {
                titleUpdated: {
                  sessionId: this.currentSession.id,
                  title,
                },
              },
            });
          }
        },
      );
    }

    await saveSession(this.context, this.currentSession);
  }

  /**
   * 초기 상태 전송 (다중 계정 및 세션 포함)
   */
  private async sendInitialState(): Promise<void> {
    const config = vscode.workspace.getConfiguration("castor");
    const loginStatus = await getLoginStatus(this.context);

    // 마지막 세션 복원
    const currentSessionId = await getCurrentSessionId(this.context);
    if (currentSessionId) {
      const session = await loadSession(this.context, currentSessionId);
      if (session) {
        this.currentSession = session;
        this.messages = session.messages;
      }
    }

    // 세션이 없으면 새로 생성
    if (!this.currentSession) {
      this.currentSession = createNewSession();
      await setCurrentSessionId(this.context, this.currentSession.id);
    }

    // 세션 목록 조회
    const sessions = await listSessions(this.context);

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
        // 세션 정보
        currentSessionId: this.currentSession.id,
        currentSessionTitle: this.currentSession.title,
        sessions: sessions.map((s) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
        })),
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
