import { eq } from "drizzle-orm";
import { data, redirect } from "react-router";

import { CourseForm, type CourseFormValues } from "~/components/CourseForm";
import { requireAdmin } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { deleteObject, getReadUrl } from "~/lib/storage.server";
import { slugify } from "~/lib/slug";
import { courses } from "~/db/schema";
import type { Route } from "./+types/admin.courses.new";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();

  const title = ((form.get("title") as string) ?? "").trim();
  const slugRaw = ((form.get("slug") as string) ?? "").trim();
  const tagline = ((form.get("tagline") as string) ?? "").trim();
  const description = ((form.get("description") as string) ?? "").trim();
  const coverKey = ((form.get("coverKey") as string) ?? "").trim() || null;
  const sortOrder = Number.parseInt(
    (form.get("sortOrder") as string) ?? "0",
    10,
  );
  const published = form.get("published") === "on";
  const publicLanding = form.get("publicLanding") === "on";
  const priceEurosRaw = ((form.get("priceEuros") as string) ?? "").trim();
  const priceCents = parsePriceCents(priceEurosRaw);

  const slug = slugify(slugRaw || title);

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Titel is verplicht.";
  if (!slug) errors.slug = "Slug is verplicht.";
  if (slug && !/^[a-z0-9-]+$/.test(slug)) {
    errors.slug = "Alleen kleine letters, cijfers en streepjes.";
  }
  if (Number.isNaN(sortOrder) || sortOrder < 0) {
    errors.sortOrder = "Volgorde moet een positief getal zijn.";
  }
  if (priceCents === "invalid") {
    errors.priceCents = "Prijs moet een positief getal zijn.";
  }

  const resolvedPriceCents = priceCents === "invalid" ? null : priceCents;

  if (Object.keys(errors).length > 0) {
    return data(
      {
        errors,
        values: {
          title,
          slug,
          tagline,
          description,
          coverKey,
          coverPreviewUrl: coverKey ? await getReadUrl(coverKey, 60 * 10) : null,
          sortOrder: Number.isNaN(sortOrder) ? 0 : sortOrder,
          published,
          publicLanding,
          priceCents: resolvedPriceCents,
          currency: "eur",
        } satisfies CourseFormValues,
      },
      { status: 400 },
    );
  }

  // Check slug uniqueness.
  const existing = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.slug, slug))
    .limit(1);
  if (existing.length > 0) {
    // Roll back the orphaned cover upload so we don't leak GCS objects.
    if (coverKey) await deleteObject(coverKey);
    return data(
      {
        errors: { slug: "Deze slug is al in gebruik." },
        values: {
          title,
          slug,
          tagline,
          description,
          coverKey: null,
          coverPreviewUrl: null,
          sortOrder,
          published,
          publicLanding,
          priceCents: resolvedPriceCents,
          currency: "eur",
        } satisfies CourseFormValues,
      },
      { status: 400 },
    );
  }

  await db.insert(courses).values({
    title,
    slug,
    tagline,
    description,
    coverKey,
    sortOrder,
    published,
    publicLanding,
    priceCents: resolvedPriceCents,
    currency: "eur",
  });

  return redirect(`/admin/courses/${slug}/edit`);
}

function parsePriceCents(raw: string): number | null | "invalid" {
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num) || num < 0) return "invalid";
  return Math.round(num * 100);
}

const EMPTY: CourseFormValues = {
  title: "",
  slug: "",
  tagline: "",
  description: "",
  coverKey: null,
  coverPreviewUrl: null,
  sortOrder: 0,
  published: false,
  publicLanding: false,
  priceCents: null,
  currency: "eur",
};

export default function NewCoursePage({ actionData }: Route.ComponentProps) {
  const values = actionData?.values ?? EMPTY;
  const errors = actionData?.errors ?? {};
  return (
    <section className="max-w-2xl">
      <header className="mb-8">
        <p className="text-sm text-off-black/60">
          <a href="/admin/courses" className="hover:underline">
            Programma&apos;s
          </a>{" "}
          / Nieuw
        </p>
        <h1 className="mt-1 text-3xl">Nieuw programma</h1>
        <p className="text-off-black/70">
          Vul de basisgegevens in. Modules en video&apos;s voeg je daarna toe.
        </p>
      </header>
      <CourseForm mode="create" initial={values} errors={errors} />
    </section>
  );
}
