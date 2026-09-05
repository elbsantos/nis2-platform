/**
 * backend/db.test.ts
 *
 * P1-1 — resetUserPassword incrementa users.sessionVersion no mesmo UPDATE
 * atómico (expressão SQL "+1", não round-trip get-then-set). Mocka mysql2 e
 * drizzle-orm/mysql2 na fronteira de I/O — testa a construção real da query,
 * sem precisar de uma BD viva.
 */

import { describe, it, expect, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { users } from "../database/schema";

const mockWhere  = vi.fn().mockResolvedValue([]);
const mockSet    = vi.fn(() => ({ where: mockWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn(() => ({ on: vi.fn() })) },
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => ({ update: mockUpdate })),
}));

import { resetUserPassword } from "./db";

describe("resetUserPassword — revogação de sessão (sessionVersion)", () => {
  it("incrementa sessionVersion via expressão SQL N+1 no mesmo UPDATE que muda a passwordHash", async () => {
    await resetUserPassword(7, "new-hash-value");

    expect(mockUpdate).toHaveBeenCalledWith(users);
    expect(mockSet).toHaveBeenCalledTimes(1);

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.passwordHash).toBe("new-hash-value");
    expect(setArg.resetTokenHash).toBeNull();
    expect(setArg.resetTokenExpiresAt).toBeNull();
    // Comparação estrutural com a mesma expressão SQL — confirma que é um
    // incremento atómico "+1" no servidor, não um get-then-set em JS.
    expect(setArg.sessionVersion).toEqual(sql`${users.sessionVersion} + 1`);

    expect(mockWhere).toHaveBeenCalledWith(eq(users.id, 7));
  });
});
