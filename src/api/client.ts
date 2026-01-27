import { Mutex } from "async-mutex";
import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from "axios";
import type { AuthToken } from "../types.js";

interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

/**
 * API 클라이언트 생성기
 * 401 자동 리프레시 및 동시성 제어 포함
 */
export function createApiClient(
  baseURL: string,
  getToken: () => Promise<AuthToken | null>,
  refreshToken: () => Promise<AuthToken | null>,
  onRateLimited?: () => Promise<boolean>,
): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  const refreshMutex = new Mutex();

  // 요청 인터셉터: 토큰 주입
  client.interceptors.request.use(async (config) => {
    const token = await getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token.accessToken}`;
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

      // 429 Too Many Requests: 계정 로테이션
      if (error.response?.status === 429 && onRateLimited) {
        const rotated = await onRateLimited();

        if (rotated && !originalRequest._retry) {
          originalRequest._retry = true;

          // 잠시 대기 후 재시도
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return client(originalRequest);
        }
      }

      return Promise.reject(error);
    },
  );

  return client;
}
