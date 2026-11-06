/**
 * ### feedbackEn
 *
 * Developer mode: in-app feedback and the debug panel.
 */
export const feedbackEn = {
  // Feedback.
  "feedback.pickHint": "Click the part you want changed · Esc for the whole screen",
  "feedback.capturing": "Taking a screenshot…",
  "feedback.title": "Feedback",
  "feedback.intro": "A session will change mothership's code in its own worktree. Review its changes and merge them when they look right.",
  "feedback.placeholder": "What should change? e.g. Make the reply box taller and keep it open after sending.",
  "feedback.wholeScreen": "The whole screen",
  "feedback.screenshotAlt": "Screenshot that will be attached",
  "feedback.attached.one": "{count} recent page error and the server log will be attached.",
  "feedback.attached.other": "{count} recent page errors and the server log will be attached.",
  "feedback.starting": "Starting…",
  "feedback.start": "Start session",
  "feedback.error.developer-off": "Developer mode is off. Turn it on in Settings → Advanced.",
  "feedback.error.no-source-folder": "Choose mothership's source folder in Settings → Advanced.",
  // Debug panel.
  "debug.title": "Debug",
  "debug.intro": "Developer mode. Feedback ({keys}) starts a session that changes mothership's own code.",
  "debug.giveFeedback": "Give feedback",
  "debug.app": "App",
  "debug.runningAs": "Running as",
  "debug.desktopApp": "Desktop app",
  "debug.devCheckout": "pnpm dev (checkout)",
  "debug.dataFolder": "Data folder",
  "debug.sourceFolder": "Source folder",
  "debug.sourceNotSet": "Not set (Settings → Advanced)",
  "debug.branch": "Branch",
  "debug.commit": "Commit",
  "debug.uncommitted": "Uncommitted",
  "debug.files": "{count} files",
  "debug.toolCalls": "Work-tool calls, last 10 minutes",
  "debug.none": "None.",
  "debug.calls": "{count} calls",
  "debug.rateLimited": " · {count} rate limited",
  "debug.heldBack": " · {count} held back",
  "debug.toolCallsNote": "Agents' own tool calls are not counted here. The server log has a line for each minute.",
  "debug.feedbackSessions": "Feedback sessions",
  "debug.noneYet": "None yet.",
  "debug.pageErrors": "Page errors",
  "debug.noPageErrors": "None since this page loaded.",
  "debug.serverLog": "Server log",
} as const;

/**
 * ### feedbackKo
 *
 * Korean for {@link feedbackEn}.
 */
export const feedbackKo: Record<keyof typeof feedbackEn, string> = {
  // Feedback.
  "feedback.pickHint": "바꾸고 싶은 부분을 클릭하세요 · 화면 전체는 Esc",
  "feedback.capturing": "스크린샷을 찍는 중…",
  "feedback.title": "피드백",
  "feedback.intro": "세션이 자체 워크트리에서 mothership 코드를 수정합니다. 변경 사항을 리뷰하고 괜찮으면 병합하세요.",
  "feedback.placeholder": "무엇을 바꿀까요? 예: 답장 입력창을 더 높게 하고 보낸 뒤에도 열어 두기.",
  "feedback.wholeScreen": "화면 전체",
  "feedback.screenshotAlt": "첨부될 스크린샷",
  "feedback.attached.one": "최근 페이지 오류 {count}개와 서버 로그가 첨부됩니다.",
  "feedback.attached.other": "최근 페이지 오류 {count}개와 서버 로그가 첨부됩니다.",
  "feedback.starting": "시작하는 중…",
  "feedback.start": "세션 시작",
  "feedback.error.developer-off": "개발자 모드가 꺼져 있습니다. 설정 → 고급에서 켜세요.",
  "feedback.error.no-source-folder": "설정 → 고급에서 mothership의 소스 폴더를 고르세요.",
  // Debug panel.
  "debug.title": "디버그",
  "debug.intro": "개발자 모드입니다. 피드백({keys})은 mothership 자체 코드를 수정하는 세션을 시작합니다.",
  "debug.giveFeedback": "피드백 보내기",
  "debug.app": "앱",
  "debug.runningAs": "실행 방식",
  "debug.desktopApp": "데스크톱 앱",
  "debug.devCheckout": "pnpm dev (체크아웃)",
  "debug.dataFolder": "데이터 폴더",
  "debug.sourceFolder": "소스 폴더",
  "debug.sourceNotSet": "설정 안 됨 (설정 → 고급)",
  "debug.branch": "브랜치",
  "debug.commit": "커밋",
  "debug.uncommitted": "커밋 안 된 변경",
  "debug.files": "파일 {count}개",
  "debug.toolCalls": "업무 도구 호출, 최근 10분",
  "debug.none": "없음.",
  "debug.calls": "{count}회 호출",
  "debug.rateLimited": " · {count}회 속도 제한",
  "debug.heldBack": " · {count}회 보류",
  "debug.toolCallsNote": "에이전트 자체의 도구 호출은 여기서 세지 않습니다. 서버 로그에 1분마다 한 줄씩 남습니다.",
  "debug.feedbackSessions": "피드백 세션",
  "debug.noneYet": "아직 없습니다.",
  "debug.pageErrors": "페이지 오류",
  "debug.noPageErrors": "이 페이지를 연 뒤로 없습니다.",
  "debug.serverLog": "서버 로그",
};
