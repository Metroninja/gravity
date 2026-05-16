import { asc, eq } from "drizzle-orm";

import { ModuleAccordion } from "~/components/ModuleAccordion";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { getEnrolledCourse } from "~/lib/access.server";
import { getProgressForUser } from "~/lib/progress.server";
import { getReadUrl } from "~/lib/storage.server";
import { modules } from "~/db/schema";
import type { Route } from "./+types/courses.$slug";

export async function loader({ params, request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const course = await getEnrolledCourse(user.id, params.slug);

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
    user.id,
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

export default function CourseDetail({ loaderData }: Route.ComponentProps) {
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
