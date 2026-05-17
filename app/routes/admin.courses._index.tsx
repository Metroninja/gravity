import { sql } from "drizzle-orm";
import { Link } from "react-router";

import { requireAdmin } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { getReadUrl } from "~/lib/storage.server";
import type { Route } from "./+types/admin.courses._index";

type CourseListRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_key: string | null;
  published: boolean;
  public_landing: boolean;
  price_cents: number | null;
  currency: string;
  sort_order: number;
  module_count: number;
  video_count: number;
  attachment_count: number;
  enrollment_count: number;
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  // Single query with correlated subqueries. We hand-roll the SQL to keep
  // every table reference fully qualified — Drizzle's `$count` helper
  // produces an unqualified `id` reference that Postgres rejects as
  // ambiguous when stacked with other subqueries.
  const result = await db.execute<CourseListRow>(sql`
    SELECT
      c.id,
      c.slug,
      c.title,
      c.description,
      c.cover_key,
      c.published,
      c.public_landing,
      c.price_cents,
      c.currency,
      c.sort_order,
      (SELECT COUNT(*)::int FROM modules m
         WHERE m.course_id = c.id)                          AS module_count,
      (SELECT COUNT(*)::int FROM videos v
         JOIN modules m ON m.id = v.module_id
         WHERE m.course_id = c.id)                          AS video_count,
      (SELECT COUNT(*)::int FROM attachments a
         JOIN modules m ON m.id = a.module_id
         WHERE m.course_id = c.id)                          AS attachment_count,
      (SELECT COUNT(*)::int FROM enrollments e
         WHERE e.course_id = c.id)                          AS enrollment_count
    FROM courses c
    ORDER BY c.sort_order ASC, c.title ASC
  `);
  const rows = result as unknown as CourseListRow[];

  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      published: r.published,
      publicLanding: r.public_landing,
      priceCents: r.price_cents,
      currency: r.currency,
      sortOrder: r.sort_order,
      moduleCount: r.module_count,
      videoCount: r.video_count,
      attachmentCount: r.attachment_count,
      enrollmentCount: r.enrollment_count,
      coverUrl: r.cover_key ? await getReadUrl(r.cover_key, 60 * 30) : null,
    })),
  );

  return { items };
}

export default function AdminCoursesIndex({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;

  return (
    <section>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Programma&apos;s</h1>
          <p className="text-off-black/70">
            Maak, bewerk en publiceer de programma&apos;s die je cursisten zien.
          </p>
        </div>
        <Link to="/admin/courses/new" className="btn-primary">
          + Nieuw programma
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <h2 className="mb-2 text-xl">Nog geen programma&apos;s</h2>
          <p className="mb-6 text-off-black/70">
            Maak je eerste programma aan en voeg modules, video&apos;s en
            werkbladen toe.
          </p>
          <Link to="/admin/courses/new" className="btn-primary">
            Eerste programma aanmaken
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-butter-yellow/60 text-xs uppercase tracking-wide text-off-black/70">
              <tr>
                <th className="px-4 py-3">Programma</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Prijs</th>
                <th className="px-4 py-3 text-right">Modules</th>
                <th className="px-4 py-3 text-right">Video&apos;s</th>
                <th className="px-4 py-3 text-right">PDF&apos;s</th>
                <th className="px-4 py-3 text-right">Cursisten</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-off-black/5">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-seashell/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-butter-yellow">
                        {c.coverUrl ? (
                          <img
                            src={c.coverUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center font-display text-xl text-magenta">
                            J
                          </div>
                        )}
                      </div>
                      <div>
                        <Link
                          to={`/admin/courses/${c.slug}/edit`}
                          className="font-medium text-off-black no-underline hover:text-magenta"
                        >
                          {c.title}
                        </Link>
                        <p className="text-xs text-off-black/50">/{c.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.published ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-medium text-magenta">
                          <span className="size-1.5 rounded-full bg-magenta" />
                          Live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-off-black/10 px-2 py-0.5 text-xs font-medium text-off-black/70">
                          <span className="size-1.5 rounded-full bg-off-black/40" />
                          Concept
                        </span>
                      )}
                      {c.publicLanding ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-butter-yellow px-2 py-0.5 text-xs font-medium text-black-bean">
                          Publiek
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.priceCents != null
                      ? formatPrice(c.priceCents, c.currency)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.moduleCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.videoCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.attachmentCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.enrollmentCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3 text-sm">
                      {c.publicLanding ? (
                        <a
                          href={`/courses/${c.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-off-black/70 hover:text-magenta hover:underline"
                        >
                          Landingspagina
                        </a>
                      ) : null}
                      <Link
                        to={`/admin/courses/${c.slug}/students`}
                        className="text-off-black/70 hover:text-magenta hover:underline"
                      >
                        Cursisten
                      </Link>
                      <Link
                        to={`/admin/courses/${c.slug}/edit`}
                        className="text-magenta hover:underline"
                      >
                        Bewerken →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatPrice(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `€ ${(cents / 100).toFixed(2)}`;
  }
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message =
    error instanceof Error ? error.message : "Onbekende fout";
  return (
    <section className="card p-10">
      <h1 className="mb-2 text-2xl">Beheer kon niet geladen worden</h1>
      <p className="text-off-black/70">{message}</p>
    </section>
  );
}
