import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { PENDING_SUB_PREFIX } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { stripeEnv } from "~/lib/env.server";
import { getStripe } from "~/lib/stripe.server";
import { courses, enrollments, payments, users } from "~/db/schema";
import type { Route } from "./+types/api.stripe.webhook";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const env = stripeEnv();
  const stripe = getStripe();

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "checkout.session.async_payment_failed":
        await handleCheckoutFailed(event.data.object);
        break;
      default:
        // Other events are ignored for now.
        break;
    }
  } catch (err) {
    console.error("[stripe webhook]", event.type, err);
    return new Response("Webhook handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

export function loader() {
  return new Response("Method not allowed", { status: 405 });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment") return;
  if (session.payment_status !== "paid") return;

  const courseId = session.metadata?.courseId;
  const userIdMeta = session.metadata?.userId;
  const email =
    session.customer_details?.email ?? session.customer_email ?? null;

  if (!courseId) {
    console.warn("[stripe webhook] checkout session without courseId metadata", session.id);
    return;
  }
  if (!email) {
    console.warn("[stripe webhook] checkout session without email", session.id);
    return;
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) {
    console.warn("[stripe webhook] course not found", courseId);
    return;
  }

  // Resolve user: prefer logged-in userId from metadata, otherwise upsert
  // a placeholder user keyed by email. The pending|stripe| sub gets promoted
  // to the real auth0 sub on first login (see completeLogin in auth.server).
  let userId: string | null = userIdMeta && userIdMeta.length > 0 ? userIdMeta : null;

  if (!userId) {
    const lower = email.toLowerCase();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${lower}`)
      .limit(1);

    if (existing) {
      userId = existing.id;
    } else {
      const placeholderSub = `${PENDING_SUB_PREFIX}stripe|${crypto.randomUUID()}`;
      const [created] = await db
        .insert(users)
        .values({ auth0Sub: placeholderSub, email, name: null })
        .returning({ id: users.id });
      userId = created.id;
    }
  }

  // Upsert payment row keyed by Stripe session id (idempotent).
  const amountCents = session.amount_total ?? 0;
  const currency = (session.currency ?? course.currency).toLowerCase();
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await db
    .insert(payments)
    .values({
      courseId: course.id,
      userId,
      email,
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      amountCents,
      currency,
      status: "paid",
    })
    .onConflictDoUpdate({
      target: payments.stripeSessionId,
      set: {
        status: "paid",
        userId,
        stripePaymentIntentId: paymentIntentId,
        updatedAt: sql`now()`,
      },
    });

  // Enrollment is idempotent thanks to the (userId, courseId) unique index.
  await db
    .insert(enrollments)
    .values({ userId, courseId: course.id })
    .onConflictDoNothing({
      target: [enrollments.userId, enrollments.courseId],
    });
}

async function handleCheckoutFailed(session: Stripe.Checkout.Session) {
  const courseId = session.metadata?.courseId;
  const email =
    session.customer_details?.email ?? session.customer_email ?? null;
  if (!courseId || !email) return;

  await db
    .insert(payments)
    .values({
      courseId,
      userId: null,
      email,
      stripeSessionId: session.id,
      amountCents: session.amount_total ?? 0,
      currency: (session.currency ?? "eur").toLowerCase(),
      status: "failed",
    })
    .onConflictDoUpdate({
      target: payments.stripeSessionId,
      set: { status: "failed", updatedAt: sql`now()` },
    });
}
