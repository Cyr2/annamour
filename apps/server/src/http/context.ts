import { type Account, SESSION_COOKIE } from "@annamour/protocol";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { z } from "zod";
import { BadRequestError, NotSignedInError } from "../errors.ts";
import type { AccountService } from "../services/account-service.ts";
import type { Services } from "../services/services.ts";

export interface HttpOptions {
  /** Production always sets Secure cookies; elsewhere only over https. */
  production: boolean;
}

export type AppEnv = { Variables: { account: Account } };
export type AppContext = Context<AppEnv>;

const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

/** First hop of X-Forwarded-For (the real client behind the proxy). */
export function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function isHttps(c: Context): boolean {
  const forwarded = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwarded === "https" || new URL(c.req.url).protocol === "https:";
}

export function sessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function setSessionCookie(c: Context, token: string, { production }: HttpOptions): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
    secure: production || isHttps(c),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Lets the request through only with a valid session, and exposes its account. */
export function requireAccount(accounts: AccountService): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const account = accounts.accountFor(sessionToken(c));
    if (!account) throw new NotSignedInError();
    c.set("account", account);
    await next();
  };
}

/** Parses a JSON body with a protocol schema; `message` tells the person what to fix. */
export async function readBody<T>(c: Context, schema: z.ZodType<T>, message: string): Promise<T> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new BadRequestError(message);
  return parsed.data;
}

export type RouteDeps = { services: Services; http: HttpOptions };
