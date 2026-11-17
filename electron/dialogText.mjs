// The desktop app's own dialogs (quitting, a server that stopped or could not
// start), in the language the UI is set to.

/**
 * ### LOCALE_STORAGE_KEY
 *
 * Where the page keeps the chosen UI language in its localStorage; the same
 * key as `LOCALE_KEY` in src/ui/i18n/useT.ts.
 */
export const LOCALE_STORAGE_KEY = "mothership.locale";

/**
 * ### dialogLanguage
 *
 * The language for a dialog: the one chosen in the app when the window can
 * say, else the system's (Korean for any `ko` locale), else English.
 *
 * @param {unknown} saved - What the page stored under {@link LOCALE_STORAGE_KEY}, if it was read.
 * @param {string} systemLocale - Electron's `app.getLocale()`, e.g. `ko-KR`.
 * @returns {"en" | "ko"}
 */
export function dialogLanguage(saved, systemLocale) {
  if (saved === "en" || saved === "ko") return saved;
  return systemLocale.toLowerCase().startsWith("ko") ? "ko" : "en";
}

const TEXT = {
  en: {
    working: (count) => `${count} ${count === 1 ? "session is" : "sessions are"} working. Quit anyway?`,
    workingDetail: "They stop mid-turn and show as stopped by the restart; Continue picks them up when you open mothership again.",
    quitAnyway: "Quit Anyway",
    cancel: "Cancel",
    serverStopped: "mothership's server stopped",
    exitedWith: (code, logFile) => `It exited with code ${code}. Details are in ${logFile}.`,
    restart: "Restart",
    quit: "Quit",
    couldNotStart: "mothership could not start",
    couldNotRestart: "mothership could not restart",
    exitedWhileStarting: (logFile) => `The server exited while starting. Details are in ${logFile}.`,
    startTimedOut: (logFile) => `The server did not start within a minute. Details are in ${logFile}.`,
  },
  ko: {
    working: (count) => `세션 ${count}개가 작업 중입니다. 그래도 종료할까요?`,
    workingDetail: "작업 도중에 멈추고 재시작으로 중지됨으로 표시됩니다. mothership을 다시 열면 계속하기로 이어서 진행할 수 있습니다.",
    quitAnyway: "그래도 종료",
    cancel: "취소",
    serverStopped: "mothership 서버가 멈췄습니다",
    exitedWith: (code, logFile) => `종료 코드 ${code}로 끝났습니다. 자세한 내용은 ${logFile}에 있습니다.`,
    restart: "다시 시작",
    quit: "종료",
    couldNotStart: "mothership을 시작하지 못했습니다",
    couldNotRestart: "mothership을 다시 시작하지 못했습니다",
    exitedWhileStarting: (logFile) => `서버가 시작하는 도중에 종료되었습니다. 자세한 내용은 ${logFile}에 있습니다.`,
    startTimedOut: (logFile) => `서버가 1분 안에 시작하지 않았습니다. 자세한 내용은 ${logFile}에 있습니다.`,
  },
};

/**
 * ### dialogText
 *
 * Every dialog's words in `language`; messages that carry values are
 * functions of them.
 *
 * @param {"en" | "ko"} language
 */
export function dialogText(language) {
  return TEXT[language];
}
