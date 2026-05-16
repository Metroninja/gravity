import { and, eq, sql } from "drizzle-orm";
import { data, Link, redirect } from "react-router";

import { VideoForm, type VideoFormValues } from "~/components/VideoForm";
import { requireAdmin } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { getReadUrl } from "~/lib/storage.server";
import { courses, modules, videos } from "~/db/schema";
import type { Route } from "./+types/admin.courses.$slug.modules.$moduleId.videos.new";

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, params.slug))
    .limit(1);
  if (!course) throw data({ message: "Programma niet gevonden" }, { status: 404 });

  const [moduleRow] = await db
    .select()
    .from(modules)
    .where(and(eq(modules.id, params.moduleId), eq(modules.courseId, course.id)))
    .limit(1);
  if (!moduleRow) throw data({ message: "Module niet gevonden" }, { status: 404 });

  const max = await db
    .select({ m: sql<number>`COALESCE(MAX(${videos.sortOrder}), -1)::int` })
    .from(videos)
    .where(eq(videos.moduleId, moduleRow.id));
  const nextSort = (max[0]?.m ?? -1) + 1;

  return {
    course: { slug: course.slug, title: course.title },
    module: { id: moduleRow.id, title: moduleRow.title },
    values: {
      title: "",
      instructionsMd: "",
      durationSec: 0,
      sortOrder: nextSort,
      videoKey: null,
      videoPreviewUrl: null,
      subtitlesKey: null,
      subtitlesPreviewUrl: null,
    } satisfies VideoFormValues,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  await requireAdmin(request);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, params.slug))
    .limit(1);
  if (!course) throw data({ message: "Programma niet gevonden" }, { status: 404 });

  const [moduleRow] = await db
    .select()
    .from(modules)
    .where(and(eq(modules.id, params.moduleId), eq(modules.courseId, course.id)))
    .limit(1);
  if (!moduleRow) throw data({ message: "Module niet gevonden" }, { status: 404 });

  const form = await request.formData();
  const title = ((form.get("title") as string) ?? "").trim();
  const instructionsMd = ((form.get("instructionsMd") as string) ?? "").trim();
  const videoKey = ((form.get("videoKey") as string) ?? "").trim() || null;
  const subtitlesKey = ((form.get("subtitlesKey") as string) ?? "").trim() || null;
  const durationSec = Math.max(
    0,
    Number.parseInt((form.get("durationSec") as string) ?? "0", 10) || 0,
  );
  const sortOrder = Math.max(
    0,
    Number.parseInt((form.get("sortOrder") as string) ?? "0", 10) || 0,
  );

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Titel is verplicht.";
  if (!videoKey) errors.videoKey = "Upload eerst een videobestand.";

  if (Object.keys(errors).length > 0) {
    return data(
      {
        errors,
        values: {
          title,
          instructionsMd,
          durationSec,
          sortOrder,
          videoKey,
          videoPreviewUrl: videoKey ? await getReadUrl(videoKey, 60 * 30) : null,
          subtitlesKey,
          subtitlesPreviewUrl: subtitlesKey
            ? await getReadUrl(subtitlesKey, 60 * 30)
            : null,
        } satisfies VideoFormValues,
      },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(videos)
    .values({
      moduleId: moduleRow.id,
      title,
      instructionsMd,
      videoKey: videoKey!,
      subtitlesKey,
      durationSec,
      sortOrder,
    })
    .returning();

  return redirect(
    `/admin/courses/${course.slug}/modules/${moduleRow.id}/videos/${created.id}/edit`,
  );
}

export default function NewVideoPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { course, module } = loaderData;
  const values =
    (actionData as { values?: VideoFormValues } | undefined)?.values ??
    loaderData.values;
  const errors =
    (actionData as { errors?: Record<string, string> } | undefined)?.errors ??
    {};

  return (
    <section className="max-w-3xl">
      <header className="mb-6">
        <p className="text-sm text-off-black/60">
          <Link to="/admin/courses" className="hover:underline">
            Programma&apos;s
          </Link>{" "}
          /{" "}
          <Link
            to={`/admin/courses/${course.slug}/edit`}
            className="hover:underline"
          >
            {course.title}
          </Link>{" "}
          /{" "}
          <Link
            to={`/admin/courses/${course.slug}/modules/${module.id}`}
            className="hover:underline"
          >
            {module.title}
          </Link>{" "}
          / Nieuwe video
        </p>
        <h1 className="mt-1 text-3xl">Nieuwe video</h1>
      </header>
      <VideoForm mode="create" initial={values} errors={errors} />
    </section>
  );
}
