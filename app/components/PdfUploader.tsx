import { useRef, useState } from "react";
import { Form } from "react-router";

type UploadResult = {
  key: string;
  contentType: string;
  sizeBytes: number;
};

/**
 * Picks a PDF (or any application/* file), proxies it through
 * `/api/admin/upload`, and then submits a normal RR form with the resulting
 * key / size so the parent route's action can persist a row.
 */
export function PdfUploader() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("kind", "attachment");
      body.set("file", f);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      const json = (await res.json()) as UploadResult;
      setUploaded(json);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="border-t border-off-black/5 bg-seashell/60 px-6 py-4">
      <Form method="post" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="intent" value="create-attachment" />
        <input type="hidden" name="fileKey" value={uploaded?.key ?? ""} />
        <input
          type="hidden"
          name="contentType"
          value={uploaded?.contentType ?? ""}
        />
        <input
          type="hidden"
          name="sizeBytes"
          value={uploaded?.sizeBytes ?? 0}
        />

        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium">Nieuwe PDF</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={handlePick}
            disabled={uploading}
            className="text-off-black/70"
          />
          {uploaded ? (
            <span className="text-xs text-magenta">
              Geüpload (
              {uploaded.sizeBytes < 1024 * 1024
                ? `${Math.round(uploaded.sizeBytes / 1024)} KB`
                : `${(uploaded.sizeBytes / 1024 / 1024).toFixed(1)} MB`}
              )
            </span>
          ) : uploading ? (
            <span className="text-xs text-off-black/60">Uploaden…</span>
          ) : null}
          {error ? <span className="text-xs text-burnt-sienna">{error}</span> : null}
        </label>

        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium">Titel</span>
          <input
            name="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder="Bijv. Werkblad — oefening 1"
            className="rounded-lg border border-off-black/15 bg-white px-3 py-2 outline-none focus:border-magenta"
          />
        </label>

        <button
          type="submit"
          disabled={!uploaded || uploading}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Toevoegen
        </button>
      </Form>
    </div>
  );
}
