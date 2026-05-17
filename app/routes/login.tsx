import { Form, redirect } from "react-router";

import { getUserId, startLogin } from "~/lib/auth.server";
import type { Route } from "./+types/login";

/**
 * Only allow returnTo URLs that point back into this app, to avoid an open
 * redirect via `?returnTo=https://evil.example`.
 */
function safeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) return "/courses";
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return "/courses";
  return returnTo;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const returnTo = safeReturnTo(formData.get("returnTo") as string | null);
  const screenHintRaw = formData.get("screenHint");
  const loginHintRaw = formData.get("loginHint");
  const screenHint =
    screenHintRaw === "signup" || screenHintRaw === "login"
      ? screenHintRaw
      : undefined;
  const loginHint = typeof loginHintRaw === "string" && loginHintRaw.length > 0
    ? loginHintRaw
    : undefined;
  return startLogin(request, { returnTo, screenHint, loginHint });
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));

  // Already logged in? Skip the login form entirely and go where they meant to.
  const userId = await getUserId(request);
  if (userId) {
    throw redirect(returnTo);
  }

  const screenHintRaw = url.searchParams.get("screen_hint");
  const screenHint: "signup" | "login" | null =
    screenHintRaw === "signup" || screenHintRaw === "login"
      ? screenHintRaw
      : null;
  return {
    returnTo,
    screenHint,
    loginHint: url.searchParams.get("login_hint") ?? "",
  };
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const isSignup = loaderData.screenHint === "signup";
  return (
    <main className="grid min-h-dvh place-items-center bg-seashell px-6">
      <div className="card w-full max-w-md p-10 text-center">
        <img
          src="/brand/logo-magenta.png"
          alt="Janneke van der Wouw"
          width={200}
          className="mx-auto mb-8"
        />
        <h1 className="mb-2 text-3xl">
          {isSignup ? "Maak je account aan" : "Welkom terug"}
        </h1>
        <p className="mb-8 text-off-black/70">
          {isSignup
            ? "Bijna klaar! Maak je account aan om je cursus te starten."
            : "Log in om je programma te bekijken."}
        </p>
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="returnTo" value={loaderData.returnTo} />
          {loaderData.screenHint ? (
            <input
              type="hidden"
              name="screenHint"
              value={loaderData.screenHint}
            />
          ) : null}
          {loaderData.loginHint ? (
            <input
              type="hidden"
              name="loginHint"
              value={loaderData.loginHint}
            />
          ) : null}
          <button type="submit" className="btn-primary">
            {isSignup ? "Doorgaan" : "Inloggen"}
          </button>
          <p className="text-sm text-off-black/60">
            {isSignup
              ? "Je kunt een account maken met je e-mailadres of met Google."
              : "Je kunt inloggen met je e-mailadres of met Google."}
          </p>
        </Form>
      </div>
    </main>
  );
}
