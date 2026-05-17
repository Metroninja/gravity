import { asc } from "drizzle-orm";
import { Outlet } from "react-router";

import { BrandFooter } from "~/components/BrandFooter";
import { BrandHeader } from "~/components/BrandHeader";
import { getUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { externalLinks } from "~/db/schema";
import type { Route } from "./+types/_app";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  const links = await db
    .select()
    .from(externalLinks)
    .orderBy(asc(externalLinks.sortOrder));
  return { user, links };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <div className="flex min-h-dvh flex-col bg-seashell">
      <BrandHeader
        userName={user ? (user.name ?? user.email) : null}
        isAdmin={user?.role === "admin"}
        isAuthenticated={!!user}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <BrandFooter links={loaderData.links} />
    </div>
  );
}
