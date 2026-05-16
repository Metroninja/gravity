/**
 * Convert a free-form title to a URL-safe slug.
 *
 *   "Welkom programma!" → "welkom-programma"
 *   "Mëer info & FAQ"   → "meer-info-faq"
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
