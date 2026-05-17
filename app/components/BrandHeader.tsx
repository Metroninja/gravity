import { Form, Link } from "react-router";

type Props = {
  userName: string | null;
  isAdmin?: boolean;
  isAuthenticated?: boolean;
};

export function BrandHeader({
  userName,
  isAdmin = false,
  isAuthenticated = true,
}: Props) {
  return (
    <header className="border-b border-off-black/10 bg-seashell/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link
          to={isAuthenticated ? "/courses" : "/"}
          className="flex items-center gap-3 no-underline"
        >
          <img
            src="/brand/icon-magenta.png"
            alt=""
            width={36}
            height={36}
            className="rounded-md"
          />
          <span className="font-display text-xl text-off-black">
            Janneke van der Wouw
          </span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {isAdmin ? (
            <Link
              to="/admin/courses"
              className="rounded-full border border-magenta px-3 py-1 text-magenta no-underline hover:bg-magenta hover:text-white"
            >
              Beheer
            </Link>
          ) : null}
          {userName ? (
            <span className="hidden text-off-black/70 sm:inline">
              {userName}
            </span>
          ) : null}
          {isAuthenticated ? (
            <Form method="post" action="/auth/logout">
              <button
                type="submit"
                className="text-off-black/70 hover:text-magenta"
              >
                Uitloggen
              </button>
            </Form>
          ) : (
            <Link
              to="/login"
              className="rounded-full bg-magenta px-3 py-1 text-white no-underline hover:bg-magenta/90"
            >
              Inloggen
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
