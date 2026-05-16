import { and, asc, eq, sql } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";

import { PdfUploader } from "~/components/PdfUploader";
import { requireAdmin } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { deleteObject } from "~/lib/storage.server";
import {
  attachments,
  courses,
  modules,
  videos,
} from "~/db/schema";
import type { Route } from "./+types/admin.courses.$slug.modules.$moduleId";

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, params.slug))
    .limit(1);
  if (!course) {
    throw data({ message: "Programma niet gevonden" }, { status: 404 });
  }

  const [moduleRow] = await db
    .select()
    .from(modules)
    .where(and(eq(modules.id, params.moduleId), eq(modules.courseId, course.id)))
    .limit(1);
  if (!moduleRow) {
    throw data({ message: "Module niet gevonden" }, { status: 404 });
  }

  const [videoList, attachmentList] = await Promise.all([
    db
      .select()
      .from(videos)
      .where(eq(videos.moduleId, moduleRow.id))
      .orderBy(asc(videos.sortOrder), asc(videos.title)),
    db
      .select()
      .from(attachments)
      .where(eq(attachments.moduleId, moduleRow.id))
      .orderBy(asc(attachments.sortOrder), asc(attachments.title)),
  ]);

  return {
    course: { slug: course.slug, title: course.title },
    module: {
      id: moduleRow.id,
      title: moduleRow.title,
      sortOrder: moduleRow.sortOrder,
    },
    videos: videoList.map((v) => ({
      id: v.id,
      title: v.title,
      sortOrder: v.sortOrder,
      durationSec: v.durationSec,
      hasVideoFile: Boolean(v.videoKey),
      hasSubtitles: Boolean(v.subtitlesKey),
    })),
    attachments: attachmentList.map((a) => ({
      id: a.id,
      title: a.title,
      fileKey: a.fileKey,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      sortOrder: a.sortOrder,
    })),
  };
}

async function moveWithinModule(
  table: typeof videos | typeof attachments,
  moduleId: string,
  rowId: string,
  dir: "up" | "down",
) {
  const [current] = await db
    .select({ id: table.id, sortOrder: table.sortOrder })
    .from(table)
    .where(and(eq(table.id, rowId), eq(table.moduleId, moduleId)));
  if (!current) return;

  const neighbour =
    dir === "up"
      ? await db
          .select({ id: table.id, sortOrder: table.sortOrder })
          .from(table)
          .where(
            and(
              eq(table.moduleId, moduleId),
              sql`${table.sortOrder} < ${current.sortOrder}`,
            ),
          )
          .orderBy(sql`${table.sortOrder} DESC`)
          .limit(1)
      : await db
          .select({ id: table.id, sortOrder: table.sortOrder })
          .from(table)
          .where(
            and(
              eq(table.moduleId, moduleId),
              sql`${table.sortOrder} > ${current.sortOrder}`,
            ),
          )
          .orderBy(asc(table.sortOrder))
          .limit(1);

  const other = neighbour[0];
  if (!other) return;

  await db.transaction(async (tx) => {
    await tx.update(table).set({ sortOrder: -1 }).where(eq(table.id, current.id));
    await tx
      .update(table)
      .set({ sortOrder: current.sortOrder })
      .where(eq(table.id, other.id));
    await tx
      .update(table)
      .set({ sortOrder: other.sortOrder })
      .where(eq(table.id, current.id));
  });
}

export async function action({ params, request }: Route.ActionArgs) {
  await requireAdmin(request);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, params.slug))
    .limit(1);
  if (!course) {
    throw data({ message: "Programma niet gevonden" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(modules)
    .where(and(eq(modules.id, params.moduleId), eq(modules.courseId, course.id)))
    .limit(1);
  if (!existing) {
    throw data({ message: "Module niet gevonden" }, { status: 404 });
  }

  const form = await request.formData();
  const intent = form.get("intent");

  // ---- Update module title ----------------------------------------------
  if (intent === "update-module") {
    const title = ((form.get("title") as string) ?? "").trim();
    if (!title) return data({ error: "Titel is verplicht" }, { status: 400 });
    await db.update(modules).set({ title }).where(eq(modules.id, existing.id));
    return null;
  }

  // ---- Delete attachment -------------------------------------------------
  if (intent === "delete-attachment") {
    const attachmentId = form.get("attachmentId");
    if (typeof attachmentId !== "string") return null;
    const [att] = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, attachmentId),
          eq(attachments.moduleId, existing.id),
        ),
      )
      .limit(1);
    if (att) {
      await db.delete(attachments).where(eq(attachments.id, att.id));
      if (att.fileKey) await deleteObject(att.fileKey);
    }
    return null;
  }

  // ---- Create attachment (from already-uploaded key) --------------------
  if (intent === "create-attachment") {
    const title = ((form.get("title") as string) ?? "").trim();
    const fileKey = ((form.get("fileKey") as string) ?? "").trim();
    const contentType =
      ((form.get("contentType") as string) ?? "").trim() || "application/pdf";
    const sizeBytes = Number.parseInt(
      (form.get("sizeBytes") as string) ?? "0",
      10,
    );
    if (!title || !fileKey) {
      return data(
        { error: "Titel en bestand zijn verplicht" },
        { status: 400 },
      );
    }
    const max = await db
      .select({ m: sql<number>`COALESCE(MAX(${attachments.sortOrder}), -1)::int` })
      .from(attachments)
      .where(eq(attachments.moduleId, existing.id));
    const nextSort = (max[0]?.m ?? -1) + 1;
    await db.insert(attachments).values({
      moduleId: existing.id,
      title,
      fileKey,
      contentType,
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
      sortOrder: nextSort,
    });
    return null;
  }

  // ---- Reorder -----------------------------------------------------------
  if (intent === "move-video-up" || intent === "move-video-down") {
    const videoId = form.get("videoId");
    if (typeof videoId !== "string") return null;
    await moveWithinModule(
      videos,
      existing.id,
      videoId,
      intent === "move-video-up" ? "up" : "down",
    );
    return null;
  }
  if (intent === "move-attachment-up" || intent === "move-attachment-down") {
    const attachmentId = form.get("attachmentId");
    if (typeof attachmentId !== "string") return null;
    await moveWithinModule(
      attachments,
      existing.id,
      attachmentId,
      intent === "move-attachment-up" ? "up" : "down",
    );
    return null;
  }

  // ---- Delete module -----------------------------------------------------
  if (intent === "delete-module") {
    await db.delete(modules).where(eq(modules.id, existing.id));
    return redirect(`/admin/courses/${course.slug}/edit`);
  }

  return data({ error: "Onbekende actie" }, { status: 400 });
}

function fmtDuration(sec: number) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ModuleDetail({ loaderData }: Route.ComponentProps) {
  const { course, module, videos, attachments } = loaderData;

  return (
    <section className="flex flex-col gap-8">
      <header>
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
          / {module.title}
        </p>
        <h1 className="mt-1 text-3xl">Module bewerken</h1>
      </header>

      <article className="card max-w-xl p-6">
        <h2 className="mb-3 text-xl">Moduletitel</h2>
        <Form method="post" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="update-module" />
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="font-medium">Titel</span>
            <input
              name="title"
              type="text"
              required
              maxLength={200}
              defaultValue={module.title}
              className="rounded-lg border border-off-black/15 bg-white px-3 py-2 outline-none focus:border-magenta"
            />
          </label>
          <button type="submit" className="btn-primary">
            Opslaan
          </button>
        </Form>
      </article>

      <article className="card overflow-hidden">
        <header className="flex items-center justify-between border-b border-off-black/5 px-6 py-4">
          <div>
            <h2 className="text-xl">Video&apos;s</h2>
            <p className="text-sm text-off-black/60">
              Iedere video heeft eigen instructies en optionele ondertiteling.
            </p>
          </div>
          <Link
            to={`/admin/courses/${course.slug}/modules/${module.id}/videos/new`}
            className="btn-primary"
          >
            + Nieuwe video
          </Link>
        </header>
        {videos.length === 0 ? (
          <p className="px-6 py-8 text-off-black/70">
            Nog geen video&apos;s in deze module.
          </p>
        ) : (
          <ol className="divide-y divide-off-black/5">
            {videos.map((v, idx) => (
              <li
                key={v.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-seashell/60"
              >
                <span className="font-display text-lg text-magenta/50 tabular-nums">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <Link
                  to={`/admin/courses/${course.slug}/modules/${module.id}/videos/${v.id}/edit`}
                  className="flex-1 no-underline"
                >
                  <p className="font-medium text-off-black">{v.title}</p>
                  <p className="text-xs text-off-black/50">
                    {fmtDuration(v.durationSec)} ·{" "}
                    {v.hasVideoFile ? "video gekoppeld" : "nog geen video"}{" "}
                    {v.hasSubtitles ? "· met ondertitels" : ""}
                  </p>
                </Link>
                <Form method="post" className="flex items-center gap-1">
                  <input type="hidden" name="videoId" value={v.id} />
                  <button
                    type="submit"
                    name="intent"
                    value="move-video-up"
                    disabled={idx === 0}
                    className="rounded-md p-1.5 text-off-black/60 hover:bg-butter-yellow disabled:opacity-30"
                    aria-label="Omhoog"
                  >
                    ↑
                  </button>
                  <button
                    type="submit"
                    name="intent"
                    value="move-video-down"
                    disabled={idx === videos.length - 1}
                    className="rounded-md p-1.5 text-off-black/60 hover:bg-butter-yellow disabled:opacity-30"
                    aria-label="Omlaag"
                  >
                    ↓
                  </button>
                </Form>
                <Link
                  to={`/admin/courses/${course.slug}/modules/${module.id}/videos/${v.id}/edit`}
                  className="text-sm text-magenta hover:underline"
                >
                  Bewerken →
                </Link>
              </li>
            ))}
          </ol>
        )}
      </article>

      <PdfList attachments={attachments} />

      <article className="card border border-burnt-sienna/30 bg-burnt-sienna/5 p-6">
        <h2 className="mb-1 text-lg text-burnt-sienna">Module verwijderen</h2>
        <p className="mb-4 text-sm text-off-black/70">
          Dit verwijdert ook alle video&apos;s en PDF&apos;s in deze module.
        </p>
        <Form
          method="post"
          onSubmit={(e) => {
            if (
              !confirm("Module verwijderen met alle video's en PDF's. Doorgaan?")
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="delete-module" />
          <button type="submit" className="btn-secondary text-burnt-sienna">
            Verwijder module
          </button>
        </Form>
      </article>
    </section>
  );
}

type AttachmentItem = Route.ComponentProps["loaderData"]["attachments"][number];

function PdfList({ attachments }: { attachments: AttachmentItem[] }) {
  return (
    <article className="card overflow-hidden">
      <header className="border-b border-off-black/5 px-6 py-4">
        <h2 className="text-xl">PDF&apos;s en werkbladen</h2>
        <p className="text-sm text-off-black/60">
          Documenten die naast de video&apos;s zichtbaar zijn in deze module.
        </p>
      </header>
      {attachments.length === 0 ? (
        <p className="px-6 py-8 text-off-black/70">Nog geen PDF&apos;s.</p>
      ) : (
        <ol className="divide-y divide-off-black/5">
          {attachments.map((a, idx) => (
            <li
              key={a.id}
              className="flex items-center gap-4 px-6 py-3 hover:bg-seashell/60"
            >
              <span className="text-xs uppercase tracking-wide text-off-black/40">
                PDF
              </span>
              <div className="flex-1">
                <p className="font-medium text-off-black">{a.title}</p>
                <p className="text-xs text-off-black/50">
                  {fmtSize(a.sizeBytes)}
                </p>
              </div>
              <Form method="post" className="flex items-center gap-1">
                <input type="hidden" name="attachmentId" value={a.id} />
                <button
                  type="submit"
                  name="intent"
                  value="move-attachment-up"
                  disabled={idx === 0}
                  className="rounded-md p-1.5 text-off-black/60 hover:bg-butter-yellow disabled:opacity-30"
                  aria-label="Omhoog"
                >
                  ↑
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="move-attachment-down"
                  disabled={idx === attachments.length - 1}
                  className="rounded-md p-1.5 text-off-black/60 hover:bg-butter-yellow disabled:opacity-30"
                  aria-label="Omlaag"
                >
                  ↓
                </button>
              </Form>
              <Form
                method="post"
                onSubmit={(e) => {
                  if (!confirm(`PDF "${a.title}" verwijderen?`)) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="delete-attachment" />
                <input type="hidden" name="attachmentId" value={a.id} />
                <button
                  type="submit"
                  className="rounded-md p-1.5 text-burnt-sienna hover:bg-burnt-sienna/10"
                  aria-label="Verwijderen"
                >
                  ×
                </button>
              </Form>
            </li>
          ))}
        </ol>
      )}
      <PdfUploader />
    </article>
  );
}
