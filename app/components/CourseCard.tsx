import { Link } from "react-router";

type Props = {
  slug: string;
  title: string;
  description: string;
  coverUrl: string | null;
  completedCount: number;
  totalCount: number;
};

export function CourseCard({
  slug,
  title,
  description,
  coverUrl,
  completedCount,
  totalCount,
}: Props) {
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return (
    <Link
      to={`/courses/${slug}`}
      className="card group flex h-full flex-col overflow-hidden no-underline"
    >
      <div className="aspect-video w-full bg-butter-yellow">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-magenta">
            <span className="font-display text-5xl">J</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h2 className="mb-2 text-xl text-off-black">{title}</h2>
        <p className="mb-6 line-clamp-3 flex-1 text-sm text-off-black/70">
          {description}
        </p>
        <div className="flex items-center justify-between text-xs text-off-black/60">
          <span>
            {completedCount} / {totalCount} video&apos;s
          </span>
          <span className="font-semibold text-magenta">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-off-black/10">
          <div
            className="h-full bg-magenta transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
