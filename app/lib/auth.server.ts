import { eq, like, sql } from "drizzle-orm";
import * as client from "openid-client";
import { redirect } from "react-router";

import { resolveRoleForEmail } from "./admins.server";
import { db } from "./db.server";
import { appEnv, auth0Env } from "./env.server";
import { getOauthStateStorage, getSessionStorage } from "./session.server";
import { users } from "~/db/schema";

/** Marker prefix used for `auth0_sub` on admin-created placeholder users. */
export const PENDING_SUB_PREFIX = "pending|";

let cachedConfig: client.Configuration | null = null;

async function getAuth0Config() {
  if (cachedConfig) return cachedConfig;
  const e = auth0Env();
  cachedConfig = await client.discovery(
    new URL(`https://${e.AUTH0_DOMAIN}`),
    e.AUTH0_CLIENT_ID,
    e.AUTH0_CLIENT_SECRET,
  );
  return cachedConfig;
}

type StartLoginOptions = {
  returnTo?: string;
  /** Maps to Auth0 `screen_hint`. "signup" deep-links into the signup form. */
  screenHint?: "login" | "signup";
  /** Maps to Auth0 `login_hint`. Pre-fills the email field. */
  loginHint?: string;
};

export async function startLogin(
  request: Request,
  options: StartLoginOptions | string = {},
) {
  const opts: StartLoginOptions =
    typeof options === "string" ? { returnTo: options } : options;
  const returnTo = opts.returnTo ?? "/courses";
  const e = auth0Env();
  const config = await getAuth0Config();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const params: Record<string, string> = {
    redirect_uri: e.AUTH0_CALLBACK_URL,
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
    // Universal Login lets users pick username/password OR Google.
  };
  if (opts.screenHint) params.screen_hint = opts.screenHint;
  if (opts.loginHint) params.login_hint = opts.loginHint;

  const authUrl = client.buildAuthorizationUrl(config, params);

  const oauthStateStorage = getOauthStateStorage();
  const oauthSession = await oauthStateStorage.getSession(
    request.headers.get("Cookie"),
  );
  oauthSession.set("state", state);
  oauthSession.set("codeVerifier", codeVerifier);
  oauthSession.set("nonce", nonce);
  oauthSession.set("returnTo", returnTo);

  return redirect(authUrl.href, {
    headers: {
      "Set-Cookie": await oauthStateStorage.commitSession(oauthSession),
    },
  });
}

export async function completeLogin(request: Request) {
  const config = await getAuth0Config();
  const oauthStateStorage = getOauthStateStorage();
  const sessionStorage = getSessionStorage();
  const oauthSession = await oauthStateStorage.getSession(
    request.headers.get("Cookie"),
  );
  const codeVerifier = oauthSession.get("codeVerifier");
  const expectedNonce = oauthSession.get("nonce");
  const expectedState = oauthSession.get("state");
  const returnTo = oauthSession.get("returnTo") ?? "/courses";

  if (!codeVerifier || !expectedNonce || !expectedState) {
    throw redirect("/login");
  }

  const tokens = await client.authorizationCodeGrant(
    config,
    new URL(request.url),
    {
      pkceCodeVerifier: codeVerifier,
      expectedNonce,
      expectedState,
      idTokenExpected: true,
    },
  );

  const claims = tokens.claims();
  if (!claims?.sub) {
    throw new Response("Auth0 returned no subject claim", { status: 400 });
  }

  const email = (claims.email as string | undefined) ?? "";
  const name =
    (claims.name as string | undefined) ??
    (claims.nickname as string | undefined) ??
    null;

  // Allow-listed emails are always promoted to admin on every login. Other
  // accounts keep whatever role they already have (default: student) so we
  // don't accidentally demote a manually-promoted user.
  const role = resolveRoleForEmail(email);

  // If an admin pre-enrolled this person before they logged in, there's a
  // placeholder row with auth0_sub = 'pending|...' and matching email. Promote
  // it first so the natural upsert below merges into the same row.
  if (email) {
    await db
      .update(users)
      .set({ auth0Sub: claims.sub, name, role })
      .where(
        // eq(lower(email), lower(:email)) AND auth0_sub LIKE 'pending|%'
        sql`lower(${users.email}) = ${email.toLowerCase()} AND ${like(users.auth0Sub, `${PENDING_SUB_PREFIX}%`)}`,
      );
  }

  const setOnConflict =
    role === "admin"
      ? { email, name, role: role as "admin" }
      : { email, name };

  const [user] = await db
    .insert(users)
    .values({
      auth0Sub: claims.sub,
      email,
      name,
      role,
    })
    .onConflictDoUpdate({
      target: users.auth0Sub,
      set: setOnConflict,
    })
    .returning();

  const appSession = await sessionStorage.getSession(
    request.headers.get("Cookie"),
  );
  appSession.set("userId", user.id);

  const headers = new Headers();
  headers.append("Set-Cookie", await sessionStorage.commitSession(appSession));
  headers.append(
    "Set-Cookie",
    await oauthStateStorage.destroySession(oauthSession),
  );

  return redirect(returnTo, { headers });
}

export async function logout(request: Request) {
  const sessionStorage = getSessionStorage();
  const appSession = await sessionStorage.getSession(
    request.headers.get("Cookie"),
  );
  const headers = new Headers();
  headers.append("Set-Cookie", await sessionStorage.destroySession(appSession));

  // Auth0 logout is best-effort. If Auth0 isn't configured yet we still want
  // local logout to work, so fall back to just clearing the cookie.
  try {
    const a = auth0Env();
    const returnUrl = a.AUTH0_LOGOUT_RETURN_URL ?? appEnv().APP_BASE_URL;
    const logoutUrl = new URL(`https://${a.AUTH0_DOMAIN}/v2/logout`);
    logoutUrl.searchParams.set("client_id", a.AUTH0_CLIENT_ID);
    logoutUrl.searchParams.set("returnTo", returnUrl);
    return redirect(logoutUrl.href, { headers });
  } catch {
    return redirect("/login", { headers });
  }
}

export async function getUserId(request: Request): Promise<string | null> {
  try {
    const session = await getSessionStorage().getSession(
      request.headers.get("Cookie"),
    );
    return session.get("userId") ?? null;
  } catch {
    // Session storage couldn't be built (e.g. SESSION_SECRET missing); treat
    // as anonymous so the redirect-to-login flow still works.
    return null;
  }
}

export async function getUser(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return null;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function requireUser(request: Request) {
  const user = await getUser(request);
  if (!user) {
    const url = new URL(request.url);
    const returnTo = url.pathname + url.search;
    throw redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (user.role !== "admin") {
    throw new Response("Geen toegang", { status: 403 });
  }
  return user;
}
