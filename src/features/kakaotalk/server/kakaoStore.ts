import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { SentMemo } from "@/features/kakaotalk/model/KakaoTalk";
import { writeQueueFor, toJsonFile, writeFileAtomic } from "@/platform/files";
import { dataPath } from "@/platform/paths";

/** How many sent notes are kept for the section's list. */
const SENT_KEPT = 30;

const file = () => dataPath(".mothership", "kakao.json");

const tokenSchema = z.object({
  accessToken: z.string().min(1),
  /** Epoch milliseconds. */
  accessExpiresAt: z.number(),
  refreshToken: z.string().min(1),
  /** Epoch milliseconds. */
  refreshExpiresAt: z.number(),
});

const storedSchema = z.object({
  token: tokenSchema.optional(),
  sent: z.array(z.object({ id: z.string(), text: z.string(), sentAt: z.string() })).default([]),
});

/**
 * ### KakaoToken
 *
 * Your Kakao sign-in: a short-lived access token and the refresh token that renews it.
 */
export type KakaoToken = z.infer<typeof tokenSchema>;

/**
 * ### KakaoStored
 *
 * What `.mothership/kakao.json` (git-ignored, readable only by you) holds.
 */
export type KakaoStored = z.infer<typeof storedSchema>;

/**
 * ### readKakao
 *
 * @returns The saved sign-in and sent notes; empty when the file is missing or unreadable.
 */
export async function readKakao(): Promise<KakaoStored> {
  const text = await readFile(file(), "utf8").catch(() => undefined);
  if (text === undefined) return { sent: [] };
  try {
    const parsed = storedSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : { sent: [] };
  } catch {
    return { sent: [] };
  }
}


/**
 * ### updateKakao
 *
 * Reads, changes, and saves `.mothership/kakao.json` in one step.
 *
 * @returns The saved value.
 */
export function updateKakao(change: (current: KakaoStored) => KakaoStored): Promise<KakaoStored> {
  return writeQueueFor(file())(async () => {
    const next = change(await readKakao());
    next.sent = next.sent.slice(0, SENT_KEPT);
    await writeFileAtomic(file(), toJsonFile(next), { mode: 0o600 });
    return next;
  });
}

/**
 * ### recordSent
 *
 * Adds a note to the top of the sent list.
 */
export async function recordSent(memo: SentMemo): Promise<void> {
  await updateKakao((current) => ({ ...current, sent: [memo, ...current.sent] }));
}
