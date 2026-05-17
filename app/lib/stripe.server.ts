import Stripe from "stripe";

import { stripeEnv } from "./env.server";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const env = stripeEnv();
  cached = new Stripe(env.STRIPE_SECRET_KEY, {
    // Pinning the API version keeps webhook payload shapes predictable.
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return cached;
}

type CheckoutCourse = {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  currency: string;
};

type CreateSessionOpts = {
  course: CheckoutCourse;
  userId: string | null;
  buyerEmail: string | null;
  baseUrl: string;
};

export async function createCheckoutSession(opts: CreateSessionOpts) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["ideal", "card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: opts.course.currency,
          unit_amount: opts.course.priceCents,
          product_data: {
            name: opts.course.title,
          },
        },
      },
    ],
    customer_email: opts.buyerEmail ?? undefined,
    success_url: `${opts.baseUrl}/checkout/success/${opts.course.slug}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.baseUrl}/courses/${opts.course.slug}?canceled=1`,
    metadata: {
      courseId: opts.course.id,
      userId: opts.userId ?? "",
    },
    locale: "nl",
  });
}
