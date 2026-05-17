import { Form, Link } from "react-router";

export type LandingVideo = {
  title: string;
  durationSec: number;
};

export type LandingModule = {
  id: string;
  title: string;
  videos: LandingVideo[];
  attachmentCount: number;
};

export type LandingCourse = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  coverUrl: string | null;
  priceCents: number | null;
  currency: string;
};

export type LandingTotals = {
  moduleCount: number;
  videoCount: number;
  totalDurationSec: number;
  attachmentCount: number;
};

type Props = {
  course: LandingCourse;
  modules: LandingModule[];
  totals: LandingTotals;
  isLoggedIn: boolean;
  canceled?: boolean;
};

function formatPrice(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `€ ${(cents / 100).toFixed(2)}`;
  }
}

function fmtDuration(sec: number) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtTotalDuration(sec: number) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h} u ${m} min`;
  if (h > 0) return `${h} u`;
  return `${m} min`;
}

function LockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function BuyButton({
  course,
  isLoggedIn,
  variant = "primary",
}: {
  course: LandingCourse;
  isLoggedIn: boolean;
  variant?: "primary" | "secondary";
}) {
  const className = variant === "primary" ? "btn-primary" : "btn-secondary";

  // No price configured = course can't be self-purchased. Anonymous visitors
  // get a login CTA (in case they were already pre-enrolled by the admin);
  // logged-in non-enrolled visitors see nothing — they shouldn't be bounced
  // through Auth0 only to land back here.
  if (course.priceCents == null) {
    if (isLoggedIn) return null;
    return (
      <Link
        to={`/login?returnTo=${encodeURIComponent(`/courses/${course.slug}`)}`}
        className={`${className} no-underline`}
      >
        Inloggen
      </Link>
    );
  }

  return (
    <Form method="post" action={`/checkout/${course.slug}`}>
      <button type="submit" className={className}>
        Koop deze cursus &middot;{" "}
        {formatPrice(course.priceCents, course.currency)}
      </button>
    </Form>
  );
}

export function CourseLanding({
  course,
  modules,
  totals,
  isLoggedIn,
  canceled = false,
}: Props) {
  const totalLabel = fmtTotalDuration(totals.totalDurationSec);
  return (
    <article className="pb-28 sm:pb-8">
      {canceled ? (
        <div className="card mb-6 border-l-4 border-l-burnt-sienna p-4 text-sm">
          De betaling is geannuleerd. Je kunt het opnieuw proberen wanneer je
          klaar bent.
        </div>
      ) : null}

      <header className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="order-2 lg:order-1">
          <p className="mb-3 text-sm uppercase tracking-wide text-magenta">
            Online cursus
          </p>
          <h1 className="mb-4 text-4xl sm:text-5xl">{course.title}</h1>
          {course.tagline ? (
            <p className="mb-5 max-w-xl font-display text-xl text-off-black/80">
              {course.tagline}
            </p>
          ) : null}
          <ul className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-off-black/70">
            <li>
              <strong className="text-off-black">{totals.moduleCount}</strong>{" "}
              {totals.moduleCount === 1 ? "module" : "modules"}
            </li>
            <li>
              <strong className="text-off-black">{totals.videoCount}</strong>{" "}
              video&apos;s
            </li>
            {totalLabel ? (
              <li>
                <strong className="text-off-black">{totalLabel}</strong> les
              </li>
            ) : null}
            {totals.attachmentCount > 0 ? (
              <li>
                <strong className="text-off-black">
                  {totals.attachmentCount}
                </strong>{" "}
                bijlagen
              </li>
            ) : null}
          </ul>
          <div className="flex flex-wrap items-center gap-4">
            <BuyButton course={course} isLoggedIn={isLoggedIn} />
            {!isLoggedIn ? (
              <Link
                to={`/login?returnTo=${encodeURIComponent(
                  `/courses/${course.slug}`,
                )}`}
                className="text-sm text-off-black/70 hover:text-magenta"
              >
                Heb je al toegang? Inloggen
              </Link>
            ) : null}
          </div>
          {isLoggedIn && course.priceCents == null ? (
            <p className="mt-3 text-sm text-off-black/60">
              Deze cursus is nog niet te koop. Neem contact op om toegang te
              krijgen.
            </p>
          ) : null}
        </div>
        <div className="order-1 lg:order-2">
          {course.coverUrl ? (
            <img
              src={course.coverUrl}
              alt=""
              className="aspect-video w-full rounded-card object-cover shadow-sm ring-1 ring-off-black/5"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-card bg-butter-yellow text-6xl font-display text-magenta shadow-sm ring-1 ring-off-black/5">
              J
            </div>
          )}
        </div>
      </header>

      {course.description ? (
        <section className="mt-12 max-w-2xl">
          <h2 className="mb-4 text-2xl">Over deze cursus</h2>
          <p className="whitespace-pre-wrap text-off-black/80">
            {course.description}
          </p>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="mb-4 text-2xl">Wat je leert</h2>
        <p className="mb-5 max-w-2xl text-off-black/70">
          Een overzicht van de modules en lessen in deze cursus. De inhoud is
          beschikbaar zodra je toegang hebt.
        </p>
        <ol className="flex flex-col gap-4">
          {modules.map((m, idx) => (
            <li key={m.id}>
              <details className="card overflow-hidden" open={idx === 0}>
                <summary className="flex cursor-pointer list-none items-center gap-4 p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-butter-yellow text-sm font-semibold text-magenta">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-wide text-off-black/50">
                      Module {idx + 1}
                    </p>
                    <h3 className="text-xl text-off-black">{m.title}</h3>
                    <p className="mt-1 text-xs text-off-black/50">
                      {m.videos.length} video
                      {m.videos.length === 1 ? "" : "\u2019s"}
                      {m.attachmentCount > 0
                        ? ` · ${m.attachmentCount} ${m.attachmentCount === 1 ? "bijlage" : "bijlagen"}`
                        : ""}
                    </p>
                  </div>
                  <span className="text-off-black/40">▾</span>
                </summary>
                <div className="border-t border-off-black/5 px-5 py-4">
                  {m.videos.length > 0 ? (
                    <ul className="flex flex-col divide-y divide-off-black/5">
                      {m.videos.map((v, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-4 py-3 text-off-black/80"
                        >
                          <span className="text-off-black/30">
                            <LockIcon />
                          </span>
                          <span className="flex-1">{v.title}</span>
                          {v.durationSec > 0 ? (
                            <span className="text-sm text-off-black/50">
                              {fmtDuration(v.durationSec)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-off-black/60">
                      Nog geen video&apos;s in deze module.
                    </p>
                  )}
                  {m.attachmentCount > 0 ? (
                    <p className="mt-4 border-t border-off-black/5 pt-4 text-sm text-off-black/60">
                      Bevat {m.attachmentCount}{" "}
                      {m.attachmentCount === 1 ? "bijlage" : "bijlagen"} (PDF)
                    </p>
                  ) : null}
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>

      {course.priceCents != null ? (
        <section className="mt-12 grid gap-6 rounded-card bg-butter-yellow p-8 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="mb-2 text-2xl">Klaar om te beginnen?</h2>
            <p className="text-off-black/80">
              Eenmalige betaling, levenslange toegang. Veilig betalen met iDEAL
              of creditcard.
            </p>
          </div>
          <BuyButton course={course} isLoggedIn={isLoggedIn} />
        </section>
      ) : null}

      {course.priceCents != null ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-off-black/10 bg-seashell/95 p-3 backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-semibold text-off-black">{course.title}</p>
              <p className="text-off-black/60">
                {formatPrice(course.priceCents, course.currency)} · iDEAL of
                kaart
              </p>
            </div>
            <BuyButton course={course} isLoggedIn={isLoggedIn} />
          </div>
        </div>
      ) : null}
    </article>
  );
}
