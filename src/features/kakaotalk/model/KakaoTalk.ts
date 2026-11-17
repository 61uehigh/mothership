// KakaoTalk data shared by the server (features/kakaotalk/server) and the UI.

/**
 * ### MEMO_MAX_CHARS
 *
 * The longest note you can send to yourself at once. Kakao takes 200
 * characters per message, so a longer note goes out as several messages.
 */
export const MEMO_MAX_CHARS = 2000;

/**
 * ### SentMemo
 *
 * A note you sent to your own KakaoTalk chat ("나와의 채팅") from mothership.
 */
export type SentMemo = {
  id: string;
  text: string;
  /** ISO 8601 time it was sent. */
  sentAt: string;
};

/**
 * ### KakaoStatus
 *
 * What the KakaoTalk section and its Settings card show. Holds no secret values.
 */
export type KakaoStatus = {
  /** The computer the server runs on; reading chats works only on `mac`. */
  platform: "mac" | "windows" | "other";
  memo: {
    /** Whether `KAKAO_REST_API_KEY` is set. */
    keySet: boolean;
    /** Whether `KAKAO_CLIENT_SECRET` is set (needed only when the Kakao app turns client secrets on). */
    secretSet: boolean;
    /** Whether you have signed in with Kakao and the sign-in has not expired. */
    connected: boolean;
  };
  /** Your most recent notes, newest first. */
  sent: Array<SentMemo>;
};

/**
 * ### KakaoChat
 *
 * One chat room as the KakaoTalk app on this Mac shows it in its chat list.
 */
export type KakaoChat = {
  name: string;
  /** People in a group chat; `undefined` for a 1:1 chat. */
  members: number | undefined;
  /** The last message's preview, as the app shows it. */
  lastMessage: string | undefined;
  /** When the last message came, as the app writes it ("오후 3:12", "어제", …). */
  time: string | undefined;
  /** Unread messages, when the app exposes its badge (KakaoTalk 26.9 for Mac does not; the Dock total does). */
  unread: number | undefined;
  /** Where the room is in the app's window, to open it again. */
  at: { table: number; row: number };
};

/**
 * ### MacPermission
 *
 * A macOS privacy permission reading chats needs: Accessibility (reading the
 * window) or Automation (sending Apple events to System Events).
 */
export type MacPermission = "accessibility" | "automation";

/**
 * ### KakaoChats
 *
 * The chat list read from the KakaoTalk app, or why it could not be read:
 * - `unsupported`: the server is not on a Mac.
 * - `not-running`: KakaoTalk is not open.
 * - `no-access`: mothership lacks the Accessibility or Automation permission; `missing` says which was refused.
 * - `no-list`: the window shows no chat list (it is closed, or on another tab).
 *
 * `unread` is the total from the Dock badge, which needs no permission.
 */
export type KakaoChats =
  | { state: "ok"; chats: Array<KakaoChat>; unread: number | undefined }
  | { state: "unsupported" }
  | { state: "not-running" }
  | { state: "no-access"; missing: MacPermission; detail: string; unread: number | undefined }
  | { state: "no-list"; unread: number | undefined };

/**
 * ### KakaoOpenTarget
 *
 * What `POST /api/kakaotalk/open` brings to the front: the app, one chat,
 * or (on a Mac) the System Settings pane of a {@link MacPermission}.
 */
export type KakaoOpenTarget = { kind: "app" } | { kind: "chat"; name: string; at: KakaoChat["at"] } | { kind: "accessibility" } | { kind: "automation" };
