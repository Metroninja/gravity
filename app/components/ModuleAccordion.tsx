import { Link } from "react-router";

import { ProgressCheck } from "./ProgressCheck";

export type ModuleAttachment = {
  id: string;
  title: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

export type ModuleVideo = {
  id: string;
  title: string;
  durationSec: number;
  completed: boolean;
};

export type ModuleItem = {
  id: string;
  title: string;
  videos: ModuleVideo[];
  attachments: ModuleAttachment[];
};

type Props = {
  courseSlug: string;
  modules: ModuleItem[];
};

function fmtDuration(sec: number) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ModuleAccordion({ courseSlug, modules }: Props) {
  return (
    <ol className="flex flex-col gap-4">
      {modules.map((m, idx) => {
        const moduleComplete =
          m.videos.length > 0 && m.videos.every((v) => v.completed);
        return (
          <li key={m.id}>
            <details className="card overflow-hidden" open={idx === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-4 p-5">
                <ProgressCheck completed={moduleComplete} size={28} />
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-off-black/50">
                    Module {idx + 1}
                  </p>
                  <h3 className="text-xl text-off-black">{m.title}</h3>
                </div>
                <span className="text-off-black/40">▾</span>
              </summary>
              <div className="border-t border-off-black/5 px-5 py-4">
                {m.videos.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-off-black/5">
                    {m.videos.map((v) => (
                      <li key={v.id}>
                        <Link
                          to={`/courses/${courseSlug}/${v.id}`}
                          className="flex items-center gap-4 py-3 no-underline"
                        >
                          <ProgressCheck completed={v.completed} />
                          <span className="flex-1 text-off-black">
                            {v.title}
                          </span>
                          <span className="text-sm text-off-black/50">
                            {fmtDuration(v.durationSec)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-off-black/60">
                    Er zijn nog geen video&apos;s in deze module.
                  </p>
                )}
                {m.attachments.length > 0 ? (
                  <div className="mt-4 border-t border-off-black/5 pt-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-off-black/50">
                      Documenten
                    </p>
                    <ul className="flex flex-col gap-1">
                      {m.attachments.map((a) => (
                        <li key={a.id}>
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-magenta hover:underline"
                          >
                            <span aria-hidden>PDF</span>
                            <span>{a.title}</span>
                            <span className="text-xs text-off-black/50">
                              {fmtSize(a.sizeBytes)}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
