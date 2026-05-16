import { and, eq } from "drizzle-orm";
import { data } from "react-router";

import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { updateProgress } from "~/lib/progress.server";
import { courses, enrollments, modules, videos } from "~/db/schema";
import type { Route } from "./+types/api.progress";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const user = await requireUser(request);
  const form = await request.formData();

  const videoId = form.get("videoId");
  if (typeof videoId !== "string" || videoId.length === 0) {
    return data({ error: "videoId required" }, { status: 400 });
  }

  // Authorize: user must be enrolled in the course this video belongs to.
  const [allowed] = await db
    .select({ id: videos.id })
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
    .where(eq(videos.id, videoId))
    .limit(1);

  if (!allowed) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const positionRaw = form.get("position");
  const completedRaw = form.get("completed");
  const position =
    typeof positionRaw === "string" ? Number.parseFloat(positionRaw) : undefined;
  const completed = completedRaw === "1" || completedRaw === "true";

  await updateProgress({
    userId: user.id,
    videoId,
    position: Number.isFinite(position) ? position : undefined,
    completed,
  });

  return data({ ok: true });
}

export async function loader() {
  return data({ error: "Method not allowed" }, { status: 405 });
}
