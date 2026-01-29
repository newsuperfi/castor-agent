/**
 * 마크다운 렌더러 컴포넌트
 * react-markdown + syntax highlighter
 */

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // 코드 블록
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "";
          const codeString = String(children).replace(/\n$/, "");

          // 멀티라인이거나 언어 지정이 있으면 코드 블록
          const isCodeBlock = match || codeString.includes("\n");

          if (isCodeBlock) {
            return <CodeBlock language={language} code={codeString} />;
          }

          // 인라인 코드
          return (
            <code
              className="px-1.5 py-0.5 rounded bg-black/30 text-sm font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },
        // 링크
        a({ node, children, href, ...props }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
              {...props}
            >
              {children}
            </a>
          );
        },
        // 테이블
        table({ node, children, ...props }) {
          return (
            <div className="overflow-x-auto my-2">
              <table
                className="border-collapse border border-vscode-border text-sm"
                {...props}
              >
                {children}
              </table>
            </div>
          );
        },
        th({ node, children, ...props }) {
          return (
            <th
              className="border border-vscode-border px-3 py-1 bg-vscode-hover"
              {...props}
            >
              {children}
            </th>
          );
        },
        td({ node, children, ...props }) {
          return (
            <td className="border border-vscode-border px-3 py-1" {...props}>
              {children}
            </td>
          );
        },
        // 리스트
        ul({ node, children, ...props }) {
          return (
            <ul className="list-disc list-inside space-y-1 my-2" {...props}>
              {children}
            </ul>
          );
        },
        ol({ node, children, ...props }) {
          return (
            <ol className="list-decimal list-inside space-y-1 my-2" {...props}>
              {children}
            </ol>
          );
        },
        // 헤딩
        h1({ node, children, ...props }) {
          return (
            <h1 className="text-xl font-bold mt-4 mb-2" {...props}>
              {children}
            </h1>
          );
        },
        h2({ node, children, ...props }) {
          return (
            <h2 className="text-lg font-semibold mt-3 mb-2" {...props}>
              {children}
            </h2>
          );
        },
        h3({ node, children, ...props }) {
          return (
            <h3 className="text-base font-semibold mt-2 mb-1" {...props}>
              {children}
            </h3>
          );
        },
        // 인용
        blockquote({ node, children, ...props }) {
          return (
            <blockquote
              className="border-l-4 border-vscode-border pl-4 my-2 opacity-80 italic"
              {...props}
            >
              {children}
            </blockquote>
          );
        },
        // 수평선
        hr({ node, ...props }) {
          return <hr className="border-vscode-border my-4" {...props} />;
        },
        // 단락
        p({ node, children, ...props }) {
          return (
            <p className="my-1" {...props}>
              {children}
            </p>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/**
 * 코드 블록 컴포넌트 (복사 버튼 + 실행 버튼 포함)
 */
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  // 실행 가능한 언어인지 확인
  const isExecutable = ["bash", "sh", "zsh", "shell"].includes(
    language.toLowerCase(),
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRun = () => {
    // VS Code 확장에 실행 요청 전송
    const vscode = (
      window as unknown as { vscode?: { postMessage: (msg: unknown) => void } }
    ).vscode;
    vscode?.postMessage({
      type: "runCodeBlock",
      payload: { code, language },
    });
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden">
      {/* 언어 라벨 + 버튼들 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1e] text-xs border-b border-[#3c3c3c]">
        <span className="opacity-60">{language || "code"}</span>
        <div className="flex gap-1">
          {/* 실행 버튼 (실행 가능한 언어만) */}
          {isExecutable && (
            <button
              onClick={handleRun}
              className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded hover:bg-green-500/20 text-green-400"
              title="터미널에서 실행"
            >
              Run
            </button>
          )}
          {/* 복사 버튼 */}
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded hover:bg-white/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {/* 코드 */}
      <SyntaxHighlighter
        language={language || "text"}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: "0.75rem 1rem",
          fontSize: "0.8125rem",
          borderRadius: 0,
        }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
