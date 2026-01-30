import * as vscode from "vscode";

let commentId = 1;

class NoteComment implements vscode.Comment {
  id: number;
  label: string | undefined;
  constructor(
    public body: string | vscode.MarkdownString,
    public mode: vscode.CommentMode,
    public author: vscode.CommentAuthorInformation,
    public parent?: vscode.CommentThread,
    public contextValue?: string,
  ) {
    this.id = ++commentId;
  }
}

export class PlanningCommentController {
  private controller: vscode.CommentController;

  constructor(private context: vscode.ExtensionContext) {
    this.controller = vscode.comments.createCommentController(
      "planning-comments",
      "Implementation Plan Comments",
    );

    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
      ) => {
        if (!document.fileName.endsWith("implementation_plan.md")) {
          return undefined;
        }
        return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
      },
    };

    // 커맨드 등록
    context.subscriptions.push(this.controller);

    // 코멘트 작성 핸들러
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "castor.comment.reply",
        (reply: vscode.CommentReply) => {
          this.reply(reply);
        },
      ),
    );
  }

  private reply(reply: vscode.CommentReply) {
    const thread = reply.thread;
    const newComment = new NoteComment(
      reply.text,
      vscode.CommentMode.Preview,
      { name: "User" },
      thread,
      thread.comments.length ? "canDelete" : undefined,
    );

    thread.comments = [...thread.comments, newComment];
  }
}
