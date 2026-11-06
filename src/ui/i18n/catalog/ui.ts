/**
 * ### uiEn
 *
 * Shared UI: generic controls (Cancel, Retry, Copy, …), the Claude login
 * note, and the screen shown when the app frame fails to render.
 */
export const uiEn = {
  // Shared controls.
  "ui.retry": "Retry",
  "ui.requestFailed": "Request failed ({status})",
  "ui.networkFailed": "Couldn't reach mothership's server",
  "ui.refresh": "Refresh",
  "ui.copy": "Copy",
  "ui.copied": "Copied",
  "ui.copyWhat": "Copy {what}",
  "ui.copyFailed": "Couldn't copy to the clipboard",
  "ui.chooseFolder": "Choose folder",
  "ui.dismiss": "Dismiss",
  "ui.details": "Details",
  "ui.error": "error",
  "ui.loading": "Loading…",
  "ui.cancel": "Cancel",
  // Claude login note.
  "shellNote.claudeLogin": "Log in to Claude",
  "shellNote.claudeLoginFinish": "Finish in the Terminal window, then try again.",
  // The app frame failing to render.
  "app.error.title": "Something went wrong",
  "app.error.body": "mothership hit an error while drawing the window. Try again, or reset the layout (open tabs and sidebar arrangement) if it keeps happening.",
  "app.error.retry": "Try again",
  "app.error.reset": "Reset layout and reload",
} as const;

/**
 * ### uiKo
 *
 * Korean for {@link uiEn}.
 */
export const uiKo: Record<keyof typeof uiEn, string> = {
  // Shared controls.
  "ui.retry": "다시 시도",
  "ui.requestFailed": "요청이 실패했습니다({status})",
  "ui.networkFailed": "mothership 서버에 연결하지 못했습니다",
  "ui.refresh": "새로고침",
  "ui.copy": "복사",
  "ui.copied": "복사됨",
  "ui.copyWhat": "{what} 복사",
  "ui.copyFailed": "클립보드에 복사하지 못했습니다",
  "ui.chooseFolder": "폴더 선택",
  "ui.dismiss": "닫기",
  "ui.details": "세부 정보",
  "ui.error": "오류",
  "ui.loading": "불러오는 중…",
  "ui.cancel": "취소",
  // Claude login note.
  "shellNote.claudeLogin": "Claude에 로그인",
  "shellNote.claudeLoginFinish": "터미널 창에서 로그인을 마친 뒤 다시 시도하세요.",
  // The app frame failing to render.
  "app.error.title": "문제가 발생했습니다",
  "app.error.body": "mothership이 창을 그리다 오류가 났습니다. 다시 시도하거나, 계속 반복되면 레이아웃(열린 탭과 사이드바 배치)을 초기화하세요.",
  "app.error.retry": "다시 시도",
  "app.error.reset": "레이아웃 초기화 후 새로고침",
};
