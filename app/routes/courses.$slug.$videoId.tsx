import { and, asc, eq } from "drizzle-orm";
import { useFetcher } from "react-router";
import { data, Link } from "react-router";

import { VideoPlayer } from "~/components/VideoPlayer";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { getEnrolledCourse } from "~/lib/access.server";
import { getProgressForUser } from "~/lib/progress.server";
import { getReadUrl } from "~/lib/storage.server";
import { attachments, modules, videos } from "~/db/schema";
import type { Route } from "./+types/courses.$slug.$videoId";

export async function loader({ params, request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const course = await getEnrolledCourse(user.id, params.slug);

  // Fetch video joined with its module to verify it belongs to this course.
  const [row] = await db
    .select({
      video: videos,
      module: modules,
    })
    .from(videos)
    .innerJoin(modules, eq(videos.moduleId, modules.id))
    .where(
      and(eq(videos.id, params.videoId), eq(modules.courseId, course.id)),
    )
    .limit(1);

  if (!row) {
    throw data({ message: "Video niet gevonden" }, { status: 404 });
  }

  // Siblings in the same module for next/prev navigation.
  const siblings = await db
    .select()
    .from(videos)
    .where(eq(videos.moduleId, row.module.id))
    .orderBy(asc(videos.sortOrder), asc(videos.title));

  const idx = siblings.findIndex((v) => v.id === row.video.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const moduleAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.moduleId, row.module.id))
    .orderBy(asc(attachments.sortOrder), asc(attachments.title));

  const [videoUrl, subtitlesUrl] = await Promise.all([
    getReadUrl(row.video.videoKey, 60 * 60),
    row.video.subtitlesKey
      ? getReadUrl(row.video.subtitlesKey, 60 * 60)
      : Promise.resolve(null),
  ]);

  const attachmentLinks = await Promise.all(
    moduleAttachments.map(async (a) => ({
      id: a.id,
      title: a.title,
      url: await getReadUrl(a.fileKey, 60 * 60),
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
    })),
  );

  const progress = await getProgressForUser(user.id, [row.video.id]);
  const p = progress.get(row.video.id) ?? { completed: false, lastPositionSec: 0 };

  return {
    course: { slug: course.slug, title: course.title },
    module: { id: row.module.id, title: row.module.title },
    video: {
      id: row.video.id,
      title: row.video.title,
      instructionsMd: row.video.instructionsMd,
      durationSec: row.video.durationSec,
      url: videoUrl,
      subtitlesUrl,
    },
    siblings: {
      prev: prev ? { id: prev.id, title: prev.title } : null,
      next: next ? { id: next.id, title: next.title } : null,
    },
    attachments: attachmentLinks,
    progress: p,
  };
}

export default function VideoPage({ loaderData }: Route.ComponentProps) {
  const { course, module, video, siblings, attachments, progress } = loaderData;
  const fetcher = useFetcher();

  function markComplete() {
    const body = new FormData();
    body.set("videoId", video.id);
    body.set("completed", "1");
    fetcher.submit(body, { method: "post", action: "/api/progress" });
  }

  return (
    <article className="flex flex-col gap-6">
      <nav className="text-sm text-off-black/60">
        <Link to="/courses" className="hover:underline">
          Mijn programma&apos;s
        </Link>
        <span className="mx-2">/</span>
        <Link to={`/courses/${course.slug}`} className="hover:underline">
          {course.title}
        </Link>
        <span className="mx-2">/</span>
        <span>{module.title}</span>
      </nav>

      <header>
        <p className="text-xs uppercase tracking-wide text-off-black/50">
          {module.title}
        </p>
        <h1 className="text-3xl">{video.title}</h1>
      </header>

      <VideoPlayer
        videoId={video.id}
        src={video.url}
        subtitlesUrl={video.subtitlesUrl}
        initialPositionSec={progress.lastPositionSec}
        onComplete={markComplete}
      />

      <section className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl">Instructies</h2>
          <button
            type="button"
            onClick={markComplete}
            disabled={progress.completed || fetcher.state !== "idle"}
            className="btn-secondary text-sm"
          >
            {progress.completed ? "Voltooid" : "Markeer als voltooid"}
          </button>
        </div>
        {video.instructionsMd ? (
          <p className="whitespace-pre-wrap text-off-black/80">
            {video.instructionsMd}
          </p>
        ) : (
          <p className="text-off-black/50">
            Geen specifieke instructies voor deze video.
          </p>
        )}
      </section>

      {attachments.length > 0 ? (
        <section className="card p-6">
          <h2 className="mb-3 text-xl">Documenten in deze module</h2>
          <ul className="flex flex-col gap-2">
            {attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-magenta hover:underline"
                >
                  <span aria-hidden>PDF</span>
                  <span>{a.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="mt-4 flex items-center justify-between text-sm">
        {siblings.prev ? (
          <Link
            to={`/courses/${course.slug}/${siblings.prev.id}`}
            className="btn-secondary"
          >
            ← {siblings.prev.title}
          </Link>
        ) : (
          <span />
        )}
        {siblings.next ? (
          <Link
            to={`/courses/${course.slug}/${siblings.next.id}`}
            className="btn-primary"
          >
            {siblings.next.title} →
          </Link>
        ) : (
          <Link to={`/courses/${course.slug}`} className="btn-primary">
            Terug naar overzicht
          </Link>
        )}
      </nav>
    </article>
  );
}
