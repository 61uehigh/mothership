/**
 * ### NotificationState
 *
 * Browser permission, with `denied` also covering "granted but muted here".
 */
export type NotificationState = NotificationPermission | "unsupported" | "muted";
