/**
 * URL 읽기 도구
 * 웹 페이지 내용을 텍스트로 가져옴
 */

import axios from "axios";
import type { ITool } from "./registry.js";

// HTML 태그 제거
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 텍스트 길이 제한
function truncateText(text: string, maxLength = 10000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n\n... (truncated)";
}

export const readUrlTool: ITool = {
  name: "read_url",
  description:
    "URL에서 웹 페이지 내용을 읽어옵니다. HTML을 텍스트로 변환하여 반환합니다.",
  parameters: {
    url: {
      type: "string",
      description: "읽을 웹 페이지 URL",
      required: true,
    },
    raw: {
      type: "boolean",
      description: "true면 HTML 그대로, false(기본값)면 텍스트로 변환",
      required: false,
    },
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    const url = args.url as string;
    const raw = args.raw === true;

    if (!url) {
      throw new Error("URL이 필요합니다.");
    }

    // URL 유효성 검사
    try {
      new URL(url);
    } catch {
      throw new Error(`유효하지 않은 URL입니다: ${url}`);
    }

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CastorAgent/1.0; +https://github.com/castor-agent)",
          Accept: "text/html,application/xhtml+xml,text/plain,*/*",
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });

      const contentType = response.headers["content-type"] || "";
      const content = response.data;

      // JSON 응답 처리
      if (
        contentType.includes("application/json") ||
        typeof content === "object"
      ) {
        return JSON.stringify(content, null, 2);
      }

      // HTML 처리
      if (raw || !contentType.includes("text/html")) {
        return truncateText(String(content));
      }

      // HTML → 텍스트 변환
      const text = stripHtml(String(content));
      return truncateText(text);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          throw new Error(`요청 시간 초과: ${url}`);
        }
        if (error.response) {
          throw new Error(
            `HTTP 오류 ${error.response.status}: ${error.response.statusText}`,
          );
        }
        throw new Error(`네트워크 오류: ${error.message}`);
      }
      throw error;
    }
  },
};
