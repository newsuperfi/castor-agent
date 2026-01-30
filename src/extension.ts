import * as vscode from "vscode";
import { PlanningCodeLensProvider } from "./providers/planning/planningCodeLensProvider.js";
import { PlanningCreateHandler } from "./providers/planning/planningCommandHandlers.js";
import { PlanningCommentController } from "./providers/planning/planningCommentController.js";
import { SidebarProvider } from "./ui/sidebarProvider.js";

/**
 * Placeholder TreeDataProvider - Hybrid Sidebar Pattern용
 * VS Code가 사이드바 컨테이너를 안정적으로 인식하도록 함
 */
class ActionsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<vscode.TreeItem[]> {
    // 빈 트리 반환 (Chat Webview가 주 UI)
    return Promise.resolve([]);
  }
}

/**
 * Castor Agent Extension 활성화
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log("Castor Agent 활성화됨");

  // Antigravity Cockpit 계정 자동 import (429 회피용)
  import("./auth/cockpitImport.js")
    .then(({ importCockpitAccounts }) => {
      importCockpitAccounts(context).then((count) => {
        if (count > 0) {
          console.log(`[Castor] Imported ${count} Cockpit accounts`);
        }
      });
    })
    .catch((err) => console.error("[Castor] Failed to import Cockpit:", err));

  // Hybrid Sidebar Pattern: TreeView를 먼저 등록하여 컨테이너 안정화
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "castor-actions",
      new ActionsTreeProvider(),
    ),
  );

  // 인라인 Diff 매니저 초기화
  import("./ui/inlineDiffManager.js")
    .then(({ initInlineDiffManager }) => {
      initInlineDiffManager(context);
      console.log("[Castor] Inline Diff Manager 초기화 완료");
    })
    .catch((err) =>
      console.error("[Castor] Inline Diff Manager 초기화 실패:", err),
    );

  // Sidebar Webview Provider 등록
  const sidebarProvider = new SidebarProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "castor.chatView",
      sidebarProvider,
    ),
  );

  // 명령어 등록
  context.subscriptions.push(
    vscode.commands.registerCommand("castor.startChat", () => {
      vscode.commands.executeCommand("castor.chatView.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("castor.login", async () => {
      await sidebarProvider.handleLogin();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("castor.logout", async () => {
      await sidebarProvider.handleLogout();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("castor.selectModel", async () => {
      const models = [
        "gemini-3-pro-preview",
        "gemini-3-flash-preview",
        "claude-opus-4.5",
        "claude-sonnet-4.5",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
      ];

      const selected = await vscode.window.showQuickPick(models, {
        placeHolder: "사용할 AI 모델을 선택하세요",
      });

      if (selected) {
        const config = vscode.workspace.getConfiguration("castor");
        await config.update(
          "defaultModel",
          selected,
          vscode.ConfigurationTarget.Global,
        );
        vscode.window.showInformationMessage(
          `모델이 ${selected}로 변경되었습니다.`,
        );
      }
    }),
  );

  // Planning CodeLens 등록
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", pattern: "**\/implementation_plan.md" },
      new PlanningCodeLensProvider(context),
    ),
  );

  // Planning Handlers 등록
  const planningHandler = new PlanningCreateHandler(context, sidebarProvider);
  planningHandler.register();

  // Planning Comments 등록
  new PlanningCommentController(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("castor.openPlan", async () => {
      await sidebarProvider.openLastImplementationPlan();
    }),
  );

  // Webview 버튼용: 최신 플랜 실행
  context.subscriptions.push(
    vscode.commands.registerCommand("castor.plan.executeLatest", async () => {
      await sidebarProvider.executeLatestPlan();
    }),
  );

  // Webview 버튼용: 최신 플랜 AI 리뷰
  context.subscriptions.push(
    vscode.commands.registerCommand("castor.plan.reviewLatest", async () => {
      await sidebarProvider.reviewLatestPlan();
    }),
  );

  // 채팅창 포커스 (Cmd+Shift+C)
  context.subscriptions.push(
    vscode.commands.registerCommand("castor.focusChat", () => {
      vscode.commands.executeCommand("castor.chatView.focus");
    }),
  );

  // 새 대화 (Cmd+L)
  context.subscriptions.push(
    vscode.commands.registerCommand("castor.newChat", () => {
      // 먼저 채팅창 포커스
      vscode.commands.executeCommand("castor.chatView.focus");
      // SidebarProvider에게 새 대화 시작 메시지 전송
      sidebarProvider.handleNewSession();
    }),
  );

  // Diff Accept (에디터 타이틀 버튼)
  context.subscriptions.push(
    vscode.commands.registerCommand("castor.acceptChange", async () => {
      await sidebarProvider.handleAcceptCurrentDiff();
    }),
  );

  // Diff Reject (에디터 타이틀 버튼)
  context.subscriptions.push(
    vscode.commands.registerCommand("castor.rejectChange", async () => {
      await sidebarProvider.handleRejectCurrentDiff();
    }),
  );
}

/**
 * Castor Agent Extension 비활성화
 */
export function deactivate(): void {
  console.log("Castor Agent 비활성화됨");
}
