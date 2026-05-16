import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { CourseCard } from "~/components/CourseCard";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { getReadUrl } from "~/lib/storage.server";
import {
  attachments as _attachments,
  courses,
  enrollments,
  modules,
  videoProgress,
  videos,
} from "~/db/schema";
import type { Route } from "./+types/courses._index";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  const enrolledCourses = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      description: courses.description,
      coverKey: courses.coverKey,
      sortOrder: courses.sortOrder,
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(eq(enrollments.userId, user.id), eq(courses.published, true)))
    .orderBy(asc(courses.sortOrder), asc(courses.title));

  const courseIds = enrolledCourses.map((c) => c.id);

  // Get all video IDs grouped by course, plus completion counts for this user.
  const videoRows = courseIds.length
    ? await db
        .select({
          courseId: modules.courseId,
          videoId: videos.id,
        })
        .from(videos)
        .innerJoin(modules, eq(videos.moduleId, modules.id))
        .where(inArray(modules.courseId, courseIds))
    : [];

  const completedRows = courseIds.length
    ? await db
        .select({
          courseId: modules.courseId,
          videoId: videoProgress.videoId,
        })
        .from(videoProgress)
        .innerJoin(videos, eq(videoProgress.videoId, videos.id))
        .innerJoin(modules, eq(videos.moduleId, modules.id))
        .where(
          and(
            eq(videoProgress.userId, user.id),
            isNotNull(videoProgress.completedAt),
            inArray(modules.courseId, courseIds),
          ),
        )
    : [];

  const totalByCourse = new Map<string, number>();
  for (const r of videoRows) {
    totalByCourse.set(r.courseId, (totalByCourse.get(r.courseId) ?? 0) + 1);
  }
  const doneByCourse = new Map<string, number>();
  for (const r of completedRows) {
    doneByCourse.set(r.courseId, (doneByCourse.get(r.courseId) ?? 0) + 1);
  }

  const items = await Promise.all(
    enrolledCourses.map(async (c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      coverUrl: c.coverKey ? await getReadUrl(c.coverKey, 60 * 60) : null,
      completedCount: doneByCourse.get(c.id) ?? 0,
      totalCount: totalByCourse.get(c.id) ?? 0,
    })),
  );

  return { items };
}

export default function CoursesIndex({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;

  if (items.length === 0) {
    return (
      <section className="card mx-auto max-w-xl p-10 text-center">
        <h1 className="mb-3 text-3xl">Nog geen programma&apos;s</h1>
        <p className="text-off-black/70">
          Zodra Janneke je toegang heeft gegeven verschijnen je programma&apos;s hier.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-6 text-4xl">Mijn programma&apos;s</h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <CourseCard
            key={item.id}
            slug={item.slug}
            title={item.title}
            description={item.description}
            coverUrl={item.coverUrl}
            completedCount={item.completedCount}
            totalCount={item.totalCount}
          />
        ))}
      </div>
    </section>
  );
}
