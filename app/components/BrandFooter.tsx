type LinkKind = "podcast" | "website" | "blog" | "mail" | "other";

type ExternalLink = {
  id: string;
  label: string;
  url: string;
  kind: LinkKind;
};

type Props = {
  links: ExternalLink[];
};

const ICONS: Record<LinkKind, string> = {
  podcast: "Podcast",
  website: "Website",
  blog: "Blog",
  mail: "Mail",
  other: "Link",
};

export function BrandFooter({ links }: Props) {
  return (
    <footer className="mt-16 bg-black-bean text-butter-yellow">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-2xl">Janneke van der Wouw</p>
          <p className="text-butter-yellow/70 text-sm">
            Vragen? Stuur me een bericht.
          </p>
        </div>
        {links.length > 0 ? (
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {links.map((l) => (
              <li key={l.id}>
                <a
                  className="text-butter-yellow underline-offset-4 hover:underline"
                  href={l.url}
                  target={l.kind === "mail" ? undefined : "_blank"}
                  rel="noreferrer"
                >
                  <span className="text-butter-yellow/60 mr-1">
                    {ICONS[l.kind]}
                  </span>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </footer>
  );
}
