import { and, asc, eq, ne, sql } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";

import { CourseForm, type CourseFormValues } from "~/components/CourseForm";
import { requireAdmin } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { deleteObject, getReadUrl } from "~/lib/storage.server";
import { slugify } from "~/lib/slug";
import { courses, modules } from "~/db/schema";
import type { Route } from "./+types/admin.courses.$slug.edit";

type ModuleRow = {
  id: string;
  title: string;
  sort_order: number;
  video_count: number;
  attachment_count: number;
};

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

  const moduleResult = await db.execute<ModuleRow>(sql`
    SELECT
      m.id,
      m.title,
      m.sort_order,
      (SELECT COUNT(*)::int FROM videos v WHERE v.module_id = m.id) AS video_count,
      (SELECT COUNT(*)::int FROM attachments a WHERE a.module_id = m.id) AS attachment_count
    FROM modules m
    WHERE m.course_id = ${course.id}
    ORDER BY m.sort_order ASC, m.title ASC
  `);
  const moduleRows = moduleResult as unknown as ModuleRow[];

  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
    },
    values: {
      title: course.title,
      slug: course.slug,
      tagline: course.tagline,
      description: course.description,
      coverKey: course.coverKey,
      coverPreviewUrl: course.coverKey
        ? await getReadUrl(course.coverKey, 60 * 10)
        : null,
      sortOrder: course.sortOrder,
      published: course.published,
      publicLanding: course.publicLanding,
      priceCents: course.priceCents,
      currency: course.currency,
    } satisfies CourseFormValues,
    modules: moduleRows.map((m) => ({
      id: m.id,
      title: m.title,
      sortOrder: m.sort_order,
      videoCount: m.video_count,
      attachmentCount: m.attachment_count,
    })),
  };
}

async function moveModule(
  courseId: string,
  moduleId: string,
  dir: "up" | "down",
) {
  // Reorder within the scope of one course. Two-step swap goes via a
  // temporary -1 sort_order to avoid colliding with the unique sort if we
  // ever add one (we don't today, but cheap insurance).
  const [current] = await db
    .select({ id: modules.id, sortOrder: modules.sortOrder })
    .from(modules)
    .where(and(eq(modules.id, moduleId), eq(modules.courseId, courseId)));
  if (!current) return;

  const neighbour =
    dir === "up"
      ? await db
          .select()
          .from(modules)
          .where(
            and(
              eq(modules.courseId, courseId),
              sql`${modules.sortOrder} < ${current.sortOrder}`,
            ),
          )
          .orderBy(sql`${modules.sortOrder} DESC`)
          .limit(1)
      : await db
          .select()
          .from(modules)
          .where(
            and(
              eq(modules.courseId, courseId),
              sql`${modules.sortOrder} > ${current.sortOrder}`,
            ),
          )
          .orderBy(asc(modules.sortOrder))
          .limit(1);

  const other = neighbour[0];
  if (!other) return;

  await db.transaction(async (tx) => {
    await tx.update(modules).set({ sortOrder: -1 }).where(eq(modules.id, current.id));
    await tx
      .update(modules)
      .set({ sortOrder: current.sortOrder })
      .where(eq(modules.id, other.id));
    await tx
      .update(modules)
      .set({ sortOrder: other.sortOrder })
      .where(eq(modules.id, current.id));
  });
}

export async function action({ params, request }: Route.ActionArgs) {
  await requireAdmin(request);

  const [existing] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, params.slug))
    .limit(1);
  if (!existing) {
    throw data({ message: "Programma niet gevonden" }, { status: 404 });
  }

  const form = await request.formData();
  const intent = form.get("intent");

  // ---- Module sub-actions ------------------------------------------------
  if (intent === "create-module") {
    const title = ((form.get("title") as string) ?? "").trim();
    if (!title) {
      return data({ moduleError: "Titel is verplicht" }, { status: 400 });
    }
    const max = await db
      .select({ m: sql<number>`COALESCE(MAX(${modules.sortOrder}), -1)::int` })
      .from(modules)
      .where(eq(modules.courseId, existing.id));
    const nextSort = (max[0]?.m ?? -1) + 1;
    const [created] = await db
      .insert(modules)
      .values({ courseId: existing.id, title, sortOrder: nextSort })
      .returning();
    return redirect(`/admin/courses/${existing.slug}/modules/${created.id}`);
  }

  if (intent === "delete-module") {
    const moduleId = form.get("moduleId");
    if (typeof moduleId !== "string") {
      return data({ moduleError: "Module onbekend" }, { status: 400 });
    }
    await db
      .delete(modules)
      .where(and(eq(modules.id, moduleId), eq(modules.courseId, existing.id)));
    return null;
  }

  if (intent === "move-module-up" || intent === "move-module-down") {
    const moduleId = form.get("moduleId");
    if (typeof moduleId !== "string") return null;
    await moveModule(
      existing.id,
      moduleId,
      intent === "move-module-up" ? "up" : "down",
    );
    return null;
  }

  // ---- Delete course -----------------------------------------------------
  if (intent === "delete") {
    const oldCoverKey = existing.coverKey;
    await db.delete(courses).where(eq(courses.id, existing.id));
    if (oldCoverKey) await deleteObject(oldCoverKey);
    return redirect("/admin/courses");
  }

  // ---- Update course -----------------------------------------------------
  const title = ((form.get("title") as string) ?? "").trim();
  const slugRaw = ((form.get("slug") as string) ?? "").trim();
  const tagline = ((form.get("tagline") as string) ?? "").trim();
  const description = ((form.get("description") as string) ?? "").trim();
  const newCoverKey = ((form.get("coverKey") as string) ?? "").trim() || null;
  const sortOrder = Number.parseInt(
    (form.get("sortOrder") as string) ?? "0",
    10,
  );
  const published = form.get("published") === "on";
  const publicLanding = form.get("publicLanding") === "on";
  const priceEurosRaw = ((form.get("priceEuros") as string) ?? "").trim();
  const priceCents = parsePriceCents(priceEurosRaw);
  const slug = slugify(slugRaw || title);

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Titel is verplicht.";
  if (!slug) errors.slug = "Slug is verplicht.";
  if (slug && !/^[a-z0-9-]+$/.test(slug)) {
    errors.slug = "Alleen kleine letters, cijfers en streepjes.";
  }
  if (Number.isNaN(sortOrder) || sortOrder < 0) {
    errors.sortOrder = "Volgorde moet een positief getal zijn.";
  }
  if (priceCents === "invalid") {
    errors.priceCents = "Prijs moet een positief getal zijn.";
  }

  const resolvedPriceCents = priceCents === "invalid" ? null : priceCents;

  if (Object.keys(errors).length > 0) {
    return data(
      {
        errors,
        values: {
          title,
          slug,
          tagline,
          description,
          coverKey: newCoverKey,
          coverPreviewUrl: newCoverKey
            ? await getReadUrl(newCoverKey, 60 * 10)
            : null,
          sortOrder: Number.isNaN(sortOrder) ? 0 : sortOrder,
          published,
          publicLanding,
          priceCents: resolvedPriceCents,
          currency: existing.currency,
        } satisfies CourseFormValues,
      },
      { status: 400 },
    );
  }

  if (slug !== existing.slug) {
    const dupe = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.slug, slug), ne(courses.id, existing.id)))
      .limit(1);
    if (dupe.length > 0) {
      return data(
        {
          errors: { slug: "Deze slug is al in gebruik." },
          values: {
            title,
            slug,
            tagline,
            description,
            coverKey: newCoverKey,
            coverPreviewUrl: newCoverKey
              ? await getReadUrl(newCoverKey, 60 * 10)
              : null,
            sortOrder,
            published,
            publicLanding,
            priceCents: resolvedPriceCents,
            currency: existing.currency,
          } satisfies CourseFormValues,
        },
        { status: 400 },
      );
    }
  }

  await db
    .update(courses)
    .set({
      title,
      slug,
      tagline,
      description,
      coverKey: newCoverKey,
      sortOrder,
      published,
      publicLanding,
      priceCents: resolvedPriceCents,
    })
    .where(eq(courses.id, existing.id));

  if (existing.coverKey && existing.coverKey !== newCoverKey) {
    await deleteObject(existing.coverKey);
  }

  return redirect(`/admin/courses/${slug}/edit`);
}

function parsePriceCents(raw: string): number | null | "invalid" {
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num) || num < 0) return "invalid";
  return Math.round(num * 100);
}

export default function EditCoursePage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const values =
    "values" in (actionData ?? {})
      ? ((actionData as { values: CourseFormValues }).values ?? loaderData.values)
      : loaderData.values;
  const errors =
    "errors" in (actionData ?? {})
      ? ((actionData as { errors: Record<string, string> }).errors ?? {})
      : {};

  return (
    <section className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-off-black/60">
          <Link to="/admin/courses" className="hover:underline">
            Programma&apos;s
          </Link>{" "}
          / {loaderData.course.title}
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl">Programma bewerken</h1>
          <Link
            to={`/admin/courses/${loaderData.course.slug}/students`}
            className="btn-secondary"
          >
            Cursisten beheren →
          </Link>
        </div>
      </header>

      <article className="card max-w-2xl p-6">
        <h2 className="mb-4 text-xl">Basisgegevens</h2>
        <CourseForm mode="edit" initial={values} errors={errors} />
      </article>

      <article className="card overflow-hidden">
        <header className="flex items-center justify-between border-b border-off-black/5 px-6 py-4">
          <div>
            <h2 className="text-xl">Modules</h2>
            <p className="text-sm text-off-black/60">
              Iedere module bevat één of meer video&apos;s en optioneel
              PDF&apos;s.
            </p>
          </div>
        </header>

        {loaderData.modules.length === 0 ? (
          <p className="px-6 py-8 text-off-black/70">
            Nog geen modules. Maak er hieronder een aan om te beginnen.
          </p>
        ) : (
          <ol className="divide-y divide-off-black/5">
            {loaderData.modules.map((m, idx) => (
              <li
                key={m.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-seashell/60"
              >
                <span className="font-display text-2xl text-magenta/50 tabular-nums">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <Link
                  to={`/admin/courses/${loaderData.course.slug}/modules/${m.id}`}
                  className="flex-1 no-underline"
                >
                  <p className="font-medium text-off-black">{m.title}</p>
                  <p className="text-xs text-off-black/50">
                    {m.videoCount} video&apos;s · {m.attachmentCount} PDF&apos;s
                  </p>
                </Link>

                <Form method="post" className="flex items-center gap-1">
                  <input type="hidden" name="moduleId" value={m.id} />
                  <button
                    type="submit"
                    name="intent"
                    value="move-module-up"
                    disabled={idx === 0}
                    className="rounded-md p-1.5 text-off-black/60 hover:bg-butter-yellow disabled:opacity-30"
                    aria-label="Verplaats omhoog"
                  >
                    ↑
                  </button>
                  <button
                    type="submit"
                    name="intent"
                    value="move-module-down"
                    disabled={idx === loaderData.modules.length - 1}
                    className="rounded-md p-1.5 text-off-black/60 hover:bg-butter-yellow disabled:opacity-30"
                    aria-label="Verplaats omlaag"
                  >
                    ↓
                  </button>
                </Form>

                <Link
                  to={`/admin/courses/${loaderData.course.slug}/modules/${m.id}`}
                  className="text-sm text-magenta hover:underline"
                >
                  Bewerken →
                </Link>

                <Form
                  method="post"
                  onSubmit={(e) => {
                    if (
                      !confirm(
                        `Verwijder module "${m.title}" en alle video's/PDF's daarin?`,
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="delete-module" />
                  <input type="hidden" name="moduleId" value={m.id} />
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

        <Form
          method="post"
          className="flex flex-wrap items-end gap-3 border-t border-off-black/5 bg-seashell/60 px-6 py-4"
        >
          <input type="hidden" name="intent" value="create-module" />
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="font-medium">Nieuwe module</span>
            <input
              name="title"
              type="text"
              required
              maxLength={200}
              placeholder="Bijv. Module 3 — Verdieping"
              className="rounded-lg border border-off-black/15 bg-white px-3 py-2 outline-none focus:border-magenta"
            />
          </label>
          <button type="submit" className="btn-primary">
            Module toevoegen
          </button>
        </Form>
      </article>

      <article className="card border border-burnt-sienna/30 bg-burnt-sienna/5 p-6">
        <h2 className="mb-1 text-lg text-burnt-sienna">Gevarenzone</h2>
        <p className="mb-4 text-sm text-off-black/70">
          Het verwijderen van een programma is onomkeerbaar en haalt ook alle
          modules, video&apos;s, PDF&apos;s en cursistvoortgang weg.
        </p>
        <Form
          method="post"
          onSubmit={(e) => {
            if (
              !confirm(
                "Dit verwijdert het programma met alle modules, video's en cursistvoortgang. Doorgaan?",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <button type="submit" className="btn-secondary text-burnt-sienna">
            Verwijder programma
          </button>
        </Form>
      </article>
    </section>
  );
}
