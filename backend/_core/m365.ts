/**
 * backend/_core/m365.ts
 *
 * Rotas OAuth admin-consent do connector Microsoft 365 (Microsoft Graph).
 *
 * Fluxo multi-tenant: /connect redireciona para a autoridade /organizations
 * do endpoint v2.0 (permite que QUALQUER tenant Microsoft consinta, não só
 * o nosso); /callback troca o code pelo par de tokens e guarda-os cifrados
 * (utils/encryption) em m365_connections, uma ligação por organização.
 *
 * O state é um JWT curto assinado (10min) que carrega o organizationId —
 * nunca confiar num orgId vindo da query do callback, só do state validado.
 * Isto evita que um pedido de callback adulterado associe a ligação a uma
 * organização diferente da que iniciou o /connect (cross-tenant).
 *
 * Degradação: sem M365_CLIENT_ID/SECRET/TENANT_ID na env, as duas rotas
 * devolvem 503 — o connector fica desativado, o arranque nunca falha
 * (as credenciais Microsoft ainda não existem — ver ADR M365).
 */

import type { Application, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";
import { getUserById, getOrCreateOrgForOwner, upsertM365Connection } from "../db";
import { encrypt } from "../utils/encryption";
import { ENV, getJwtSecret } from "./env";
import { COOKIE_NAME } from "./oauth";

const AUTHORITY_HOST = "https://login.microsoftonline.com";
const GRAPH_SCOPE     = "https://graph.microsoft.com/.default offline_access";
const STATE_EXPIRY    = "10m";

function redirectUri(): string {
  return `${ENV.appUrl}/api/connectors/m365/callback`;
}

// ---------------------------------------------------------------------------
// Configuração — lida DIRETAMENTE de process.env (não do objeto ENV
// cacheado no arranque) para que o connector reflita a env em tempo real:
// as credenciais Microsoft ainda não existem, e quando forem adicionadas
// (ou removidas, ex. num teste) não deve ser preciso reiniciar o processo.
// ---------------------------------------------------------------------------

interface M365Config {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

function readM365Config(): M365Config {
  return {
    clientId:     process.env.M365_CLIENT_ID ?? "",
    clientSecret: process.env.M365_CLIENT_SECRET ?? "",
    tenantId:     process.env.M365_TENANT_ID ?? "",
  };
}

/** Devolve a config se completa; caso contrário responde 503 e devolve null. */
function requireM365Config(res: Response): M365Config | null {
  const cfg = readM365Config();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.tenantId) {
    res.status(503).json({ error: "Connector Microsoft 365 não está configurado." });
    return null;
  }
  return cfg;
}

export function registerM365Routes(app: Application): void {
  // ── GET /api/connectors/m365/connect ─────────────────────────────────────
  app.get("/api/connectors/m365/connect", async (req, res) => {
    const cfg = requireM365Config(res);
    if (!cfg) return;

    try {
      const raw = req.cookies?.[COOKIE_NAME] as string | undefined;
      if (!raw) { res.status(401).json({ error: "Não autenticado" }); return; }

      const { payload } = await jwtVerify(raw, getJwtSecret());
      const userId = parseInt(String(payload.sub), 10);
      const user = await getUserById(userId);
      if (!user) { res.status(401).json({ error: "Utilizador não encontrado" }); return; }

      const org = await getOrCreateOrgForOwner(userId, user.name ?? undefined);

      // State: JWT curto assinado — prova de adulteração, expira em 10min.
      // Carrega só o essencial para o callback identificar a org sem confiar
      // em nada vindo da query (CSRF / cross-tenant).
      const state = await new SignJWT({ orgId: org.id, nonce: randomBytes(16).toString("hex") })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(STATE_EXPIRY)
        .sign(getJwtSecret());

      const authUrl = new URL(`${AUTHORITY_HOST}/organizations/oauth2/v2.0/authorize`);
      authUrl.searchParams.set("client_id", cfg.clientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirectUri());
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("scope", GRAPH_SCOPE);
      authUrl.searchParams.set("state", state);

      res.redirect(authUrl.toString());
    } catch (err) {
      console.error("[M365] /connect error:", err);
      res.status(401).json({ error: "Token inválido" });
    }
  });

  // ── GET /api/connectors/m365/callback ────────────────────────────────────
  app.get("/api/connectors/m365/callback", async (req, res) => {
    const cfg = requireM365Config(res);
    if (!cfg) return;

    // Consentimento recusado (ou outro erro devolvido pela Microsoft) —
    // nunca crasha, só redireciona com um estado claro para o frontend tratar.
    if (req.query.error) {
      console.warn("[M365] /callback erro Microsoft:", req.query.error, req.query.error_description);
      res.redirect(`${ENV.appUrl}/connectors?m365=error`);
      return;
    }

    const rawState = req.query.state;
    if (typeof rawState !== "string" || !rawState) {
      res.status(400).json({ error: "State ausente." });
      return;
    }

    // Valida o state ANTES de tocar em qualquer dado — o orgId usado no
    // resto do handler vem SEMPRE daqui, nunca da query (cross-tenant/CSRF).
    let orgId: number;
    try {
      const { payload } = await jwtVerify(rawState, getJwtSecret());
      orgId = Number(payload.orgId);
      if (!orgId || Number.isNaN(orgId)) throw new Error("orgId ausente ou inválido no state");
    } catch (err) {
      console.error("[M365] /callback state inválido:", err);
      res.status(400).json({ error: "State inválido ou expirado." });
      return;
    }

    const code   = req.query.code;
    const tenant = req.query.tenant; // tenant real do cliente (autoridade era /organizations)
    if (typeof code !== "string" || !code || typeof tenant !== "string" || !tenant) {
      res.status(400).json({ error: "Resposta da Microsoft incompleta (code/tenant em falta)." });
      return;
    }

    try {
      const tokenRes = await fetch(`${AUTHORITY_HOST}/${tenant}/oauth2/v2.0/token`, {
        method: "POST",
        body: new URLSearchParams({
          client_id:     cfg.clientId,
          client_secret: cfg.clientSecret,
          code,
          grant_type:    "authorization_code",
          redirect_uri:  redirectUri(),
          scope:         GRAPH_SCOPE,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!tokenRes.ok) {
        throw new Error(`Microsoft token endpoint ${tokenRes.status}: ${await tokenRes.text()}`);
      }

      const tokenData = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      await upsertM365Connection({
        organizationId:   orgId,
        tenantId:         tenant,
        accessTokenEnc:   encrypt(tokenData.access_token),
        refreshTokenEnc:  tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        tokenExpiresAt:   new Date(Date.now() + tokenData.expires_in * 1000),
        status:           "connected",
      });

      res.redirect(`${ENV.appUrl}/connectors?m365=connected`);
    } catch (err) {
      console.error("[M365] /callback falha na troca de tokens:", err);
      res.redirect(`${ENV.appUrl}/connectors?m365=error`);
    }
  });
}
