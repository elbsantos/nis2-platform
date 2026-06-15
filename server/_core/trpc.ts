/**
 * server/_core/trpc.ts
 *
 * tRPC initialisation. Exports router, publicProcedure and protectedProcedure.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router            = t.router;
export const publicProcedure   = t.procedure;

/** Throws UNAUTHORIZED when no authenticated user in context */
export const protectedProcedure = t.procedure.use((opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Autenticação necessária. Faz login para continuar.",
    });
  }
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
});
