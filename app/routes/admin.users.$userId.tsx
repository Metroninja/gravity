import { and, asc, eq, notInArray } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";

import { PENDING_SUB_PREFIX, requireAdmin } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { courses, enrollments, users } from "~/db/schema";
import type { Route } from "./+types/admin.users.$userId";

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);
  if (!user) {
    throw data({ message: "Cursist niet gevonden" }, { status: 404 });
  }

  const enrolledRows = await db
    .select({
      enrollmentId: enrollments.id,
      enrolledAt: enrollments.enrolledAt,
      courseId: courses.id,
      slug: courses.slug,
      title: courses.title,
      published: courses.published,
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(eq(enrollments.userId, user.id))
    .orderBy(asc(courses.sortOrder), asc(courses.title));

  const enrolledIds = enrolledRows.map((r) => r.courseId);
  const available =
    enrolledIds.length > 0
      ? await db
          .select()
          .from(courses)
          .where(notInArray(courses.id, enrolledIds))
          .orderBy(asc(courses.sortOrder), asc(courses.title))
      : await db.select().from(courses).orderBy(asc(courses.sortOrder), asc(courses.title));

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      pending: user.auth0Sub.startsWith(PENDING_SUB_PREFIX),
      createdAt: user.createdAt,
    },
    enrolled: enrolledRows.map((r) => ({
      enrollmentId: r.enrollmentId,
      enrolledAt: r.enrolledAt,
      slug: r.slug,
      title: r.title,
      published: r.published,
    })),
    available: available.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      published: c.published,
    })),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  await requireAdmin(request);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);
  if (!user) {
    throw data({ message: "Cursist niet gevonden" }, { status: 404 });
  }

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "enroll") {
    const courseId = form.get("courseId");
    if (typeof courseId !== "string" || !courseId) {
      return data({ error: "Programma is verplicht" }, { status: 400 });
    }
    await db
      .insert(enrollments)
      .values({ userId: user.id, courseId })
      .onConflictDoNothing();
    return null;
  }

  if (intent === "unenroll") {
    const enrollmentId = form.get("enrollmentId");
    if (typeof enrollmentId !== "string" || !enrollmentId) {
      return data({ error: "Inschrijving onbekend" }, { status: 400 });
    }
    await db
      .delete(enrollments)
      .where(
        and(eq(enrollments.id, enrollmentId), eq(enrollments.userId, user.id)),
      );
    return null;
  }

  if (intent === "delete-user") {
    if (user.role === "admin") {
      return data({ error: "Admins kun je niet verwijderen via deze knop" }, { status: 400 });
    }
    await db.delete(users).where(eq(users.id, user.id));
    return redirect("/admin/users");
  }

  return data({ error: "Onbekende actie" }, { status: 400 });
}

function formatDate(value: string | Date) {
  try {
    return new Date(value).toLocaleString("nl-NL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
}

export default function UserDetail({ loaderData }: Route.ComponentProps) {
  const { user, enrolled, available } = loaderData;

  return (
    <section className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-off-black/60">
          <Link to="/admin/users" className="hover:underline">
            Cursisten
          </Link>{" "}
          / {user.name ?? user.email}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">{user.name ?? user.email}</h1>
          {user.role === "admin" ? (
            <span className="rounded-full bg-magenta/10 px-3 py-1 text-xs font-medium text-magenta">
              Admin
            </span>
          ) : user.pending ? (
            <span className="rounded-full bg-harvest-gold/20 px-3 py-1 text-xs font-medium text-sienna">
              Uitgenodigd (nog niet ingelogd)
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-off-black/70">{user.email}</p>
        <p className="mt-1 text-xs text-off-black/50">
          Toegevoegd op {formatDate(user.createdAt)}
        </p>
      </header>

      <article className="card p-6">
        <h2 className="mb-4 text-xl">Toegang tot programma&apos;s</h2>
        {enrolled.length === 0 ? (
          <p className="mb-4 text-off-black/70">
            Deze cursist heeft nog geen toegang tot programma&apos;s.
          </p>
        ) : (
          <ul className="divide-y divide-off-black/5">
            {enrolled.map((e) => (
              <li
                key={e.enrollmentId}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <Link
                    to={`/admin/courses/${e.slug}/edit`}
                    className="font-medium text-off-black no-underline hover:text-magenta"
                  >
                    {e.title}
                  </Link>
                  <p className="text-xs text-off-black/50">
                    Toegang sinds {formatDate(e.enrolledAt)}
                    {e.published ? "" : " · concept"}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="unenroll" />
                  <input
                    type="hidden"
                    name="enrollmentId"
                    value={e.enrollmentId}
                  />
                  <button
                    type="submit"
                    className="text-sm text-burnt-sienna hover:underline"
                  >
                    Toegang intrekken
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 ? (
          <Form
            method="post"
            className="mt-6 flex flex-wrap items-end gap-3 border-t border-off-black/5 pt-6"
          >
            <input type="hidden" name="intent" value="enroll" />
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium">Geef toegang tot</span>
              <select
                name="courseId"
                required
                className="rounded-lg border border-off-black/15 bg-white px-3 py-2 text-off-black outline-none focus:border-magenta"
              >
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} {c.published ? "" : "(concept)"}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-primary">
              Toevoegen
            </button>
          </Form>
        ) : (
          <p className="mt-6 border-t border-off-black/5 pt-6 text-sm text-off-black/60">
            Geen programma&apos;s meer over om toegang voor te geven.
          </p>
        )}
      </article>

      {user.role !== "admin" ? (
        <Form
          method="post"
          onSubmit={(e) => {
            if (
              !confirm(
                "Dit verwijdert de cursist en alle voortgang. Doorgaan?",
              )
            ) {
              e.preventDefault();
            }
          }}
          className="self-start"
        >
          <input type="hidden" name="intent" value="delete-user" />
          <button
            type="submit"
            className="text-sm font-medium text-burnt-sienna hover:underline"
          >
            Verwijder cursist
          </button>
        </Form>
      ) : null}
    </section>
  );
}
