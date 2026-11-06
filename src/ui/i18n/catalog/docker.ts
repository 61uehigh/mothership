/**
 * ### dockerEn
 *
 * Docker: the sidebar, container actions, the container tab, and its logs.
 */
export const dockerEn = {

  // Docker sidebar.
  "docker.loading": "Loading containers…",
  "docker.empty": "No containers. Containers you create with Docker or Docker Compose show up here.",
  "docker.standalone": "Standalone",
  "docker.stopConfirmShort": "Stop?",
  "docker.working": "Working",
  "docker.actionNamed": "{action} {name}",
  "docker.failure.missing": "The Docker CLI is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop, then refresh.",
  "docker.failure.daemon": "The Docker daemon is not running. Start Docker Desktop, then refresh.",

  // Container actions and states.
  "docker.action.start": "Start",
  "docker.action.stop": "Stop",
  "docker.action.restart": "Restart",
  "docker.state.created": "created",
  "docker.state.running": "running",
  "docker.state.paused": "paused",
  "docker.state.restarting": "restarting",
  "docker.state.removing": "removing",
  "docker.state.exited": "exited",
  "docker.state.dead": "dead",
  "docker.health.healthy": "healthy",
  "docker.health.unhealthy": "unhealthy",
  "docker.health.starting": "starting",

  // Container tab.
  "docker.gone": "The container {name} no longer exists.",
  "docker.loadingNamed": "Loading {name}…",
  "docker.upFor": "Up for {duration}",
  "docker.neverStarted": "Never started",
  "docker.exitedWith": "Exited with code {code} {when}",
  "docker.stopConfirm": "Stop this container?",
  "docker.restarted": "restarted {count}×",
  "docker.readOnly": ", read-only",
  "docker.info.ports": "Ports",
  "docker.info.mounts": "Mounts",
  "docker.info.networks": "Networks",
  "docker.info.environment": "Environment",
  "docker.info.command": "Command",
  "docker.none": "None",

  // Container logs.
  "docker.logs.title": "Logs",
  "docker.logs.loading": "Loading logs…",
  "docker.logs.empty": "No log output.",
  "docker.logs.follow": "Follow",
  "docker.logs.linesLabel": "Lines to show",
  "docker.logs.last": "Last {count} lines",
  "docker.logs.refresh": "Refresh logs",
} as const;

/**
 * ### dockerKo
 *
 * Korean for {@link dockerEn}.
 */
export const dockerKo: Record<keyof typeof dockerEn, string> = {

  // Docker sidebar.
  "docker.loading": "컨테이너를 불러오는 중…",
  "docker.empty": "컨테이너가 없습니다. Docker나 Docker Compose로 만든 컨테이너가 여기에 표시됩니다.",
  "docker.standalone": "단독",
  "docker.stopConfirmShort": "중지?",
  "docker.working": "작업 중",
  "docker.actionNamed": "{name} {action}",
  "docker.failure.missing": "Docker CLI가 설치되어 있지 않습니다. https://www.docker.com/products/docker-desktop 에서 Docker Desktop을 설치한 뒤 새로고침하세요.",
  "docker.failure.daemon": "Docker 데몬이 실행 중이 아닙니다. Docker Desktop을 시작한 뒤 새로고침하세요.",

  // Container actions and states.
  "docker.action.start": "시작",
  "docker.action.stop": "중지",
  "docker.action.restart": "재시작",
  "docker.state.created": "생성됨",
  "docker.state.running": "실행 중",
  "docker.state.paused": "일시 중지됨",
  "docker.state.restarting": "재시작 중",
  "docker.state.removing": "제거 중",
  "docker.state.exited": "종료됨",
  "docker.state.dead": "중단됨",
  "docker.health.healthy": "정상",
  "docker.health.unhealthy": "비정상",
  "docker.health.starting": "시작 중",

  // Container tab.
  "docker.gone": "{name} 컨테이너는 더 이상 없습니다.",
  "docker.loadingNamed": "{name} 불러오는 중…",
  "docker.upFor": "{duration}째 실행 중",
  "docker.neverStarted": "시작한 적 없음",
  "docker.exitedWith": "{when} 코드 {code}로 종료됨",
  "docker.stopConfirm": "이 컨테이너를 중지할까요?",
  "docker.restarted": "{count}회 재시작됨",
  "docker.readOnly": ", 읽기 전용",
  "docker.info.ports": "포트",
  "docker.info.mounts": "마운트",
  "docker.info.networks": "네트워크",
  "docker.info.environment": "환경 변수",
  "docker.info.command": "명령",
  "docker.none": "없음",

  // Container logs.
  "docker.logs.title": "로그",
  "docker.logs.loading": "로그를 불러오는 중…",
  "docker.logs.empty": "로그 출력이 없습니다.",
  "docker.logs.follow": "따라가기",
  "docker.logs.linesLabel": "표시할 줄 수",
  "docker.logs.last": "마지막 {count}줄",
  "docker.logs.refresh": "로그 새로고침",
};
