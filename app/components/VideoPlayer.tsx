import { useEffect, useRef, useState } from "react";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

type Props = {
  videoId: string;
  src: string;
  subtitlesUrl: string | null;
  poster?: string | null;
  initialPositionSec: number;
  onComplete?: () => void;
};

/**
 * Native <video> with playback-rate control, optional VTT subtitles, and
 * server-side progress tracking. Posts to /api/progress every ~10s while
 * playing, plus once on `ended`.
 *
 * The signed `src` URL is refreshed on demand via /api/videos/:id/url when
 * the browser fires an `error` event (typical sign that the URL TTL expired).
 */
export function VideoPlayer({
  videoId,
  src,
  subtitlesUrl,
  poster,
  initialPositionSec,
  onComplete,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastReportedRef = useRef<number>(0);
  const completedRef = useRef<boolean>(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (initialPositionSec > 0 && initialPositionSec < (v.duration || Infinity)) {
      try {
        v.currentTime = initialPositionSec;
      } catch {
        // Ignore — happens on iOS before metadata is ready.
      }
    }
  }, [initialPositionSec, currentSrc]);

  async function report(opts: { position?: number; completed?: boolean }) {
    try {
      const body = new URLSearchParams();
      body.set("videoId", videoId);
      if (opts.position !== undefined) {
        body.set("position", String(Math.floor(opts.position)));
      }
      if (opts.completed) body.set("completed", "1");
      await fetch("/api/progress", {
        method: "POST",
        body,
        keepalive: true,
      });
    } catch {
      // Swallow — best-effort.
    }
  }

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    const now = v.currentTime;
    if (now - lastReportedRef.current >= 10) {
      lastReportedRef.current = now;
      void report({ position: now });
    }
  }

  function handleEnded() {
    if (completedRef.current) return;
    completedRef.current = true;
    void report({ position: videoRef.current?.currentTime ?? 0, completed: true });
    onComplete?.();
  }

  async function handleError() {
    try {
      const res = await fetch(`/api/videos/${videoId}/url`);
      if (!res.ok) return;
      const data = (await res.json()) as { url: string };
      setCurrentSrc(data.url);
    } catch {
      // Best-effort refresh.
    }
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] bg-black">
      <video
        ref={videoRef}
        src={currentSrc}
        controls
        preload="metadata"
        playsInline
        poster={poster ?? undefined}
        crossOrigin="anonymous"
        className="aspect-video w-full"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
      >
        {subtitlesUrl ? (
          <track
            kind="subtitles"
            src={subtitlesUrl}
            srcLang="nl"
            label="Nederlands"
            default
          />
        ) : null}
      </video>
      <div className="flex items-center justify-between gap-3 bg-off-black px-4 py-2 text-sm text-white">
        <label className="flex items-center gap-2">
          <span className="text-white/70">Snelheid</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="rounded bg-white/10 px-2 py-1 text-white"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
        {subtitlesUrl ? (
          <span className="text-xs text-white/60">
            Ondertiteling beschikbaar — schakel in via de speler.
          </span>
        ) : (
          <span className="text-xs text-white/50">Geen ondertiteling</span>
        )}
      </div>
    </div>
  );
}
