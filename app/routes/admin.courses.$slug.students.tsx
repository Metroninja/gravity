import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import { data, Form, Link } from "react-router";

import { resolveRoleForEmail } from "~/lib/admins.server";
import { PENDING_SUB_PREFIX, requireAdmin } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { courses, enrollments, users } from "~/db/schema";
import type { Route } from "./+types/admin.courses.$slug.students";

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

  const enrolledRows = await db
    .select({
      enrollmentId: enrollments.id,
      enrolledAt: enrollments.enrolledAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      auth0Sub: users.auth0Sub,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .where(eq(enrollments.courseId, course.id))
    .orderBy(asc(users.email));

  return {
    course: { id: course.id, slug: course.slug, title: course.title },
    enrolled: enrolledRows.map((r) => ({
      enrollmentId: r.enrollmentId,
      enrolledAt: r.enrolledAt,
      userId: r.userId,
      email: r.email,
      name: r.name,
      role: r.role,
      pending: r.auth0Sub.startsWith(PENDING_SUB_PREFIX),
    })),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "remove") {
    const enrollmentId = form.get("enrollmentId");
    if (typeof enrollmentId !== "string") {
      return data({ error: "Inschrijving onbekend" }, { status: 400 });
    }
    await db
      .delete(enrollments)
      .where(
        and(
          eq(enrollments.id, enrollmentId),
          eq(enrollments.courseId, course.id),
        ),
      );
    return null;
  }

  // ---- Add by email ------------------------------------------------------
  const emailRaw = (form.get("email") as string | null)?.trim() ?? "";
  const name = ((form.get("name") as string | null) ?? "").trim() || null;
  if (!emailRaw) {
    return data({ error: "E-mailadres is verplicht" }, { status: 400 });
  }
  const email = emailRaw.toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return data({ error: "Geen geldig e-mailadres" }, { status: 400 });
  }

  // Find or create a user row keyed by lowercased email.
  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  let user = existing;
  if (!user) {
    const placeholderSub = `${PENDING_SUB_PREFIX}${randomUUID()}`;
    const role = resolveRoleForEmail(email);
    const [created] = await db
      .insert(users)
      .values({
        auth0Sub: placeholderSub,
        email,
        name,
        role,
      })
      .returning();
    user = created;
  } else if (name && !user.name) {
    await db.update(users).set({ name }).where(eq(users.id, user.id));
  }

  await db
    .insert(enrollments)
    .values({ userId: user.id, courseId: course.id })
    .onConflictDoNothing();

  return null;
}

function formatDate(value: string | Date) {
  try {
    return new Date(value).toLocaleDateString("nl-NL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
}

export default function CourseStudents({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { course, enrolled } = loaderData;
  const error = (actionData as { error?: string } | undefined)?.error;

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
          / Cursisten
        </p>
        <h1 className="mt-1 text-3xl">Cursisten voor &quot;{course.title}&quot;</h1>
        <p className="text-off-black/70">
          Geef toegang met een e-mailadres. Als de persoon nog niet heeft
          ingelogd ontstaat er een uitnodiging — bij eerste inlog krijgt hij/zij
          automatisch toegang.
        </p>
      </header>

      <article className="card p-6">
        <h2 className="mb-4 text-xl">Voeg cursist toe</h2>
        {error ? (
          <p className="mb-3 rounded-lg border border-burnt-sienna/40 bg-burnt-sienna/10 px-3 py-2 text-sm text-burnt-sienna">
            {error}
          </p>
        ) : null}
        <Form method="post" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">E-mailadres *</span>
            <input
              name="email"
              type="email"
              required
              placeholder="naam@voorbeeld.nl"
              className="rounded-lg border border-off-black/15 bg-white px-3 py-2 outline-none focus:border-magenta"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Naam (optioneel)</span>
            <input
              name="name"
              type="text"
              placeholder="Voornaam Achternaam"
              className="rounded-lg border border-off-black/15 bg-white px-3 py-2 outline-none focus:border-magenta"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Toegang geven
            </button>
          </div>
        </Form>
      </article>

      <article className="card overflow-hidden">
        <header className="border-b border-off-black/5 px-6 py-4">
          <h2 className="text-xl">
            Met toegang{" "}
            <span className="ml-1 text-sm font-normal text-off-black/60">
              ({enrolled.length})
            </span>
          </h2>
        </header>
        {enrolled.length === 0 ? (
          <p className="p-6 text-off-black/70">
            Nog geen cursisten ingeschreven voor dit programma.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-butter-yellow/60 text-xs uppercase tracking-wide text-off-black/70">
              <tr>
                <th className="px-6 py-3">Cursist</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Toegang sinds</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-off-black/5">
              {enrolled.map((e) => (
                <tr key={e.enrollmentId} className="hover:bg-seashell/60">
                  <td className="px-6 py-3">
                    <Link
                      to={`/admin/users/${e.userId}`}
                      className="block no-underline"
                    >
                      <div className="font-medium text-off-black">
                        {e.name ?? e.email}
                      </div>
                      <div className="text-xs text-off-black/50">{e.email}</div>
                    </Link>
                  </td>
                  <td className="px-6 py-3">
                    {e.role === "admin" ? (
                      <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-medium text-magenta">
                        Admin
                      </span>
                    ) : e.pending ? (
                      <span className="rounded-full bg-harvest-gold/20 px-2 py-0.5 text-xs font-medium text-sienna">
                        Uitgenodigd
                      </span>
                    ) : (
                      <span className="rounded-full bg-off-black/10 px-2 py-0.5 text-xs font-medium text-off-black/70">
                        Actief
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-off-black/70">
                    {formatDate(e.enrolledAt)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Form method="post">
                      <input type="hidden" name="intent" value="remove" />
                      <input
                        type="hidden"
                        name="enrollmentId"
                        value={e.enrollmentId}
                      />
                      <button
                        type="submit"
                        className="text-sm text-burnt-sienna hover:underline"
                      >
                        Intrekken
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
