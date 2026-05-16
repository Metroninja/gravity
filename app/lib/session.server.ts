import { createCookieSessionStorage } from "react-router";

import { appEnv } from "./env.server";

type SessionData = {
  userId: string;
};

type FlashData = {
  error: string;
};

const isProd = process.env.NODE_ENV === "production";

// Lazily build the session storages — env() throws if SESSION_SECRET is
// missing, and we don't want module evaluation to fail on import.
let _sessionStorage: ReturnType<
  typeof createCookieSessionStorage<SessionData, FlashData>
> | null = null;
let _oauthStateStorage: ReturnType<
  typeof createCookieSessionStorage<{
    state: string;
    codeVerifier: string;
    nonce: string;
    returnTo: string;
  }>
> | null = null;

export function getSessionStorage() {
  if (_sessionStorage) return _sessionStorage;
  _sessionStorage = createCookieSessionStorage<SessionData, FlashData>({
    cookie: {
      name: "__janneke_session",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secrets: [appEnv().SESSION_SECRET],
      secure: isProd,
      maxAge: 60 * 60 * 24 * 30,
    },
  });
  return _sessionStorage;
}

export function getOauthStateStorage() {
  if (_oauthStateStorage) return _oauthStateStorage;
  _oauthStateStorage = createCookieSessionStorage<{
    state: string;
    codeVerifier: string;
    nonce: string;
    returnTo: string;
  }>({
    cookie: {
      name: "__janneke_oauth",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secrets: [appEnv().SESSION_SECRET],
      secure: isProd,
      maxAge: 60 * 10,
    },
  });
  return _oauthStateStorage;
}
