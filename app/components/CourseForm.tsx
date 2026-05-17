import { useEffect, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";

import { slugify } from "~/lib/slug";

export type CourseFormValues = {
  title: string;
  slug: string;
  tagline: string;
  description: string;
  coverKey: string | null;
  coverPreviewUrl: string | null;
  sortOrder: number;
  published: boolean;
  publicLanding: boolean;
  priceCents: number | null;
  currency: string;
};

type Props = {
  mode: "create" | "edit";
  initial: CourseFormValues;
  /** Server-side validation errors keyed by field name. */
  errors?: Partial<Record<keyof CourseFormValues | "form", string>>;
  /** Extra form children rendered above the submit row (e.g. delete button). */
  footerExtras?: React.ReactNode;
};

export function CourseForm({ mode, initial, errors = {}, footerExtras }: Props) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(initial.slug.length > 0);
  const [coverKey, setCoverKey] = useState<string | null>(initial.coverKey);
  const [coverPreview, setCoverPreview] = useState<string | null>(
    initial.coverPreviewUrl,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-derive slug from title until the user manually edits the slug field.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.set("kind", "course-cover");
      body.set("file", f);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(msg || "Upload mislukt");
      }
      const json = (await res.json()) as { key: string; previewUrl: string };
      setCoverKey(json.key);
      setCoverPreview(json.previewUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearCover() {
    setCoverKey(null);
    setCoverPreview(null);
  }

  return (
    <Form method="post" className="flex flex-col gap-6">
      <input type="hidden" name="coverKey" value={coverKey ?? ""} />

      {errors.form ? (
        <div
          role="alert"
          className="rounded-lg border border-burnt-sienna/40 bg-burnt-sienna/10 px-4 py-3 text-sm text-burnt-sienna"
        >
          {errors.form}
        </div>
      ) : null}

      <Field label="Titel" htmlFor="title" error={errors.title} required>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          className={inputClass}
        />
      </Field>

      <Field
        label="Slug"
        htmlFor="slug"
        error={errors.slug}
        required
        hint="Wordt automatisch afgeleid van de titel. Alleen kleine letters, cijfers en streepjes."
      >
        <div className="flex items-center gap-2 rounded-lg border border-off-black/15 bg-white px-3 py-2">
          <span className="text-off-black/50">/courses/</span>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            pattern="[a-z0-9-]+"
            value={slug}
            onChange={(e) => {
              setSlug(e.currentTarget.value);
              setSlugTouched(true);
            }}
            className="flex-1 bg-transparent outline-none"
          />
        </div>
      </Field>

      <Field
        label="Tagline"
        htmlFor="tagline"
        error={errors.tagline}
        hint="Korte zin die op de publieke landingspagina onder de titel verschijnt."
      >
        <input
          id="tagline"
          name="tagline"
          type="text"
          maxLength={200}
          defaultValue={initial.tagline}
          className={inputClass}
        />
      </Field>

      <Field
        label="Omschrijving"
        htmlFor="description"
        error={errors.description}
      >
        <textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={initial.description}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <Field label="Omslagafbeelding" htmlFor="cover" error={uploadError ?? undefined}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative h-32 w-56 shrink-0 overflow-hidden rounded-lg border border-off-black/10 bg-butter-yellow">
            {coverPreview ? (
              <img
                src={coverPreview}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-4xl text-magenta">
                J
              </div>
            )}
            {uploading ? (
              <div className="absolute inset-0 grid place-items-center bg-white/70 text-sm">
                Uploaden…
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <input
              id="cover"
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleCoverChange}
              className="text-off-black/70"
              disabled={uploading || isSubmitting}
            />
            {coverKey ? (
              <button
                type="button"
                onClick={clearCover}
                className="self-start text-magenta hover:underline"
              >
                Verwijder afbeelding
              </button>
            ) : null}
            <p className="text-xs text-off-black/50">
              PNG, JPEG of WebP. Maximaal 10MB.
            </p>
          </div>
        </div>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Volgorde"
          htmlFor="sortOrder"
          error={errors.sortOrder}
          hint="Lager getal = bovenaan in het overzicht."
        >
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={initial.sortOrder}
            className={inputClass}
          />
        </Field>

        <Field label="Status" htmlFor="published" error={errors.published}>
          <label className="flex items-center gap-2 rounded-lg border border-off-black/15 bg-white px-3 py-2">
            <input
              id="published"
              name="published"
              type="checkbox"
              defaultChecked={initial.published}
              className="h-5 w-5 accent-magenta"
            />
            <span className="text-off-black">Zichtbaar voor cursisten</span>
          </label>
        </Field>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Prijs (in euro)"
          htmlFor="priceEuros"
          error={errors.priceCents}
          hint="Laat leeg om geen koopknop te tonen. Toon je prijs incl. BTW."
        >
          <div className="flex items-center gap-2 rounded-lg border border-off-black/15 bg-white px-3 py-2">
            <span className="text-off-black/50">EUR</span>
            <input
              id="priceEuros"
              name="priceEuros"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={
                initial.priceCents != null
                  ? (initial.priceCents / 100).toFixed(2)
                  : ""
              }
              className="flex-1 bg-transparent outline-none"
            />
          </div>
        </Field>

        <Field
          label="Publieke landingspagina"
          htmlFor="publicLanding"
          error={errors.publicLanding}
          hint="Toon /courses/{slug} aan iedereen, ook als ze niet zijn ingelogd."
        >
          <label className="flex items-center gap-2 rounded-lg border border-off-black/15 bg-white px-3 py-2">
            <input
              id="publicLanding"
              name="publicLanding"
              type="checkbox"
              defaultChecked={initial.publicLanding}
              className="h-5 w-5 accent-magenta"
            />
            <span className="text-off-black">Toon publieke landingspagina</span>
          </label>
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-off-black/10 pt-6">
        <div>{footerExtras}</div>
        <div className="flex gap-3">
          <a href="/admin/courses" className="btn-secondary">
            Annuleren
          </a>
          <button
            type="submit"
            name="intent"
            value={mode === "create" ? "create" : "update"}
            disabled={isSubmitting || uploading}
            className="btn-primary disabled:cursor-wait"
          >
            {mode === "create" ? "Programma aanmaken" : "Wijzigingen opslaan"}
          </button>
        </div>
      </div>
    </Form>
  );
}

const inputClass =
  "w-full rounded-lg border border-off-black/15 bg-white px-3 py-2 text-off-black outline-none focus:border-magenta";

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-medium text-off-black">
        {label}
        {required ? <span className="ml-1 text-magenta">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-off-black/60">{hint}</p> : null}
      {error ? (
        <p className="text-xs text-burnt-sienna" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
