/**
 * ### NotificationState
 *
 * The browser permission, `unsupported` when the browser has no notifications,
 * or `muted` when permission is granted but notifications are muted here.
 */
export type NotificationState = NotificationPermission | "unsupported" | "muted";
