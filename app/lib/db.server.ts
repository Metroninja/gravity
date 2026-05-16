import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "~/db/schema";
import { appEnv } from "./env.server";

declare global {
  // Reuse the postgres client across HMR reloads in dev to prevent
  // exhausting connections.
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

function makeClient() {
  return postgres(appEnv().DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    prepare: false,
  });
}

const client =
  process.env.NODE_ENV === "production"
    ? makeClient()
    : (globalThis.__pgClient ??= makeClient());

export const db = drizzle(client, { schema });
export type DB = typeof db;
