import * as vscode from "vscode";
import type { AuthToken } from "../types.js";

const KEY_PREFIX = "castor.auth";

// Antigravity 다중 계정 키
const ANTIGRAVITY_ACCOUNTS_KEY = "antigravity_accounts";
const ANTIGRAVITY_ACTIVE_ACCOUNT_KEY = "antigravity_active_account";

// 계정 정보 인터페이스
interface AccountInfo {
  email: string;
  projectId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AccountsData {
  accounts: AccountInfo[];
  activeIndex: number;
}

/**
 * VS Code SecretStorage 래퍼
 * 토큰을 OS 키체인에 안전하게 저장
 */
export class SecretStorage {
  constructor(private secrets: vscode.SecretStorage) {}

  /**
   * 토큰 저장
   */
  async storeToken(
    providerId: string,
    accountIndex: number,
    token: AuthToken,
  ): Promise<void> {
    const key = this.buildKey(providerId, accountIndex);
    await this.secrets.store(key, JSON.stringify(token));
  }

  /**
   * 토큰 조회
   */
  async getToken(
    providerId: string,
    accountIndex: number,
  ): Promise<AuthToken | null> {
    const key = this.buildKey(providerId, accountIndex);
    const data = await this.secrets.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as AuthToken;
    } catch {
      return null;
    }
  }

  /**
   * 토큰 삭제
   */
  async deleteToken(providerId: string, accountIndex: number): Promise<void> {
    const key = this.buildKey(providerId, accountIndex);
    await this.secrets.delete(key);
  }

  /**
   * 특정 제공자의 모든 토큰 조회
   */
  async getAllTokens(
    providerId: string,
  ): Promise<Array<{ index: number; token: AuthToken }>> {
    const tokens: Array<{ index: number; token: AuthToken }> = [];

    // 최대 10개 계정 지원
    for (let i = 0; i < 10; i++) {
      const token = await this.getToken(providerId, i);
      if (token) {
        tokens.push({ index: i, token });
      }
    }

    return tokens;
  }

  /**
   * 토큰 만료 여부 확인
   */
  isTokenExpired(token: AuthToken): boolean {
    // 5분 버퍼
    const buffer = 5 * 60 * 1000;
    return Date.now() >= token.expiresAt - buffer;
  }

  /**
   * 키 생성
   */
  private buildKey(providerId: string, accountIndex: number): string {
    return `${KEY_PREFIX}.${providerId}.${accountIndex}`;
  }
}

// ===== Antigravity 다중 계정 관리 함수 =====

/**
 * 전체 계정 데이터 조회
 */
async function getAccountsData(
  context: vscode.ExtensionContext,
): Promise<AccountsData> {
  const data = await context.secrets.get(ANTIGRAVITY_ACCOUNTS_KEY);
  if (!data) {
    return { accounts: [], activeIndex: -1 };
  }
  try {
    return JSON.parse(data) as AccountsData;
  } catch {
    return { accounts: [], activeIndex: -1 };
  }
}

/**
 * 전체 계정 데이터 저장
 */
async function saveAccountsData(
  context: vscode.ExtensionContext,
  data: AccountsData,
): Promise<void> {
  await context.secrets.store(ANTIGRAVITY_ACCOUNTS_KEY, JSON.stringify(data));
}

/**
 * 새 계정 추가 또는 기존 계정 업데이트
 * 반환: 계정 인덱스
 */
export async function addOrUpdateAccount(
  context: vscode.ExtensionContext,
  account: AccountInfo,
): Promise<number> {
  const data = await getAccountsData(context);

  // 이메일로 기존 계정 찾기
  const existingIndex = data.accounts.findIndex(
    (a) => a.email === account.email,
  );

  if (existingIndex >= 0) {
    // 기존 계정 업데이트
    data.accounts[existingIndex] = account;
    data.activeIndex = existingIndex;
  } else {
    // 새 계정 추가
    data.accounts.push(account);
    data.activeIndex = data.accounts.length - 1;
  }

  await saveAccountsData(context, data);
  return data.activeIndex;
}

/**
 * 활성 계정 인덱스 변경
 */
export async function setActiveAccount(
  context: vscode.ExtensionContext,
  index: number,
): Promise<boolean> {
  const data = await getAccountsData(context);
  if (index < 0 || index >= data.accounts.length) {
    return false;
  }
  data.activeIndex = index;
  await saveAccountsData(context, data);
  return true;
}

/**
 * 활성 계정 조회
 */
export async function getActiveAccount(
  context: vscode.ExtensionContext,
): Promise<AccountInfo | null> {
  const data = await getAccountsData(context);
  if (data.activeIndex < 0 || data.activeIndex >= data.accounts.length) {
    return null;
  }
  return data.accounts[data.activeIndex];
}

/**
 * 모든 계정 목록 조회
 */
export async function getAllAccounts(
  context: vscode.ExtensionContext,
): Promise<{ accounts: AccountInfo[]; activeIndex: number }> {
  return getAccountsData(context);
}

/**
 * 계정 삭제
 */
export async function removeAccount(
  context: vscode.ExtensionContext,
  index: number,
): Promise<void> {
  const data = await getAccountsData(context);
  if (index < 0 || index >= data.accounts.length) {
    return;
  }

  data.accounts.splice(index, 1);

  // activeIndex 조정
  if (data.accounts.length === 0) {
    data.activeIndex = -1;
  } else if (data.activeIndex >= data.accounts.length) {
    data.activeIndex = data.accounts.length - 1;
  } else if (data.activeIndex > index) {
    data.activeIndex--;
  }

  await saveAccountsData(context, data);
}

/**
 * 활성 계정의 Access Token 조회
 */
export async function getAccessToken(
  context: vscode.ExtensionContext,
): Promise<string | null> {
  const account = await getActiveAccount(context);
  return account?.accessToken || null;
}

/**
 * 활성 계정의 Access Token 업데이트
 */
export async function updateAccessToken(
  context: vscode.ExtensionContext,
  newToken: string,
  expiresAt: number,
): Promise<void> {
  const data = await getAccountsData(context);
  if (data.activeIndex >= 0 && data.activeIndex < data.accounts.length) {
    data.accounts[data.activeIndex].accessToken = newToken;
    data.accounts[data.activeIndex].expiresAt = expiresAt;
    await saveAccountsData(context, data);
  }
}

/**
 * 활성 계정의 Refresh Token 조회
 */
export async function getRefreshToken(
  context: vscode.ExtensionContext,
): Promise<string | null> {
  const account = await getActiveAccount(context);
  return account?.refreshToken || null;
}

/**
 * 모든 계정 삭제
 */
export async function clearAllAccounts(
  context: vscode.ExtensionContext,
): Promise<void> {
  await context.secrets.delete(ANTIGRAVITY_ACCOUNTS_KEY);
}

/**
 * 활성 계정의 projectId 업데이트
 */
export async function updateAccountProjectId(
  context: vscode.ExtensionContext,
  projectId: string,
): Promise<void> {
  const data = await getAccountsData(context);
  if (data.activeIndex < 0 || data.activeIndex >= data.accounts.length) {
    return;
  }
  data.accounts[data.activeIndex].projectId = projectId;
  await saveAccountsData(context, data);
  console.log(
    `[Castor/SecretStorage] Updated projectId for account ${data.accounts[data.activeIndex].email}: ${projectId}`,
  );
}

// 타입 내보내기
export type { AccountInfo, AccountsData };
