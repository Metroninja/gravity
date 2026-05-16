import { Form } from "react-router";

import { startLogin } from "~/lib/auth.server";
import type { Route } from "./+types/login";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const returnTo = (formData.get("returnTo") as string | null) ?? "/courses";
  return startLogin(request, returnTo);
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return { returnTo: url.searchParams.get("returnTo") ?? "/courses" };
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  return (
    <main className="grid min-h-dvh place-items-center bg-seashell px-6">
      <div className="card w-full max-w-md p-10 text-center">
        <img
          src="/brand/logo-magenta.png"
          alt="Janneke van der Wouw"
          width={200}
          className="mx-auto mb-8"
        />
        <h1 className="mb-2 text-3xl">Welkom terug</h1>
        <p className="mb-8 text-off-black/70">
          Log in om je programma te bekijken.
        </p>
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="returnTo" value={loaderData.returnTo} />
          <button type="submit" className="btn-primary">
            Inloggen
          </button>
          <p className="text-sm text-off-black/60">
            Je kunt inloggen met je e-mailadres of met Google.
          </p>
        </Form>
      </div>
    </main>
  );
}
