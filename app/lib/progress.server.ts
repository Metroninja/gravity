import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "./db.server";
import { videoProgress } from "~/db/schema";

/**
 * Upsert a video's progress for a user.
 *
 * - `completed: true` stamps `completedAt = now()`.
 * - Position updates land in `last_position_sec` so the player can resume.
 * - Throttling is the caller's responsibility (we expect ~once per 10s).
 */
export async function updateProgress(opts: {
  userId: string;
  videoId: string;
  position?: number;
  completed?: boolean;
}) {
  const { userId, videoId, position, completed } = opts;
  await db
    .insert(videoProgress)
    .values({
      userId,
      videoId,
      lastPositionSec: Math.max(0, Math.floor(position ?? 0)),
      completedAt: completed ? new Date() : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [videoProgress.userId, videoProgress.videoId],
      set: {
        lastPositionSec: position !== undefined
          ? sql`GREATEST(${videoProgress.lastPositionSec}, ${Math.max(0, Math.floor(position))})`
          : sql`${videoProgress.lastPositionSec}`,
        completedAt: completed
          ? sql`COALESCE(${videoProgress.completedAt}, NOW())`
          : sql`${videoProgress.completedAt}`,
        updatedAt: new Date(),
      },
    });
}

export async function getProgressForUser(userId: string, videoIds: string[]) {
  if (videoIds.length === 0) return new Map<string, { completed: boolean; lastPositionSec: number }>();
  const rows = await db
    .select()
    .from(videoProgress)
    .where(
      and(
        eq(videoProgress.userId, userId),
        inArray(videoProgress.videoId, videoIds),
      ),
    );
  const map = new Map<string, { completed: boolean; lastPositionSec: number }>();
  for (const row of rows) {
    map.set(row.videoId, {
      completed: row.completedAt !== null,
      lastPositionSec: row.lastPositionSec,
    });
  }
  return map;
}
