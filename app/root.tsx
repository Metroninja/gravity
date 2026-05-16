import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";

import type { Route } from "./+types/root";
import stylesheet from "./styles/tailwind.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
  { rel: "icon", href: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
  { rel: "preconnect", href: "https://storage.googleapis.com" },
];

export const meta: Route.MetaFunction = () => [
  { title: "Janneke van der Wouw" },
  {
    name: "description",
    content:
      "The private learning environment for clients of Janneke van der Wouw.",
  },
  { name: "theme-color", content: "#B62F73" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-status-bar-style", content: "default" },
  { name: "apple-mobile-web-app-title", content: "Janneke" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Er is iets misgegaan";
  let detail = "Probeer de pagina te verversen of kom later terug.";
  let status: number | undefined;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    title = error.status === 404 ? "Niet gevonden" : `Fout ${error.status}`;
    detail = error.statusText || detail;
  } else if (error instanceof Error && process.env.NODE_ENV !== "production") {
    detail = error.message;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      {status ? (
        <p className="font-display text-7xl text-magenta">{status}</p>
      ) : null}
      <h1 className="text-3xl">{title}</h1>
      <p className="text-off-black/70">{detail}</p>
      <a href="/" className="btn-primary">
        Naar de homepagina
      </a>
    </main>
  );
}
