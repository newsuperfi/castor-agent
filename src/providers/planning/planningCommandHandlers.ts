import * as vscode from "vscode";
import { SidebarProvider } from "../../ui/sidebarProvider.js";

export class PlanningCreateHandler {
  constructor(
    private context: vscode.ExtensionContext,
    private sidebarProvider: SidebarProvider,
  ) {}

  public register(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        "castor.plan.execute",
        async (uri: vscode.Uri) => {
          await this.handleExecute(uri);
        },
      ),
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        "castor.plan.review",
        async (uri: vscode.Uri) => {
          await this.handleReview(uri);
        },
      ),
    );
  }

  private async handleExecute(uri: vscode.Uri): Promise<void> {
    // 채팅창 포커스
    await vscode.commands.executeCommand("castor.chatView.focus");

    // 메시지 전송
    // SidebarProvider에 public 메서드가 없으므로 handleSendMessage 대신
    // Webview로 메시지를 보내서 사용자가 보낸 것처럼 시뮬레이션하거나,
    // SidebarProvider에 메서드를 추가해야 함.
    // 여기서는 SidebarProvider에 executePlan 메서드를 추가하는 것을 가정.

    await this.sidebarProvider.executePlanFromURI(uri);
  }

  private async handleReview(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand("castor.chatView.focus");
    await this.sidebarProvider.reviewPlanFromURI(uri);
  }
}
