/**
 * Session Storage - 대화 세션 저장/조회
 * VS Code globalState를 사용하여 세션 데이터 영구 저장
 */

import * as vscode from "vscode";
import type { ChatMessage } from "../types.js";

// 세션 인터페이스
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// 저장 키
const SESSIONS_KEY = "castor.sessions";
const CURRENT_SESSION_KEY = "castor.currentSessionId";
const MAX_SESSIONS = 50; // 최대 세션 수

/**
 * 전체 세션 목록 조회
 */
export async function listSessions(
  context: vscode.ExtensionContext,
): Promise<ChatSession[]> {
  const sessions = context.globalState.get<ChatSession[]>(SESSIONS_KEY) || [];
  // 최신순 정렬
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 특정 세션 조회
 */
export async function loadSession(
  context: vscode.ExtensionContext,
  sessionId: string,
): Promise<ChatSession | null> {
  const sessions = await listSessions(context);
  return sessions.find((s) => s.id === sessionId) || null;
}

/**
 * 세션 저장 (생성 또는 업데이트)
 */
export async function saveSession(
  context: vscode.ExtensionContext,
  session: ChatSession,
): Promise<void> {
  const sessions = await listSessions(context);
  const existingIndex = sessions.findIndex((s) => s.id === session.id);

  if (existingIndex >= 0) {
    // 기존 세션 업데이트
    sessions[existingIndex] = session;
  } else {
    // 새 세션 추가
    sessions.unshift(session);
  }

  // 최대 세션 수 제한
  const trimmedSessions = sessions.slice(0, MAX_SESSIONS);

  await context.globalState.update(SESSIONS_KEY, trimmedSessions);
}

/**
 * 세션 삭제
 */
export async function deleteSession(
  context: vscode.ExtensionContext,
  sessionId: string,
): Promise<void> {
  const sessions = await listSessions(context);
  const filtered = sessions.filter((s) => s.id !== sessionId);
  await context.globalState.update(SESSIONS_KEY, filtered);
}

/**
 * 현재 세션 ID 조회
 */
export async function getCurrentSessionId(
  context: vscode.ExtensionContext,
): Promise<string | null> {
  return context.globalState.get<string>(CURRENT_SESSION_KEY) || null;
}

/**
 * 현재 세션 ID 설정
 */
export async function setCurrentSessionId(
  context: vscode.ExtensionContext,
  sessionId: string | null,
): Promise<void> {
  await context.globalState.update(CURRENT_SESSION_KEY, sessionId);
}

/**
 * 새 세션 생성
 */
export function createNewSession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "새 대화",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * AI로 세션 제목 생성 (gemini-2.5-flash-lite 사용)
 */
export async function generateSessionTitle(
  context: vscode.ExtensionContext,
  firstMessage: string,
): Promise<string> {
  try {
    // gemini-2.5-flash-lite API 호출
    const { createAntigravityClient } = await import("../api/client.js");
    const client = await createAntigravityClient(context);

    const response = await client.post(
      "/v1internal:streamGenerateContent?alt=sse",
      {
        model: "gemini-2.5-flash-lite",
        project: "sonic-booking-3gc82", // 기본 프로젝트
        request: {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `다음 메시지의 핵심 내용을 15자 이내의 간결한 한국어 제목으로 요약해주세요. 제목만 출력하세요.\n\n"${firstMessage}"`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 50,
          },
        },
      },
    );

    // SSE 응답 파싱
    const responseText = response.data as string;
    const lines = responseText.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          const text =
            data.response?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return text.trim().replace(/^["']|["']$/g, ""); // 따옴표 제거
          }
        } catch {
          // 파싱 실패 무시
        }
      }
    }

    // 폴백: 첫 20자 사용
    return firstMessage.slice(0, 20) + (firstMessage.length > 20 ? "..." : "");
  } catch (error) {
    console.error("[Castor/SessionStorage] Title generation failed:", error);
    // 폴백: 첫 20자 사용
    return firstMessage.slice(0, 20) + (firstMessage.length > 20 ? "..." : "");
  }
}
