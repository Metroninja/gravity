import { useEffect, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";

export type VideoFormValues = {
  title: string;
  instructionsMd: string;
  durationSec: number;
  sortOrder: number;
  videoKey: string | null;
  videoPreviewUrl: string | null;
  subtitlesKey: string | null;
  subtitlesPreviewUrl: string | null;
};

type Props = {
  mode: "create" | "edit";
  initial: VideoFormValues;
  errors?: Partial<Record<keyof VideoFormValues | "form", string>>;
  /** Rendered next to the submit button (delete button on edit). */
  footerExtras?: React.ReactNode;
};

export function VideoForm({ mode, initial, errors = {}, footerExtras }: Props) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  const [videoKey, setVideoKey] = useState<string | null>(initial.videoKey);
  const [videoPreview, setVideoPreview] = useState<string | null>(
    initial.videoPreviewUrl,
  );
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [duration, setDuration] = useState(initial.durationSec);
  const probeRef = useRef<HTMLVideoElement>(null);

  const [subKey, setSubKey] = useState<string | null>(initial.subtitlesKey);
  const [subUploading, setSubUploading] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);

  // When the preview source changes, probe duration via a hidden <video>.
  useEffect(() => {
    const v = probeRef.current;
    if (!v) return;
    function onMeta() {
      const d = Math.round(v?.duration ?? 0);
      if (Number.isFinite(d) && d > 0) setDuration(d);
    }
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [videoPreview]);

  async function uploadFile(
    kind: "video" | "subtitles",
    file: File,
  ): Promise<{ key: string; previewUrl: string } | null> {
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(msg || "Upload mislukt");
    }
    return (await res.json()) as { key: string; previewUrl: string };
  }

  async function onVideoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    setVideoUploading(true);
    setVideoError(null);
    try {
      const json = await uploadFile("video", f);
      if (!json) return;
      setVideoKey(json.key);
      setVideoPreview(json.previewUrl);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setVideoUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  async function onSubsPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    setSubUploading(true);
    setSubError(null);
    try {
      const json = await uploadFile("subtitles", f);
      if (!json) return;
      setSubKey(json.key);
    } catch (err) {
      setSubError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setSubUploading(false);
      if (subInputRef.current) subInputRef.current.value = "";
    }
  }

  return (
    <Form method="post" className="flex flex-col gap-6">
      <input type="hidden" name="videoKey" value={videoKey ?? ""} />
      <input type="hidden" name="subtitlesKey" value={subKey ?? ""} />
      <input type="hidden" name="durationSec" value={duration} />

      {errors.form ? (
        <div className="rounded-lg border border-burnt-sienna/40 bg-burnt-sienna/10 px-4 py-3 text-sm text-burnt-sienna">
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
          defaultValue={initial.title}
          className={inputClass}
        />
      </Field>

      <Field
        label="Video"
        htmlFor="videoFile"
        error={videoError ?? errors.videoKey ?? undefined}
        required={mode === "create"}
      >
        <div className="flex flex-col gap-3">
          {videoPreview ? (
            <video
              ref={probeRef}
              src={videoPreview}
              controls
              preload="metadata"
              className="aspect-video w-full max-w-xl rounded-lg bg-black"
            />
          ) : (
            <div className="flex aspect-video w-full max-w-xl items-center justify-center rounded-lg bg-off-black/5 text-off-black/40">
              Nog geen video geüpload
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              id="videoFile"
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={onVideoPick}
              disabled={videoUploading || isSubmitting}
            />
            {videoUploading ? (
              <span className="text-off-black/60">Uploaden… kan even duren.</span>
            ) : videoKey ? (
              <span className="text-magenta">Video gekoppeld</span>
            ) : (
              <span className="text-off-black/50">Geen video gekoppeld</span>
            )}
          </div>
          <p className="text-xs text-off-black/50">
            MP4 of WebM. In lokale dev wordt het bestand via de server naar het
            opslagsysteem geproxyd. In productie zetten we dat om naar
            directe-upload (zie README).
          </p>
        </div>
      </Field>

      <Field
        label="Ondertiteling (optioneel)"
        htmlFor="subtitlesFile"
        error={subError ?? undefined}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <input
            id="subtitlesFile"
            ref={subInputRef}
            type="file"
            accept=".vtt,text/vtt,text/plain"
            onChange={onSubsPick}
            disabled={subUploading || isSubmitting}
          />
          {subUploading ? (
            <span className="text-off-black/60">Uploaden…</span>
          ) : subKey ? (
            <span className="text-magenta">VTT gekoppeld</span>
          ) : (
            <span className="text-off-black/50">Geen ondertiteling</span>
          )}
          {subKey ? (
            <button
              type="button"
              onClick={() => setSubKey(null)}
              className="text-magenta hover:underline"
            >
              Verwijderen
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-off-black/50">
          WebVTT-bestand. Eén taal voor nu — meerdere talen is een aparte
          uitbreiding.
        </p>
      </Field>

      <Field
        label="Instructies / oefeningen"
        htmlFor="instructionsMd"
        error={errors.instructionsMd}
        hint="Wat de cursist onder de video ziet staan. Gewone tekst — gebruik lege regels voor paragrafen."
      >
        <textarea
          id="instructionsMd"
          name="instructionsMd"
          rows={8}
          defaultValue={initial.instructionsMd}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Duur (seconden)"
          htmlFor="durationDisplay"
          error={errors.durationSec}
          hint="Wordt automatisch gevuld bij een upload, maar je kunt het bijstellen."
        >
          <input
            id="durationDisplay"
            type="number"
            min={0}
            value={duration}
            onChange={(e) =>
              setDuration(Math.max(0, Number.parseInt(e.currentTarget.value, 10) || 0))
            }
            className={inputClass}
          />
        </Field>
        <Field
          label="Volgorde"
          htmlFor="sortOrder"
          error={errors.sortOrder}
          hint="Lager getal = eerder in de module."
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-off-black/10 pt-6">
        <div>{footerExtras}</div>
        <div className="flex gap-3">
          <button
            type="submit"
            name="intent"
            value={mode === "create" ? "create" : "update"}
            disabled={isSubmitting || videoUploading || subUploading}
            className="btn-primary disabled:cursor-wait"
          >
            {mode === "create" ? "Video aanmaken" : "Wijzigingen opslaan"}
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
