/**
 * backend/routers/organization.router.test.ts
 *
 * Testes de round-trip e isolamento multi-tenant para o Perfil da Entidade.
 */

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  getOrCreateOrgForOwner:  vi.fn(),
  getSubscriptionByOrgId:  vi.fn(),
  getOrgProfile:           vi.fn(),
  updateOrgProfile:        vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (após mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as db from "../db";
import { organizationRouter } from "./organization.router";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = { id: 1,  name: "Org A", ownerId: 10, createdAt: new Date(), updatedAt: new Date() };
const ORG_B = { id: 2,  name: "Org B", ownerId: 20, createdAt: new Date(), updatedAt: new Date() };

const USER_A = {
  id: 10, email: "a@test.com", name: "User A", role: "admin" as const,
  organizationId: ORG_A.id, passwordHash: null, resetTokenHash: null,
  resetTokenExpiresAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

const USER_B = {
  id: 20, email: "b@test.com", name: "User B", role: "admin" as const,
  organizationId: ORG_B.id, passwordHash: null, resetTokenHash: null,
  resetTokenExpiresAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

const PROFILE_A = {
  name:                 "Org A",
  legalName:            "Empresa A, Lda.",
  taxId:                "509123456",
  taxIdType:            "NIPC",
  address:              "Rua Teste 1, Lisboa",
  sector:               "energia",
  size:                 "media",
  contactPhone:         "+351 210 000 001",
  securityOfficerName:  "Carlos Silva",
  securityOfficerEmail: "ciso@orga.pt",
  legalRepresentative:  "João Administrador",
  jurisdiction:         "PT",
  domain:               "orga.pt",
};

function makeCtx(user: typeof USER_A, org: typeof ORG_A) {
  return { user, org, req: {} as any, res: {} as any, plan: "free" as const };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
  vi.mocked(db.getSubscriptionByOrgId).mockResolvedValue(null as any);
  vi.mocked(db.getOrgProfile).mockResolvedValue(PROFILE_A as any);
  vi.mocked(db.updateOrgProfile).mockResolvedValue(undefined as any);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------

describe("organization.getProfile", () => {
  it("devolve o perfil da org autenticada", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));
    const result = await caller.getProfile();

    expect(result).toMatchObject({
      legalName:   "Empresa A, Lda.",
      taxId:       "509123456",
      sector:      "energia",
      contactPhone: "+351 210 000 001",
      legalRepresentative: "João Administrador",
    });
    expect(vi.mocked(db.getOrgProfile)).toHaveBeenCalledWith(ORG_A.id);
  });

  it("devolve null se a org não tiver perfil preenchido", async () => {
    vi.mocked(db.getOrgProfile).mockResolvedValue(null as any);
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));
    const result = await caller.getProfile();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateProfile — round-trip
// ---------------------------------------------------------------------------

describe("organization.updateProfile — round-trip", () => {
  it("escreve o perfil e getProfile devolve os mesmos valores", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const payload = {
      legalName:           "Nova Empresa, SA",
      taxId:               "500000001",
      taxIdType:           "NIPC" as const,
      sector:              "saude",
      size:                "grande",
      contactPhone:        "+351 210 999 999",
      securityOfficerName: "Ana Ciso",
      legalRepresentative: "Pedro CEO",
    };

    const { ok } = await caller.updateProfile(payload);
    expect(ok).toBe(true);
    expect(vi.mocked(db.updateOrgProfile)).toHaveBeenCalledWith(
      ORG_A.id,
      expect.objectContaining(payload)
    );

    // Simular leitura de volta com os novos valores
    vi.mocked(db.getOrgProfile).mockResolvedValue({ ...PROFILE_A, ...payload } as any);
    const profile = await caller.getProfile();
    expect(profile).toMatchObject(payload);
  });

  it("aceita campos parciais (patch semântico — campos ausentes não apagam os existentes)", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    await caller.updateProfile({ contactPhone: "+351 210 111 222" });

    expect(vi.mocked(db.updateOrgProfile)).toHaveBeenCalledWith(
      ORG_A.id,
      expect.objectContaining({ contactPhone: "+351 210 111 222" })
    );
    // legalName não foi enviado — não deve estar no set()
    // (zod omite campos undefined; o spread em db não os inclui)
  });

  it("escreve os 10 campos novos do Perfil da Entidade completo e getProfile devolve-os", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const payload = {
      caeCode:                  "62010",
      legalRepresentativeRole:  "Administrador-Delegado",
      securityOfficerRole:      "Diretor de TI",
      securityOfficerPhone:     "+351 910 000 000",
      securityOfficerTaxId:     "123456789",
      securityOfficerStartDate: "2026-01-15",
      ceoName:                  "Maria Santos",
      employeeCount:            230,
      annualTurnover:           "990000.00",
      annualBalance:            "430000.00",
    };

    const { ok } = await caller.updateProfile(payload);
    expect(ok).toBe(true);
    expect(vi.mocked(db.updateOrgProfile)).toHaveBeenCalledWith(
      ORG_A.id,
      expect.objectContaining(payload)
    );

    vi.mocked(db.getOrgProfile).mockResolvedValue({ ...PROFILE_A, ...payload } as any);
    const profile = await caller.getProfile();
    expect(profile).toMatchObject(payload);
  });

  it("escreve o campo city e getProfile devolve-o (round-trip)", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const { ok } = await caller.updateProfile({ city: "Lisboa" });
    expect(ok).toBe(true);
    expect(vi.mocked(db.updateOrgProfile)).toHaveBeenCalledWith(
      ORG_A.id,
      expect.objectContaining({ city: "Lisboa" })
    );

    vi.mocked(db.getOrgProfile).mockResolvedValue({ ...PROFILE_A, city: "Lisboa" } as any);
    const profile = await caller.getProfile();
    expect(profile.city).toBe("Lisboa");
  });

  it("escreve ceoContact (email) e countriesOfOperation e getProfile devolve-os (round-trip)", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const payload = {
      ceoContact: "ceo@empresa.pt",
      countriesOfOperation: ["Espanha", "França"],
    };

    const { ok } = await caller.updateProfile(payload);
    expect(ok).toBe(true);
    expect(vi.mocked(db.updateOrgProfile)).toHaveBeenCalledWith(
      ORG_A.id,
      expect.objectContaining(payload)
    );

    vi.mocked(db.getOrgProfile).mockResolvedValue({ ...PROFILE_A, ...payload } as any);
    const profile = await caller.getProfile();
    expect(profile.ceoContact).toBe("ceo@empresa.pt");
    expect(profile.countriesOfOperation).toEqual(["Espanha", "França"]);
  });

  it("aceita countriesOfOperation vazio (lista vazia é resposta válida — só opera em PT)", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const { ok } = await caller.updateProfile({ countriesOfOperation: [] });
    expect(ok).toBe(true);
    expect(vi.mocked(db.updateOrgProfile)).toHaveBeenCalledWith(
      ORG_A.id,
      expect.objectContaining({ countriesOfOperation: [] })
    );
  });
});

// ---------------------------------------------------------------------------
// Isolamento multi-tenant
// ---------------------------------------------------------------------------

describe("organization.updateProfile — isolamento", () => {
  it("updateProfile da Org B usa ctx.org.id de B, nunca altera A", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_B as any);
    const callerB = organizationRouter.createCaller(makeCtx(USER_B, ORG_B));

    await callerB.updateProfile({ legalName: "Empresa B Modificada" });

    expect(vi.mocked(db.updateOrgProfile)).toHaveBeenCalledWith(
      ORG_B.id,
      expect.objectContaining({ legalName: "Empresa B Modificada" })
    );
    // Confirmar que ORG_A.id (1) nunca foi passado ao updateOrgProfile
    expect(vi.mocked(db.updateOrgProfile)).not.toHaveBeenCalledWith(
      ORG_A.id,
      expect.anything()
    );
  });

  it("updateProfile da Org B com os campos novos usa ctx.org.id de B, nunca A", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_B as any);
    const callerB = organizationRouter.createCaller(makeCtx(USER_B, ORG_B));

    await callerB.updateProfile({ caeCode: "62010", employeeCount: 50, ceoName: "CEO da B" });

    expect(vi.mocked(db.updateOrgProfile)).toHaveBeenCalledWith(
      ORG_B.id,
      expect.objectContaining({ caeCode: "62010", employeeCount: 50, ceoName: "CEO da B" })
    );
    expect(vi.mocked(db.updateOrgProfile)).not.toHaveBeenCalledWith(
      ORG_A.id,
      expect.anything()
    );
  });

  it("getProfile da Org B chama getOrgProfile com o id de B, não de A", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_B as any);
    const callerB = organizationRouter.createCaller(makeCtx(USER_B, ORG_B));

    await callerB.getProfile();

    expect(vi.mocked(db.getOrgProfile)).toHaveBeenCalledWith(ORG_B.id);
    expect(vi.mocked(db.getOrgProfile)).not.toHaveBeenCalledWith(ORG_A.id);
  });
});

// ---------------------------------------------------------------------------
// Validação Zod
// ---------------------------------------------------------------------------

describe("organization.updateProfile — validação", () => {
  it("rejeita email de CISO malformado", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const err = await caller.updateProfile({ securityOfficerEmail: "nao-e-email" }).catch(e => e);
    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("rejeita ceoContact malformado (agora é email, não telefone livre)", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const err = await caller.updateProfile({ ceoContact: "+351 910 000 000" }).catch(e => e);
    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("aceita ceoContact vazio (limpar o campo)", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const { ok } = await caller.updateProfile({ ceoContact: "" });
    expect(ok).toBe(true);
  });

  it("rejeita taxIdType fora do enum", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const err = await caller.updateProfile({ taxIdType: "INVALIDO" as any }).catch(e => e);
    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("aceita securityOfficerEmail vazio (limpar o campo)", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const { ok } = await caller.updateProfile({ securityOfficerEmail: "" });
    expect(ok).toBe(true);
  });

  it("rejeita NIF com formato errado quando taxIdType é NIPC", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const err = await caller.updateProfile({ taxId: "12345", taxIdType: "NIPC" }).catch(e => e);
    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("aceita NIF com 9 dígitos quando taxIdType é NIPC", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const { ok } = await caller.updateProfile({ taxId: "509123456", taxIdType: "NIPC" });
    expect(ok).toBe(true);
  });

  it("aceita taxId livre quando taxIdType não é PT (ex.: EIN)", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const { ok } = await caller.updateProfile({ taxId: "12-3456789", taxIdType: "EIN" });
    expect(ok).toBe(true);
  });

  it("rejeita employeeCount negativo", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const err = await caller.updateProfile({ employeeCount: -1 }).catch(e => e);
    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("aceita employeeCount zero", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const { ok } = await caller.updateProfile({ employeeCount: 0 });
    expect(ok).toBe(true);
  });

  it("rejeita securityOfficerStartDate com data de calendário inválida (ex.: 31 de fevereiro)", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const err = await caller.updateProfile({ securityOfficerStartDate: "2026-02-31" }).catch(e => e);
    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("rejeita securityOfficerStartDate em formato errado", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const err = await caller.updateProfile({ securityOfficerStartDate: "15/01/2026" }).catch(e => e);
    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("aceita securityOfficerStartDate válida", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const { ok } = await caller.updateProfile({ securityOfficerStartDate: "2026-01-15" });
    expect(ok).toBe(true);
  });

  it("rejeita annualTurnover/annualBalance com formato decimal inválido", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const err = await caller.updateProfile({ annualTurnover: "não é número" }).catch(e => e);
    expect(err).toBeDefined();
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("aceita annualTurnover/annualBalance decimais válidos", async () => {
    vi.mocked(db.getOrCreateOrgForOwner).mockResolvedValue(ORG_A as any);
    const caller = organizationRouter.createCaller(makeCtx(USER_A, ORG_A));

    const { ok } = await caller.updateProfile({ annualTurnover: "990000.00", annualBalance: "430000.00" });
    expect(ok).toBe(true);
  });
});
