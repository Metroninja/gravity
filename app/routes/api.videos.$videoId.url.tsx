import { and, eq } from "drizzle-orm";
import { data } from "react-router";

import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { getReadUrl } from "~/lib/storage.server";
import { courses, enrollments, modules, videos } from "~/db/schema";
import type { Route } from "./+types/api.videos.$videoId.url";

export async function loader({ params, request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  const [row] = await db
    .select({
      videoKey: videos.videoKey,
      subtitlesKey: videos.subtitlesKey,
    })
    .from(videos)
    .innerJoin(modules, eq(videos.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .innerJoin(
      enrollments,
      and(
        eq(enrollments.courseId, courses.id),
        eq(enrollments.userId, user.id),
      ),
    )
    .where(eq(videos.id, params.videoId))
    .limit(1);

  if (!row) {
    return data({ error: "Not found" }, { status: 404 });
  }

  const [url, subtitlesUrl] = await Promise.all([
    getReadUrl(row.videoKey, 60 * 60),
    row.subtitlesKey ? getReadUrl(row.subtitlesKey, 60 * 60) : Promise.resolve(null),
  ]);

  return data({ url, subtitlesUrl });
}
