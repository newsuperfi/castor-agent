/**
 * Antigravity Cockpit 계정 Import
 * ~/.antigravity_cockpit/credentials.json에서 계정을 읽어 Castor에 등록
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import type { AccountInfo } from "./secretStorage.js";
import { addOrUpdateAccount } from "./secretStorage.js";

/** Cockpit credentials.json 구조 */
interface CockpitCredentials {
  accounts: Record<
    string,
    {
      email: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: string; // ISO date string
      projectId?: string;
    }
  >;
}

/** Cockpit credentials.json 경로 */
const COCKPIT_CREDENTIALS_PATH = path.join(
  os.homedir(),
  ".antigravity_cockpit",
  "credentials.json",
);

/**
 * Cockpit credentials.json 파일 읽기
 */
function readCockpitCredentials(): CockpitCredentials | null {
  try {
    if (!fs.existsSync(COCKPIT_CREDENTIALS_PATH)) {
      console.log("[Castor/CockpitImport] credentials.json not found");
      return null;
    }

    const content = fs.readFileSync(COCKPIT_CREDENTIALS_PATH, "utf-8");
    return JSON.parse(content) as CockpitCredentials;
  } catch (error) {
    console.error("[Castor/CockpitImport] Failed to read credentials:", error);
    return null;
  }
}

/**
 * Cockpit 계정을 Castor에 import
 * @returns import된 계정 수
 */
export async function importCockpitAccounts(
  context: vscode.ExtensionContext,
): Promise<number> {
  const credentials = readCockpitCredentials();

  if (!credentials || !credentials.accounts) {
    console.log("[Castor/CockpitImport] No Cockpit accounts found");
    return 0;
  }

  const accounts = Object.values(credentials.accounts);
  console.log(
    `[Castor/CockpitImport] Found ${accounts.length} Cockpit accounts`,
  );

  let importedCount = 0;

  for (const account of accounts) {
    try {
      const accountInfo: AccountInfo = {
        email: account.email,
        projectId: account.projectId || "",
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresAt: new Date(account.expiresAt).getTime(),
      };

      await addOrUpdateAccount(context, accountInfo);
      importedCount++;

      console.log(`[Castor/CockpitImport] Imported: ${account.email}`);
    } catch (error) {
      console.error(
        `[Castor/CockpitImport] Failed to import ${account.email}:`,
        error,
      );
    }
  }

  console.log(
    `[Castor/CockpitImport] Successfully imported ${importedCount} accounts`,
  );

  return importedCount;
}

/**
 * Cockpit 계정 사용 가능 여부 확인
 */
export function isCockpitAvailable(): boolean {
  return fs.existsSync(COCKPIT_CREDENTIALS_PATH);
}
