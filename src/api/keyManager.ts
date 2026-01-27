import * as vscode from "vscode";
import type { KeyState, KeyStatus } from "../types.js";

const STORAGE_KEY = "castor.keyManager.state";

/**
 * 원형 큐 기반 키 로테이션 매니저
 * 429 응답 시 자동으로 다음 계정으로 전환
 */
export class KeyRotationManager {
  private keys: KeyState[] = [];
  private currentIndex = 0;
  private globalState: vscode.Memento;

  constructor(globalState: vscode.Memento) {
    this.globalState = globalState;
    this.loadState();
  }

  /**
   * 새 키 등록
   */
  registerKey(id: string): void {
    const existingIndex = this.keys.findIndex((k) => k.id === id);

    if (existingIndex === -1) {
      this.keys.push({
        id,
        status: "active",
        lastUsed: 0,
        errorCount: 0,
      });
      this.saveState();
    }
  }

  /**
   * 키 제거
   */
  removeKey(id: string): void {
    const index = this.keys.findIndex((k) => k.id === id);

    if (index !== -1) {
      this.keys.splice(index, 1);

      if (this.currentIndex >= this.keys.length) {
        this.currentIndex = 0;
      }

      this.saveState();
    }
  }

  /**
   * 현재 활성 키 조회 (Load Balancing)
   */
  getCurrentKey(): KeyState | null {
    const activeKeys = this.keys.filter((k) => k.status === "active");

    if (activeKeys.length === 0) {
      // Cooldown 중인 키 중 가장 오래된 것 확인
      const cooldownKeys = this.keys.filter((k) => k.status === "cooldown");

      if (cooldownKeys.length > 0) {
        // 가장 오래 기다린 키 선택
        const oldest = cooldownKeys.reduce((a, b) =>
          (a.retryAfter || 0) < (b.retryAfter || 0) ? a : b,
        );

        // 쿨다운 만료 확인
        if (oldest.retryAfter && Date.now() >= oldest.retryAfter) {
          oldest.status = "active";
          this.saveState();
          return oldest;
        }
      }

      return null;
    }

    // 가장 오래 안 쓴 키 선택
    const selected = activeKeys.reduce((a, b) =>
      a.lastUsed < b.lastUsed ? a : b,
    );

    return selected;
  }

  /**
   * 키 사용 기록
   */
  markKeyUsed(id: string): void {
    const key = this.keys.find((k) => k.id === id);

    if (key) {
      key.lastUsed = Date.now();
      key.errorCount = 0;
      this.saveState();
    }
  }

  /**
   * 429 에러 처리 - 다음 키로 로테이션
   */
  handleRateLimited(id: string, retryAfterMs?: number): boolean {
    const key = this.keys.find((k) => k.id === id);

    if (key) {
      key.status = "cooldown";
      key.errorCount += 1;
      key.retryAfter = Date.now() + (retryAfterMs || 60000); // 기본 1분
      this.saveState();
    }

    // 다음 활성 키 존재 여부 반환
    return this.keys.some((k) => k.status === "active");
  }

  /**
   * 키 상태 강제 변경
   */
  setKeyStatus(id: string, status: KeyStatus): void {
    const key = this.keys.find((k) => k.id === id);

    if (key) {
      key.status = status;

      if (status === "active") {
        key.errorCount = 0;
        key.retryAfter = undefined;
      }

      this.saveState();
    }
  }

  /**
   * 모든 키 상태 조회
   */
  getAllKeys(): KeyState[] {
    return [...this.keys];
  }

  /**
   * 활성 키 개수
   */
  getActiveKeyCount(): number {
    return this.keys.filter((k) => k.status === "active").length;
  }

  /**
   * 쿨다운 만료된 키 복구
   */
  recoverCooldownKeys(): number {
    const now = Date.now();
    let recovered = 0;

    for (const key of this.keys) {
      if (
        key.status === "cooldown" &&
        key.retryAfter &&
        now >= key.retryAfter
      ) {
        key.status = "active";
        key.retryAfter = undefined;
        recovered++;
      }
    }

    if (recovered > 0) {
      this.saveState();
    }

    return recovered;
  }

  /**
   * 상태 영속화
   */
  private saveState(): void {
    this.globalState.update(STORAGE_KEY, {
      keys: this.keys,
      currentIndex: this.currentIndex,
    });
  }

  /**
   * 상태 복원
   */
  private loadState(): void {
    const stored = this.globalState.get<{
      keys: KeyState[];
      currentIndex: number;
    }>(STORAGE_KEY);

    if (stored) {
      this.keys = stored.keys;
      this.currentIndex = stored.currentIndex;

      // 쿨다운 만료 확인
      this.recoverCooldownKeys();
    }
  }
}
