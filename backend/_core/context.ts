/**
 * server/_core/context.ts
 *
 * tRPC request context. Parses the JWT auth cookie and attaches the user.
 */

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { jwtVerify } from "jose";
import { getUserById } from "../db";
import type { User } from "../db";

export interface Context {
  user: User | null;
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "dev-secret-change-in-production-min-32-chars";
  return new TextEncoder().encode(secret);
}

async function getUserFromCookie(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  const raw = req.cookies?.auth_token as string | undefined;
  if (!raw) return null;

  try {
    const { payload } = await jwtVerify(raw, getJwtSecret());
    const userId = typeof payload.sub === "string" ? parseInt(payload.sub, 10) : null;
    if (!userId || isNaN(userId)) return null;

    return getUserById(userId);
  } catch {
    return null;
  }
}

export async function createContext({ req, res }: CreateExpressContextOptions): Promise<Context> {
  const user = await getUserFromCookie(req);
  return { user, req, res };
}
