import { Mutex } from "async-mutex";
import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from "axios";
import type { AuthToken } from "../types.js";

interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _retryCount?: number; // 재시도 횟수 추적
}

/**
 * API 클라이언트 생성기
 * 401 자동 리프레시 및 동시성 제어 포함
 * 429 발생 시 모든 계정을 순회하며 재시도
 */
export function createApiClient(
  baseURL: string,
  getToken: () => Promise<AuthToken | null>,
  refreshToken: () => Promise<AuthToken | null>,
  onRateLimited?: () => Promise<boolean>,
  getTotalAccounts?: () => Promise<number>, // 전체 계정 수 조회
): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  const refreshMutex = new Mutex();

  // 요청 인터셉터: 토큰 주입 (만료 시 자동 리프레시)
  client.interceptors.request.use(async (config) => {
    let token = await getToken();

    console.log("[Castor/Client] Token status:", token ? "found" : "null");

    if (token) {
      const now = Date.now();
      const expiresAt = token.expiresAt || 0;
      // 5분 여유를 두고 만료 체크 (만료 5분 전에 미리 리프레시)
      const isExpired = expiresAt > 0 && now > expiresAt - 5 * 60 * 1000;

      console.log(
        "[Castor/Client] Token expires at:",
        new Date(expiresAt).toISOString(),
      );
      console.log("[Castor/Client] Current time:", new Date(now).toISOString());
      console.log("[Castor/Client] Token expired/expiring soon?:", isExpired);

      // 만료되었거나 곧 만료될 예정이면 리프레시
      if (isExpired) {
        console.log("[Castor/Client] Token expired, refreshing...");
        const newToken = await refreshToken();
        if (newToken) {
          token = newToken;
          console.log("[Castor/Client] Token refreshed successfully!");
          console.log(
            "[Castor/Client] New token expires at:",
            new Date(newToken.expiresAt || 0).toISOString(),
          );
        } else {
          console.log("[Castor/Client] WARNING: Token refresh failed!");
        }
      }

      console.log(
        "[Castor/Client] Access token (first 20 chars):",
        token.accessToken?.substring(0, 20),
      );
      config.headers.Authorization = `Bearer ${token.accessToken}`;
      console.log("[Castor/Client] Authorization header set");
    } else {
      console.log("[Castor/Client] WARNING: No token available!");
    }

    return config;
  });

  // 응답 인터셉터: 401/429 처리
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as
        | ExtendedAxiosRequestConfig
        | undefined;

      if (!originalRequest) {
        return Promise.reject(error);
      }

      // 401 Unauthorized: 토큰 리프레시
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        // Mutex로 동시 리프레시 방지
        return refreshMutex.runExclusive(async () => {
          const newToken = await refreshToken();

          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken.accessToken}`;
            return client(originalRequest);
          }

          return Promise.reject(error);
        });
      }

      // 429 Too Many Requests: 모든 계정 순회하며 재시도
      if (error.response?.status === 429 && onRateLimited) {
        const retryCount = originalRequest._retryCount || 0;
        const maxRetries = getTotalAccounts ? await getTotalAccounts() : 1;

        console.log(
          `[Castor/Client] 429 Rate Limited! Retry ${retryCount + 1}/${maxRetries}`,
        );

        if (retryCount < maxRetries) {
          const rotated = await onRateLimited();

          if (rotated) {
            originalRequest._retryCount = retryCount + 1;

            console.log(`[Castor/Client] Rotated to next account, retrying...`);

            // 잠시 대기 후 재시도 (500ms)
            await new Promise((resolve) => setTimeout(resolve, 500));
            return client(originalRequest);
          }
        }

        console.log(
          `[Castor/Client] All ${maxRetries} accounts exhausted, giving up.`,
        );
      }

      return Promise.reject(error);
    },
  );

  return client;
}

/**
 * Antigravity API 클라이언트 생성
 * 429 발생 시 모든 등록된 계정을 순회하며 재시도
 */
export async function createAntigravityClient(
  context: import("vscode").ExtensionContext,
): Promise<AxiosInstance> {
  const { getActiveAccount, setActiveAccount, getAllAccounts } =
    await import("../auth/secretStorage.js");

  return createApiClient(
    "https://cloudcode-pa.googleapis.com",
    async () => {
      const account = await getActiveAccount(context);
      if (!account) return null;
      return {
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresAt: account.expiresAt || 0,
      };
    },
    async () => {
      // refreshAccessToken을 사용하여 토큰 리프레시
      const { refreshAccessToken } = await import("../auth/antigravity.js");
      const newAccessToken = await refreshAccessToken(context);
      if (newAccessToken) {
        // 리프레시 후 새 토큰 정보 반환
        const account = await getActiveAccount(context);
        if (account) {
          return {
            accessToken: account.accessToken,
            refreshToken: account.refreshToken,
            expiresAt: account.expiresAt || 0,
          };
        }
      }
      return null;
    },
    async () => {
      // 계정 로테이션: 다음 계정으로 전환
      const { accounts, activeIndex } = await getAllAccounts(context);
      if (accounts.length <= 1) return false;
      const nextIndex = (activeIndex + 1) % accounts.length;
      console.log(
        `[Castor/Client] Rotating account: ${activeIndex} -> ${nextIndex} (${accounts[nextIndex]?.email})`,
      );
      await setActiveAccount(context, nextIndex);
      return true;
    },
    async () => {
      // 전체 계정 수 반환
      const { accounts } = await getAllAccounts(context);
      return accounts.length;
    },
  );
}
