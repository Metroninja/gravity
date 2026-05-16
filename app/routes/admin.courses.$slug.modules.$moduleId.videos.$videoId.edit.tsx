import { and, eq } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";

import { VideoForm, type VideoFormValues } from "~/components/VideoForm";
import { requireAdmin } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { deleteObject, getReadUrl } from "~/lib/storage.server";
import { courses, modules, videos } from "~/db/schema";
import type { Route } from "./+types/admin.courses.$slug.modules.$moduleId.videos.$videoId.edit";

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

  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, params.videoId), eq(videos.moduleId, moduleRow.id)))
    .limit(1);
  if (!video) throw data({ message: "Video niet gevonden" }, { status: 404 });

  return {
    course: { slug: course.slug, title: course.title },
    module: { id: moduleRow.id, title: moduleRow.title },
    video: { id: video.id, title: video.title },
    values: {
      title: video.title,
      instructionsMd: video.instructionsMd ?? "",
      durationSec: video.durationSec ?? 0,
      sortOrder: video.sortOrder ?? 0,
      videoKey: video.videoKey,
      videoPreviewUrl: video.videoKey
        ? await getReadUrl(video.videoKey, 60 * 30)
        : null,
      subtitlesKey: video.subtitlesKey,
      subtitlesPreviewUrl: video.subtitlesKey
        ? await getReadUrl(video.subtitlesKey, 60 * 30)
        : null,
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

  const [existing] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, params.videoId), eq(videos.moduleId, moduleRow.id)))
    .limit(1);
  if (!existing) throw data({ message: "Video niet gevonden" }, { status: 404 });

  const form = await request.formData();
  const intent = form.get("intent");

  // ---- Delete ------------------------------------------------------------
  if (intent === "delete") {
    await db.delete(videos).where(eq(videos.id, existing.id));
    if (existing.videoKey) await deleteObject(existing.videoKey);
    if (existing.subtitlesKey) await deleteObject(existing.subtitlesKey);
    return redirect(`/admin/courses/${course.slug}/modules/${moduleRow.id}`);
  }

  // ---- Update ------------------------------------------------------------
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
  if (!videoKey) errors.videoKey = "Een videobestand is verplicht.";

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

  await db
    .update(videos)
    .set({
      title,
      instructionsMd,
      videoKey: videoKey!,
      subtitlesKey,
      durationSec,
      sortOrder,
    })
    .where(eq(videos.id, existing.id));

  if (existing.videoKey && existing.videoKey !== videoKey) {
    await deleteObject(existing.videoKey);
  }
  if (existing.subtitlesKey && existing.subtitlesKey !== subtitlesKey) {
    await deleteObject(existing.subtitlesKey);
  }

  return redirect(
    `/admin/courses/${course.slug}/modules/${moduleRow.id}/videos/${existing.id}/edit`,
  );
}

export default function EditVideoPage({
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
          / {values.title || "Video"}
        </p>
        <h1 className="mt-1 text-3xl">Video bewerken</h1>
      </header>

      <VideoForm
        mode="edit"
        initial={values}
        errors={errors}
        footerExtras={
          <Form
            method="post"
            onSubmit={(e) => {
              if (
                !confirm(
                  "Deze video wordt verwijderd, inclusief videobestand en ondertiteling. Doorgaan?",
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <button
              type="submit"
              className="text-sm font-medium text-burnt-sienna hover:underline"
            >
              Verwijder video
            </button>
          </Form>
        }
      />
    </section>
  );
}
