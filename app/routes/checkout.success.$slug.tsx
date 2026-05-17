import { and, eq } from "drizzle-orm";
import { Link, data, redirect } from "react-router";

import { getUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { getStripe } from "~/lib/stripe.server";
import { courses, enrollments } from "~/db/schema";
import type { Route } from "./+types/checkout.success.$slug";

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    return redirect(`/courses/${params.slug}`);
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, params.slug))
    .limit(1);

  if (!course) {
    throw data({ message: "Programma niet gevonden" }, { status: 404 });
  }

  const session = await getStripe().checkout.sessions.retrieve(sessionId);

  // Sanity-check that this session belongs to this course.
  if (session.metadata?.courseId && session.metadata.courseId !== course.id) {
    throw data({ message: "Sessie hoort niet bij dit programma" }, { status: 400 });
  }

  const buyerEmail = session.customer_details?.email ?? session.customer_email ?? null;
  const paid = session.payment_status === "paid";
  const user = await getUser(request);

  let alreadyEnrolled = false;
  if (user) {
    const [row] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, user.id),
          eq(enrollments.courseId, course.id),
        ),
      )
      .limit(1);
    alreadyEnrolled = !!row;
  }

  // Logged-in buyer who is already enrolled: just send them straight in.
  if (user && alreadyEnrolled) {
    return redirect(`/courses/${course.slug}`);
  }

  return {
    course: { slug: course.slug, title: course.title },
    paid,
    buyerEmail,
    isLoggedIn: !!user,
  };
}

export default function CheckoutSuccess({ loaderData }: Route.ComponentProps) {
  const { course, paid, buyerEmail, isLoggedIn } = loaderData;

  const signupHref = `/login?screen_hint=signup&returnTo=${encodeURIComponent(
    `/courses/${course.slug}`,
  )}${buyerEmail ? `&login_hint=${encodeURIComponent(buyerEmail)}` : ""}`;
  const loginHref = `/login?returnTo=${encodeURIComponent(
    `/courses/${course.slug}`,
  )}${buyerEmail ? `&login_hint=${encodeURIComponent(buyerEmail)}` : ""}`;

  return (
    <section className="card mx-auto max-w-xl p-8 text-center">
      <h1 className="mb-3 text-3xl">
        {paid ? "Bedankt voor je aankoop!" : "Bedankt!"}
      </h1>
      <p className="mb-6 text-off-black/80">
        {paid
          ? `Je hebt toegang tot "${course.title}".`
          : `We verwerken je betaling voor "${course.title}". Zodra de betaling binnen is krijg je toegang.`}
      </p>

      {isLoggedIn ? (
        <Link to={`/courses/${course.slug}`} className="btn-primary no-underline">
          Ga naar de cursus
        </Link>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Link to={signupHref} className="btn-primary no-underline">
            Maak je account aan
          </Link>
          <Link
            to={loginHref}
            className="text-sm text-off-black/70 hover:text-magenta"
          >
            Heb je al een account? Inloggen
          </Link>
          {buyerEmail ? (
            <p className="mt-2 text-xs text-off-black/50">
              Gebruik <strong>{buyerEmail}</strong> als e-mailadres bij het
              aanmaken van je account zodat we je aankoop kunnen koppelen.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
