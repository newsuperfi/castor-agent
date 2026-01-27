// 다국어 지원 (i18n)

export type Locale = "ko" | "en";

interface Translations {
  // 공통
  appName: string;
  login: string;
  logout: string;
  send: string;
  cancel: string;
  confirm: string;
  settings: string;

  // 로그인 화면
  welcomeTitle: string;
  welcomeDescription: string;
  loginWithAntigravity: string;
  devMode: string;

  // 채팅
  emptyChat: string;
  emptyChatHint: string;
  inputPlaceholder: string;
  thinking: string;
  showThinking: string;

  // 모델 선택
  modelSelector: string;
  thinkingLevel: string;
  thinkingHigh: string;
  thinkingLow: string;
  thinkingMinimal: string;

  // 리소스 모니터
  tokens: string;

  // 메시지
  systemLabel: string;
  assistantLabel: string;

  // 설정
  account: string;
  language: string;
  about: string;
  loggedInAs: string;
  notLoggedIn: string;

  // 에러
  loginFailed: string;
  connectionError: string;
}

const ko: Translations = {
  appName: "Castor Agent",
  login: "로그인",
  logout: "로그아웃",
  send: "전송",
  cancel: "취소",
  confirm: "확인",
  settings: "설정",

  welcomeTitle: "Castor Agent",
  welcomeDescription: "무한 코딩 에이전트에 오신 걸 환영합니다!",
  loginWithAntigravity: "Antigravity 로그인",
  devMode: "개발자 모드 (로그인 우회)",

  emptyChat: "안녕! 무엇을 도와줄까요?",
  emptyChatHint: "코드 작성, 파일 수정, 터미널 명령 등 뭐든 물어보세요!",
  inputPlaceholder: "메시지를 입력하세요... (Shift+Enter로 줄바꿈)",
  thinking: "생각 중...",
  showThinking: "사고 과정 보기",

  modelSelector: "모델 선택",
  thinkingLevel: "사고 레벨",
  thinkingHigh: "깊은 사고",
  thinkingLow: "빠른 사고",
  thinkingMinimal: "최소 사고",

  tokens: "tokens",

  systemLabel: "시스템",
  assistantLabel: "Castor",

  account: "계정",
  language: "언어",
  about: "정보",
  loggedInAs: "로그인됨",
  notLoggedIn: "로그인되지 않음",

  loginFailed: "로그인에 실패했습니다",
  connectionError: "연결 오류가 발생했습니다",
};

const en: Translations = {
  appName: "Castor Agent",
  login: "Login",
  logout: "Logout",
  send: "Send",
  cancel: "Cancel",
  confirm: "Confirm",
  settings: "Settings",

  welcomeTitle: "Castor Agent",
  welcomeDescription: "Welcome to the infinite coding agent!",
  loginWithAntigravity: "Login with Antigravity",
  devMode: "Dev Mode (Skip Login)",

  emptyChat: "Hi! How can I help you?",
  emptyChatHint:
    "Ask me about coding, file editing, terminal commands, anything!",
  inputPlaceholder: "Type a message... (Shift+Enter for newline)",
  thinking: "Thinking...",
  showThinking: "Show thinking process",

  modelSelector: "Select Model",
  thinkingLevel: "Thinking Level",
  thinkingHigh: "Deep Thinking",
  thinkingLow: "Fast Thinking",
  thinkingMinimal: "Minimal Thinking",

  tokens: "tokens",

  systemLabel: "System",
  assistantLabel: "Castor",

  account: "Account",
  language: "Language",
  about: "About",
  loggedInAs: "Logged in as",
  notLoggedIn: "Not logged in",

  loginFailed: "Login failed",
  connectionError: "Connection error occurred",
};

const translations: Record<Locale, Translations> = { ko, en };

let currentLocale: Locale = "ko";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: keyof Translations): string {
  return translations[currentLocale][key];
}

export function useTranslations() {
  return {
    t,
    locale: currentLocale,
    setLocale,
  };
}
