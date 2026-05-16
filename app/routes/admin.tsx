import { Outlet } from "react-router";

import { AdminSidebar } from "~/components/AdminSidebar";
import { requireAdmin } from "~/lib/auth.server";
import type { Route } from "./+types/admin";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  return {
    user: { id: user.id, name: user.name, email: user.email },
  };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-seashell lg:flex-row">
      <AdminSidebar userName={loaderData.user.name ?? loaderData.user.email} />
      <main className="flex-1 px-6 py-8 lg:overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
