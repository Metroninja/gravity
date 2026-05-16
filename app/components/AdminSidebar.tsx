import { Form, NavLink } from "react-router";

const NAV_ITEMS = [
  { to: "/admin/courses", label: "Programma's" },
  { to: "/admin/users", label: "Cursisten" },
];

export function AdminSidebar({ userName }: { userName: string }) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 border-b border-off-black/10 bg-white p-6 lg:h-dvh lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3">
        <img
          src="/brand/icon-magenta.png"
          alt=""
          width={36}
          height={36}
          className="rounded-md"
        />
        <div>
          <p className="font-display text-lg leading-tight">Beheer</p>
          <p className="text-xs text-off-black/60">{userName}</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={false}
            className={({ isActive }) =>
              "rounded-lg px-3 py-2 text-sm no-underline " +
              (isActive
                ? "bg-magenta text-white"
                : "text-off-black hover:bg-butter-yellow")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 text-sm">
        <NavLink
          to="/courses"
          className="text-off-black/70 no-underline hover:text-magenta"
        >
          ← Cursistweergave
        </NavLink>
        <Form method="post" action="/auth/logout">
          <button
            type="submit"
            className="text-off-black/70 hover:text-magenta"
          >
            Uitloggen
          </button>
        </Form>
      </div>
    </aside>
  );
}
