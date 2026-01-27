import * as vscode from "vscode";
import { SidebarProvider } from "./ui/sidebarProvider.js";

/**
 * Castor Agent Extension 활성화
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log("Castor Agent 활성화됨");

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

  context.subscriptions.push(
    vscode.commands.registerCommand("castor.openPlan", () => {
      // TODO: 플래닝 패널 구현
      vscode.window.showInformationMessage(
        "플래닝 보드 기능은 Phase 2에서 구현됩니다.",
      );
    }),
  );
}

/**
 * Castor Agent Extension 비활성화
 */
export function deactivate(): void {
  console.log("Castor Agent 비활성화됨");
}
