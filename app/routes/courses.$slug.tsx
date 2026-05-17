import { and, asc, eq } from "drizzle-orm";

import { CourseLanding } from "~/components/CourseLanding";
import { ModuleAccordion } from "~/components/ModuleAccordion";
import { getUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { getProgressForUser } from "~/lib/progress.server";
import { getReadUrl } from "~/lib/storage.server";
import { courses, enrollments, modules } from "~/db/schema";
import { data } from "react-router";
import type { Route } from "./+types/courses.$slug";

export async function loader({ params, request }: Route.LoaderArgs) {
  const user = await getUser(request);
  const url = new URL(request.url);
  const canceled = url.searchParams.get("canceled") === "1";

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, params.slug))
    .limit(1);

  if (!course) {
    throw data({ message: "Programma niet gevonden" }, { status: 404 });
  }

  // Determine enrollment if logged in.
  let enrolled = false;
  if (user) {
    const [row] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, user.id),
          eq(enrollments.courseId, course.id),
        ),
      )
      .limit(1);
    enrolled = !!row;
  }

  // Enrolled student (course must be published) -> full player view.
  if (user && enrolled && course.published) {
    return loadStudentView(user.id, course);
  }

  // Public landing branch: course must opt in.
  if (!course.publicLanding) {
    if (user && course.published) {
      // Logged in but not enrolled, course doesn't expose a public landing.
      throw data(
        { message: "Geen toegang tot dit programma" },
        { status: 403 },
      );
    }
    throw data({ message: "Programma niet gevonden" }, { status: 404 });
  }

  return loadPublicLanding(course, !!user, canceled);
}

async function loadStudentView(
  userId: string,
  course: typeof courses.$inferSelect,
) {
  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, course.id))
    .orderBy(asc(modules.sortOrder), asc(modules.title));

  const moduleIds = moduleRows.map((m) => m.id);

  const [videoList, attachmentList] = await Promise.all([
    moduleIds.length
      ? db.query.videos.findMany({
          where: (v, { inArray }) => inArray(v.moduleId, moduleIds),
          orderBy: (v, { asc }) => [asc(v.sortOrder), asc(v.title)],
        })
      : Promise.resolve([]),
    moduleIds.length
      ? db.query.attachments.findMany({
          where: (a, { inArray }) => inArray(a.moduleId, moduleIds),
          orderBy: (a, { asc }) => [asc(a.sortOrder), asc(a.title)],
        })
      : Promise.resolve([]),
  ]);

  const progress = await getProgressForUser(
    userId,
    videoList.map((v) => v.id),
  );

  const attachmentsByModule = new Map<
    string,
    Array<{
      id: string;
      title: string;
      url: string;
      contentType: string;
      sizeBytes: number;
    }>
  >();
  await Promise.all(
    attachmentList.map(async (a) => {
      const url = await getReadUrl(a.fileKey, 60 * 60);
      const list = attachmentsByModule.get(a.moduleId) ?? [];
      list.push({
        id: a.id,
        title: a.title,
        url,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
      });
      attachmentsByModule.set(a.moduleId, list);
    }),
  );

  const videosByModule = new Map<string, typeof videoList>();
  for (const v of videoList) {
    const list = videosByModule.get(v.moduleId) ?? [];
    list.push(v);
    videosByModule.set(v.moduleId, list);
  }

  const moduleData = moduleRows.map((m) => ({
    id: m.id,
    title: m.title,
    videos: (videosByModule.get(m.id) ?? []).map((v) => ({
      id: v.id,
      title: v.title,
      durationSec: v.durationSec,
      completed: progress.get(v.id)?.completed ?? false,
    })),
    attachments: attachmentsByModule.get(m.id) ?? [],
  }));

  const totalVideos = videoList.length;
  const completedVideos = videoList.filter(
    (v) => progress.get(v.id)?.completed,
  ).length;

  return {
    view: "student" as const,
    course: {
      slug: course.slug,
      title: course.title,
      description: course.description,
    },
    modules: moduleData,
    completedVideos,
    totalVideos,
  };
}

async function loadPublicLanding(
  course: typeof courses.$inferSelect,
  isLoggedIn: boolean,
  canceled: boolean,
) {
  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, course.id))
    .orderBy(asc(modules.sortOrder), asc(modules.title));

  const moduleIds = moduleRows.map((m) => m.id);

  const [videoRows, attachmentRows] = await Promise.all([
    moduleIds.length
      ? db.query.videos.findMany({
          where: (v, { inArray }) => inArray(v.moduleId, moduleIds),
          orderBy: (v, { asc }) => [asc(v.sortOrder), asc(v.title)],
          columns: {
            id: true,
            moduleId: true,
            title: true,
            durationSec: true,
          },
        })
      : Promise.resolve([]),
    moduleIds.length
      ? db.query.attachments.findMany({
          where: (a, { inArray }) => inArray(a.moduleId, moduleIds),
          columns: { id: true, moduleId: true },
        })
      : Promise.resolve([]),
  ]);

  const videosByModule = new Map<string, typeof videoRows>();
  for (const v of videoRows) {
    const list = videosByModule.get(v.moduleId) ?? [];
    list.push(v);
    videosByModule.set(v.moduleId, list);
  }

  const attachmentCountByModule = new Map<string, number>();
  for (const a of attachmentRows) {
    attachmentCountByModule.set(
      a.moduleId,
      (attachmentCountByModule.get(a.moduleId) ?? 0) + 1,
    );
  }

  const moduleData = moduleRows.map((m) => ({
    id: m.id,
    title: m.title,
    videos: (videosByModule.get(m.id) ?? []).map((v) => ({
      title: v.title,
      durationSec: v.durationSec,
    })),
    attachmentCount: attachmentCountByModule.get(m.id) ?? 0,
  }));

  const totalDurationSec = videoRows.reduce(
    (acc, v) => acc + (v.durationSec ?? 0),
    0,
  );

  const coverUrl = course.coverKey
    ? await getReadUrl(course.coverKey, 60 * 60)
    : null;

  return {
    view: "landing" as const,
    course: {
      slug: course.slug,
      title: course.title,
      tagline: course.tagline,
      description: course.description,
      coverUrl,
      priceCents: course.priceCents,
      currency: course.currency,
    },
    modules: moduleData,
    totals: {
      moduleCount: moduleRows.length,
      videoCount: videoRows.length,
      totalDurationSec,
      attachmentCount: attachmentRows.length,
    },
    isLoggedIn,
    canceled,
  };
}

export default function CourseDetail({ loaderData }: Route.ComponentProps) {
  if (loaderData.view === "landing") {
    return (
      <CourseLanding
        course={loaderData.course}
        modules={loaderData.modules}
        totals={loaderData.totals}
        isLoggedIn={loaderData.isLoggedIn}
        canceled={loaderData.canceled}
      />
    );
  }

  const { course, modules: moduleData, completedVideos, totalVideos } =
    loaderData;
  const pct =
    totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

  return (
    <article>
      <header className="mb-8">
        <h1 className="text-4xl">{course.title}</h1>
        {course.description ? (
          <p className="mt-3 max-w-2xl text-off-black/70">
            {course.description}
          </p>
        ) : null}
        <div className="mt-5 flex items-center gap-4 text-sm">
          <div className="h-2 w-48 overflow-hidden rounded-full bg-off-black/10">
            <div
              className="h-full bg-magenta transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-off-black/70">
            {completedVideos}/{totalVideos} voltooid ({pct}%)
          </span>
        </div>
      </header>
      <ModuleAccordion courseSlug={course.slug} modules={moduleData} />
    </article>
  );
}
