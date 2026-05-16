/**
 * Emails that are always promoted to the `admin` role on every login.
 *
 * This is enforced server-side in {@link resolveRoleForEmail} — there is no
 * UI affordance to demote these accounts. To grant admin to additional
 * accounts without a code change, set `ADMIN_EMAILS` (comma-separated) in
 * the environment.
 */
const HARDCODED_ADMIN_EMAILS = [
  "metroninja@gmail.com",
  "janneke@jannekevdwouw.com",
] as const;

function normalize(email: string) {
  return email.trim().toLowerCase();
}

function envAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return [];
  return raw.split(",").map(normalize).filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = normalize(email);
  if (HARDCODED_ADMIN_EMAILS.some((a) => normalize(a) === e)) return true;
  return envAdminEmails().includes(e);
}

export function resolveRoleForEmail(email: string): "admin" | "student" {
  return isAdminEmail(email) ? "admin" : "student";
}
