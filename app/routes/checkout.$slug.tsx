import { eq } from "drizzle-orm";
import { data, redirect } from "react-router";

import { getUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { appEnv } from "~/lib/env.server";
import { createCheckoutSession } from "~/lib/stripe.server";
import { courses } from "~/db/schema";
import type { Route } from "./+types/checkout.$slug";

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data({ message: "Method not allowed" }, { status: 405 });
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, params.slug))
    .limit(1);

  if (!course) {
    throw data({ message: "Programma niet gevonden" }, { status: 404 });
  }
  if (!course.publicLanding) {
    throw data({ message: "Programma niet te koop" }, { status: 404 });
  }
  if (course.priceCents == null || course.priceCents <= 0) {
    throw data({ message: "Geen prijs ingesteld" }, { status: 400 });
  }

  const user = await getUser(request);
  const baseUrl = appEnv().APP_BASE_URL;

  const session = await createCheckoutSession({
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      priceCents: course.priceCents,
      currency: course.currency,
    },
    userId: user?.id ?? null,
    buyerEmail: user?.email ?? null,
    baseUrl,
  });

  if (!session.url) {
    throw data({ message: "Kon Stripe sessie niet maken" }, { status: 500 });
  }

  return redirect(session.url, 303);
}

export async function loader() {
  // GET on this route is meaningless; bounce visitors back to the landing.
  return redirect("/");
}
