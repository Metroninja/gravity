import { z } from "zod";

/**
 * Environment is validated lazily, in three slices. This lets the app boot
 * (e.g. for typecheck or healthchecks) even if Auth0 / GCS credentials
 * aren't filled in yet — only modules that actually need a slice will
 * throw if it's misconfigured.
 */

const AppSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_BASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 chars"),
  DATABASE_URL: z.string().url(),
});

const Auth0Schema = z.object({
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_CLIENT_ID: z.string().min(1),
  AUTH0_CLIENT_SECRET: z.string().min(1),
  AUTH0_CALLBACK_URL: z.string().url(),
  AUTH0_LOGOUT_RETURN_URL: z.string().url().optional(),
});

const StorageSchema = z.object({
  GCS_BUCKET: z.string().min(1),
  GCS_PROJECT_ID: z.string().optional(),
  GCS_EMULATOR_HOST: z.string().optional(),
  GCS_SIGNING_SERVICE_ACCOUNT: z.string().optional(),
});

export type AppEnv = z.infer<typeof AppSchema>;
export type Auth0Env = z.infer<typeof Auth0Schema>;
export type StorageEnv = z.infer<typeof StorageSchema>;

function format(prefix: string, err: z.ZodError) {
  const issues = err.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  return `${prefix}\n${issues}`;
}

let cachedApp: AppEnv | null = null;
let cachedAuth0: Auth0Env | null = null;
let cachedStorage: StorageEnv | null = null;

export function appEnv(): AppEnv {
  if (cachedApp) return cachedApp;
  const parsed = AppSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(format("Invalid or missing app environment variables:", parsed.error));
  }
  cachedApp = parsed.data;
  return cachedApp;
}

export function auth0Env(): Auth0Env {
  if (cachedAuth0) return cachedAuth0;
  const parsed = Auth0Schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      format(
        "Invalid or missing Auth0 environment variables — fill in AUTH0_* in your .env (see .env.example):",
        parsed.error,
      ),
    );
  }
  cachedAuth0 = parsed.data;
  return cachedAuth0;
}

export function storageEnv(): StorageEnv {
  if (cachedStorage) return cachedStorage;
  const parsed = StorageSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(format("Invalid or missing storage environment variables:", parsed.error));
  }
  cachedStorage = parsed.data;
  return cachedStorage;
}
