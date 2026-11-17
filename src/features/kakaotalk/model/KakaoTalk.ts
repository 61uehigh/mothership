import type { KakaoErrorCode } from "@/lib/apiErrorCodes";
// KakaoTalk data shared by the server (features/kakaotalk/server) and the UI.
// The section only reads: KakaoTalk has no official API for your chats, and
// sending as you would mean driving the app, which Kakao's terms don't allow.
import { z } from "zod";

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
export type MacPermission = Extract<KakaoErrorCode, "accessibility" | "automation">;

/**
 * ### KakaoChats
 *
 * The chat list read from the KakaoTalk app, or why it could not be read:
 * - `unsupported`: the server is not on a Mac.
 * - `not-running`: KakaoTalk is not open.
 * - `no-access`: mothership lacks the Accessibility or Automation permission; `missing` says which was refused.
 * - `no-list`: the window shows no chat list (it is closed, or on another tab); `windows` counts KakaoTalk's open windows.
 *
 * `unread` is the total from the Dock badge, which needs no permission.
 */
export type KakaoChats =
  | { state: "ok"; chats: Array<KakaoChat>; unread: number | undefined }
  | { state: "unsupported" }
  | { state: "not-running" }
  | { state: "no-access"; missing: MacPermission; unread: number | undefined }
  | { state: "no-list"; windows: number; unread: number | undefined };

/**
 * ### KakaoWindowNode
 *
 * One element of the KakaoTalk window, without what it says: its
 * accessibility role and subrole, its depth (0 for a window), how many
 * elements are inside it, and for a text only its length.
 */
export type KakaoWindowNode = { depth: number; role: string; subrole: string; children: number; textLength?: number };

/**
 * ### KakaoWindowShape
 *
 * The structure of the KakaoTalk window as mothership sees it, for finding
 * out why no chat list was found; or why it could not be read.
 */
export type KakaoWindowShape =
  | { state: "ok"; windows: number; nodes: Array<KakaoWindowNode> }
  | { state: "unsupported" }
  | { state: "not-running" }
  | { state: "no-access"; missing: MacPermission };

/**
 * ### kakaoOpenTargetSchema
 *
 * The body of `POST /api/kakaotalk/open`, bounded so a request cannot ask the
 * script for an absurd chat name or table position.
 */
export const kakaoOpenTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("app") }),
  z.object({ kind: z.literal("accessibility") }),
  z.object({ kind: z.literal("automation") }),
  z.object({
    kind: z.literal("chat"),
    name: z.string().min(1).max(500),
    at: z.object({ table: z.number().int().min(0).max(50), row: z.number().int().min(0).max(500) }),
  }),
]);

/**
 * ### KakaoOpenTarget
 *
 * What `POST /api/kakaotalk/open` brings to the front: the app, one chat,
 * or (on a Mac) the System Settings pane of a {@link MacPermission}.
 */
export type KakaoOpenTarget = z.infer<typeof kakaoOpenTargetSchema>;
