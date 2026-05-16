import { sql } from "drizzle-orm";
import { Link } from "react-router";

import { requireAdmin } from "~/lib/auth.server";
import { PENDING_SUB_PREFIX } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import type { Route } from "./+types/admin.users._index";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "student" | "admin";
  auth0_sub: string;
  created_at: string;
  enrollment_count: number;
  completed_count: number;
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const result = await db.execute<UserRow>(sql`
    SELECT
      u.id,
      u.email,
      u.name,
      u.role,
      u.auth0_sub,
      u.created_at,
      (SELECT COUNT(*)::int FROM enrollments e
         WHERE e.user_id = u.id)        AS enrollment_count,
      (SELECT COUNT(*)::int FROM video_progress vp
         WHERE vp.user_id = u.id AND vp.completed_at IS NOT NULL)
                                        AS completed_count
    FROM users u
    ORDER BY u.created_at DESC
  `);
  const rows = result as unknown as UserRow[];

  return {
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      pending: r.auth0_sub.startsWith(PENDING_SUB_PREFIX),
      createdAt: r.created_at,
      enrollmentCount: r.enrollment_count,
      completedCount: r.completed_count,
    })),
  };
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("nl-NL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export default function AdminUsersIndex({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData;

  return (
    <section>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Cursisten</h1>
          <p className="text-off-black/70">
            Iedereen die ooit heeft ingelogd of door jou is toegevoegd.
          </p>
        </div>
      </header>

      {users.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-off-black/70">
            Nog geen cursisten. Voeg ze toe via een programma onder
            &quot;Cursisten beheren&quot;.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-butter-yellow/60 text-xs uppercase tracking-wide text-off-black/70">
              <tr>
                <th className="px-4 py-3">Cursist</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Toegevoegd</th>
                <th className="px-4 py-3 text-right">Programma&apos;s</th>
                <th className="px-4 py-3 text-right">Voltooide video&apos;s</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-off-black/5">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-seashell/60">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/users/${u.id}`}
                      className="block no-underline"
                    >
                      <div className="font-medium text-off-black">
                        {u.name ?? u.email}
                      </div>
                      <div className="text-xs text-off-black/50">{u.email}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === "admin" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-medium text-magenta">
                        Admin
                      </span>
                    ) : u.pending ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-harvest-gold/20 px-2 py-0.5 text-xs font-medium text-sienna">
                        Uitgenodigd
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-off-black/10 px-2 py-0.5 text-xs font-medium text-off-black/70">
                        Cursist
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-off-black/70">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.enrollmentCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.completedCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/users/${u.id}`}
                      className="text-magenta hover:underline"
                    >
                      Open →
                    </Link>
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
