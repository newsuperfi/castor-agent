/**
 * Antigravity OAuth 모듈
 * PKCE 기반 OAuth 2.0 플로우 구현
 * 다중 계정 지원
 */

import axios from "axios";
import * as crypto from "crypto";
import * as http from "http";
import * as vscode from "vscode";
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  ANTIGRAVITY_DEFAULT_PROJECT_ID,
  ANTIGRAVITY_ENDPOINT_PROD,
  ANTIGRAVITY_HEADERS,
  ANTIGRAVITY_SCOPES,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
} from "./constants.js";
import {
  addOrUpdateAccount,
  clearAllAccounts,
  getActiveAccount,
  getAllAccounts,
  removeAccount,
  setActiveAccount,
  updateAccessToken,
  type AccountInfo,
} from "./secretStorage.js";

// PKCE 관련 유틸리티
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// 토큰 응답 타입
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface UserInfo {
  email?: string;
  name?: string;
  picture?: string;
}

interface ProjectInfo {
  cloudaicompanionProject?: string | { id: string };
}

// OAuth 상태 (PKCE verifier 저장)
interface OAuthState {
  verifier: string;
}

function encodeState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function decodeState(encoded: string): OAuthState {
  const json = Buffer.from(encoded, "base64url").toString("utf8");
  return JSON.parse(json);
}

/**
 * ProjectID 조회 (Antigravity API에서)
 */
async function fetchProjectId(accessToken: string): Promise<string> {
  try {
    const response = await axios.post<ProjectInfo>(
      `${ANTIGRAVITY_ENDPOINT_PROD}/v1internal:loadCodeAssist`,
      {
        metadata: {
          ideType: "IDE_UNSPECIFIED",
          platform: "PLATFORM_UNSPECIFIED",
          pluginType: "GEMINI",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_HEADERS,
        },
        timeout: 10000,
      },
    );

    const project = response.data.cloudaicompanionProject;
    if (typeof project === "string") {
      return project;
    }
    if (project && typeof project.id === "string") {
      return project.id;
    }
  } catch (error) {
    console.warn("Failed to fetch project ID:", error);
  }

  return ANTIGRAVITY_DEFAULT_PROJECT_ID;
}

/**
 * Antigravity OAuth 로그인 (다중 계정 지원)
 * 새 계정을 추가하거나 기존 계정을 업데이트
 */
export async function loginWithAntigravity(
  context: vscode.ExtensionContext,
): Promise<{ email: string; projectId: string; accountIndex: number } | null> {
  return new Promise((resolve) => {
    // PKCE 생성
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);

    // 동적 포트로 HTTP 서버 시작
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        resolve(null);
        return;
      }

      const port = address.port;
      const redirectUri = `http://localhost:${port}/oauth-callback`;

      // OAuth 상태 인코딩
      const state = encodeState({ verifier });

      // OAuth URL 생성
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set("client_id", ANTIGRAVITY_CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", ANTIGRAVITY_SCOPES.join(" "));
      authUrl.searchParams.set("code_challenge", challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");

      // 브라우저 열기
      vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

      // 타임아웃 설정 (5분)
      const timeout = setTimeout(
        () => {
          server.close();
          resolve(null);
        },
        5 * 60 * 1000,
      );

      // 콜백 처리
      server.on("request", async (req, res) => {
        if (!req.url?.startsWith("/oauth-callback")) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }

        const url = new URL(req.url, `http://localhost:${port}`);
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        clearTimeout(timeout);

        if (error || !code || !returnedState) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>❌ 인증 실패</h1>
                <p>${error || "인증 코드를 받지 못했습니다."}</p>
                <p>이 창을 닫고 다시 시도해주세요.</p>
              </body>
            </html>
          `);
          server.close();
          resolve(null);
          return;
        }

        try {
          // 상태 복호화
          const { verifier: storedVerifier } = decodeState(returnedState);

          // 토큰 교환
          const tokenResponse = await axios.post<TokenResponse>(
            GOOGLE_TOKEN_URL,
            new URLSearchParams({
              client_id: ANTIGRAVITY_CLIENT_ID,
              client_secret: ANTIGRAVITY_CLIENT_SECRET,
              code,
              grant_type: "authorization_code",
              redirect_uri: redirectUri,
              code_verifier: storedVerifier,
            }),
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
            },
          );

          const { access_token, refresh_token, expires_in } =
            tokenResponse.data;

          if (!refresh_token) {
            throw new Error("Refresh token not received");
          }

          // 사용자 정보 조회
          const userInfoResponse = await axios.get<UserInfo>(
            GOOGLE_USERINFO_URL,
            {
              headers: { Authorization: `Bearer ${access_token}` },
            },
          );
          const email = userInfoResponse.data.email || "unknown";

          // 프로젝트 ID 조회
          const projectId = await fetchProjectId(access_token);

          // 다중 계정 저장
          const expiresAt = Date.now() + expires_in * 1000;
          const accountInfo: AccountInfo = {
            email,
            projectId,
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt,
          };

          const accountIndex = await addOrUpdateAccount(context, accountInfo);

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>✅ 인증 성공!</h1>
                <p>${email}로 로그인되었습니다.</p>
                <p>이 창을 닫고 VS Code로 돌아가세요.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);

          server.close();
          resolve({ email, projectId, accountIndex });
        } catch (err) {
          console.error("Token exchange failed:", err);
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>❌ 토큰 교환 실패</h1>
                <p>${err instanceof Error ? err.message : "알 수 없는 오류"}</p>
              </body>
            </html>
          `);
          server.close();
          resolve(null);
        }
      });
    });
  });
}

/**
 * Access Token 갱신 (활성 계정의 Refresh Token 사용)
 */
export async function refreshAccessToken(
  context: vscode.ExtensionContext,
): Promise<string | null> {
  const account = await getActiveAccount(context);
  if (!account) {
    return null;
  }

  try {
    const response = await axios.post<TokenResponse>(
      GOOGLE_TOKEN_URL,
      new URLSearchParams({
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
        refresh_token: account.refreshToken,
        grant_type: "refresh_token",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const { access_token, expires_in } = response.data;
    const expiresAt = Date.now() + expires_in * 1000;

    // 새 토큰 저장
    await updateAccessToken(context, access_token, expiresAt);

    return access_token;
  } catch (error) {
    console.error("Token refresh failed:", error);
    return null;
  }
}

/**
 * 현재 유효한 Access Token 가져오기
 * 만료되었으면 자동 갱신
 */
export async function getValidAccessToken(
  context: vscode.ExtensionContext,
): Promise<string | null> {
  const account = await getActiveAccount(context);
  if (!account) {
    return null;
  }

  // 30초 여유를 두고 만료 체크
  if (Date.now() > account.expiresAt - 30000) {
    return refreshAccessToken(context);
  }

  return account.accessToken;
}

/**
 * 현재 로그인 상태 확인 (다중 계정 정보 포함)
 */
export async function getLoginStatus(
  context: vscode.ExtensionContext,
): Promise<{
  isLoggedIn: boolean;
  email?: string;
  projectId?: string;
  accounts: Array<{ email: string; isActive: boolean }>;
  activeIndex: number;
}> {
  const { accounts, activeIndex } = await getAllAccounts(context);

  if (accounts.length === 0) {
    return { isLoggedIn: false, accounts: [], activeIndex: -1 };
  }

  const activeAccount = accounts[activeIndex];

  return {
    isLoggedIn: true,
    email: activeAccount?.email,
    projectId: activeAccount?.projectId,
    accounts: accounts.map((a, i) => ({
      email: a.email,
      isActive: i === activeIndex,
    })),
    activeIndex,
  };
}

/**
 * 계정 전환
 */
export async function switchAccount(
  context: vscode.ExtensionContext,
  index: number,
): Promise<boolean> {
  return setActiveAccount(context, index);
}

/**
 * 계정 삭제
 */
export async function deleteAccount(
  context: vscode.ExtensionContext,
  index: number,
): Promise<void> {
  await removeAccount(context, index);
}

/**
 * 로그아웃 (모든 계정 삭제)
 */
export async function logout(context: vscode.ExtensionContext): Promise<void> {
  await clearAllAccounts(context);
}

/**
 * 현재 활성 계정만 로그아웃
 */
export async function logoutCurrentAccount(
  context: vscode.ExtensionContext,
): Promise<void> {
  const { activeIndex } = await getAllAccounts(context);
  if (activeIndex >= 0) {
    await removeAccount(context, activeIndex);
  }
}
