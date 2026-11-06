/**
 * ### explorerEn
 *
 * The Explorer: the sidebar, the file tab, and a file's git status.
 */
export const explorerEn = {

  // Explorer sidebar.
  "explorer.showHidden": "Show hidden files",
  "explorer.hideHidden": "Hide hidden files",
  "explorer.home": "Home",
  "explorer.up": "Up one folder",
  "explorer.folderPath": "Folder path",
  "explorer.openIn": "Open in {app}",
  "explorer.filter": "Filter this folder",
  "explorer.loadingFolder": "Loading folder…",
  "explorer.folderError": "Couldn't open this folder: {error}",
  "explorer.backHome": "Back to home",
  "explorer.emptyFolder": "This folder is empty.",
  "explorer.noMatch": "Nothing here matches.",
  "explorer.openFailed": "Couldn't open in {app}",

  // File tab.
  "explorer.file.openSessionFolder": "Open the session's folder in VS Code",
  "explorer.file.openThisFile": "Open this file in VS Code",
  "explorer.file.openInEditor": "Open in editor",
  "explorer.file.reload": "Reload file",
  "explorer.file.mediaError": "Couldn't open this file. It may be too large (over 50 MB), secret, or gone.",
  "explorer.file.show": "Show",
  "explorer.file.preview": "Preview",
  "explorer.file.source": "Source",
  "explorer.file.error": "Couldn't open this file: {error}",
  "explorer.file.loading": "Loading file…",
  "explorer.file.lines": "{count} lines",
  "explorer.file.truncated": "This file is larger than 1 MB. Showing the first 1 MB only.",
  "explorer.file.empty": "This file is empty.",

  // Why a path can't be shown or opened (the `code` of a refused /api/files request).
  "explorer.failure.secret-path": "{path} may contain secrets, so it isn't shown or opened here.",
  "explorer.failure.binary-file": "{path} looks like a binary file and can't be previewed.",
  "explorer.failure.file-too-large": "{path} is larger than 50 MB.",
  "explorer.failure.type-not-viewable": "{path} is not a file type the viewer can show.",
  "explorer.failure.path-missing": "{path} does not exist.",
  "explorer.failure.path-outside": "{path} is outside the folder being browsed.",
  "explorer.failure.not-a-file": "{path} is not a file.",
  "explorer.failure.not-a-folder": "{path} is not a folder.",
  "explorer.failure.folder-gone": "The folder being browsed no longer exists.",
  "explorer.failure.home-too-large": "The home folder is too large to list at once; browse it folder by folder.",

  // Git status of a file.
  "explorer.status.modified": "Modified",
  "explorer.status.added": "Added",
  "explorer.status.untracked": "Untracked",
  "explorer.status.deleted": "Deleted",
  "explorer.status.renamed": "Renamed",
  "explorer.status.copied": "Copied",
  "explorer.status.conflicted": "Conflicted",
  "explorer.status.other": "Status {code}",
} as const;

/**
 * ### explorerKo
 *
 * Korean for {@link explorerEn}.
 */
export const explorerKo: Record<keyof typeof explorerEn, string> = {

  // Explorer sidebar.
  "explorer.showHidden": "숨김 파일 보기",
  "explorer.hideHidden": "숨김 파일 숨기기",
  "explorer.home": "홈",
  "explorer.up": "상위 폴더로",
  "explorer.folderPath": "폴더 경로",
  "explorer.openIn": "{app}에서 열기",
  "explorer.filter": "이 폴더에서 필터",
  "explorer.loadingFolder": "폴더를 불러오는 중…",
  "explorer.folderError": "이 폴더를 열 수 없습니다: {error}",
  "explorer.backHome": "홈으로 돌아가기",
  "explorer.emptyFolder": "이 폴더는 비어 있습니다.",
  "explorer.noMatch": "일치하는 항목이 없습니다.",
  "explorer.openFailed": "{app}에서 열 수 없습니다",

  // File tab.
  "explorer.file.openSessionFolder": "세션 폴더를 VS Code에서 열기",
  "explorer.file.openThisFile": "이 파일을 VS Code에서 열기",
  "explorer.file.openInEditor": "편집기에서 열기",
  "explorer.file.reload": "파일 새로고침",
  "explorer.file.mediaError": "이 파일을 열 수 없습니다. 너무 크거나(50MB 초과) 비밀 파일이거나 사라졌을 수 있습니다.",
  "explorer.file.show": "보기",
  "explorer.file.preview": "미리보기",
  "explorer.file.source": "소스",
  "explorer.file.error": "이 파일을 열 수 없습니다: {error}",
  "explorer.file.loading": "파일을 불러오는 중…",
  "explorer.file.lines": "{count}줄",
  "explorer.file.truncated": "이 파일은 1MB보다 큽니다. 처음 1MB만 표시합니다.",
  "explorer.file.empty": "이 파일은 비어 있습니다.",

  // Why a path can't be shown or opened (the `code` of a refused /api/files request).
  "explorer.failure.secret-path": "{path}에는 비밀 정보가 있을 수 있어 여기서 보여 주거나 열지 않습니다.",
  "explorer.failure.binary-file": "{path}은(는) 바이너리 파일로 보여 미리 볼 수 없습니다.",
  "explorer.failure.file-too-large": "{path}은(는) 50MB보다 큽니다.",
  "explorer.failure.type-not-viewable": "{path}은(는) 뷰어가 보여 줄 수 있는 파일 형식이 아닙니다.",
  "explorer.failure.path-missing": "{path}이(가) 없습니다.",
  "explorer.failure.path-outside": "{path}은(는) 탐색 중인 폴더 밖에 있습니다.",
  "explorer.failure.not-a-file": "{path}은(는) 파일이 아닙니다.",
  "explorer.failure.not-a-folder": "{path}은(는) 폴더가 아닙니다.",
  "explorer.failure.folder-gone": "탐색 중인 폴더가 더 이상 없습니다.",
  "explorer.failure.home-too-large": "홈 폴더는 한 번에 나열하기에 너무 큽니다. 폴더별로 살펴보세요.",

  // Git status of a file.
  "explorer.status.modified": "수정됨",
  "explorer.status.added": "추가됨",
  "explorer.status.untracked": "추적 안 됨",
  "explorer.status.deleted": "삭제됨",
  "explorer.status.renamed": "이름 바뀜",
  "explorer.status.copied": "복사됨",
  "explorer.status.conflicted": "충돌",
  "explorer.status.other": "상태 {code}",
};
