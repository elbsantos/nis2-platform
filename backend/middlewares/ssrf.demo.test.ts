/**
 * backend/middlewares/ssrf.demo.test.ts
 *
 * REGRESSÃO SSRF — A2 (auditoria CISPLAN v1) — duas metades da defesa
 *
 * Metade 1 — assertSafeRedirect (redirect chain):
 *   Alvo inicial é IP literal (127.0.0.1:portA). Node.js não chama safeLookup
 *   para IPs (faz net.isIP internamente); a 1.ª ligação chega a portA.
 *   portA responde 302 → http://127.0.0.1:portB/. assertSafeRedirect deteta
 *   o IP privado no redirect e bloqueia antes de qualquer ligação a portB.
 *
 * Metade 2 — safeLookup (1.º hop):
 *   Alvo é hostname 'localhost'. safeLookup fast-path bloqueia (BLOCKED_HOSTNAMES)
 *   antes de qualquer TCP. O servidor em localhost:port nunca recebe a ligação.
 *
 * Sem rede externa — tudo em localhost efémero. Sem mocks de módulo.
 */

import { describe, it, expect } from "vitest";
import http from "http";
import { checkHttpHeaders } from "../integrations/http-headers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startServer(
  handler: http.RequestListener
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return reject(new Error("endereço inválido"));
      resolve({ server, port: (addr as { port: number }).port });
    });
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("SSRF — regressão A2: duas metades da defesa", () => {
  it(
    "Metade 1 — assertSafeRedirect bloqueia redirect 302 → 127.0.0.1 (redirect chain exercida)",
    async () => {
      let portAReached = false;
      let portBReached = false;

      // Servidor B — alvo interno; nunca deve ser alcançado
      const { server: internal, port: portB } = await startServer((_req, res) => {
        portBReached = true;
        res.writeHead(200, { "Server": "INTERNAL-REACHED", "Content-Type": "text/plain" });
        res.end("recurso interno");
      });

      // Servidor A — responde 302 para IP interno (simula servidor do atacante)
      const { server: redirector, port: portA } = await startServer((_req, res) => {
        portAReached = true;
        res.writeHead(302, { "Location": `http://127.0.0.1:${portB}/` });
        res.end();
      });

      try {
        // IP literal como alvo: Node.js salta safeLookup (net.isIP=true), liga direto a portA.
        // assertSafeRedirect interceta "Location: http://127.0.0.1:portB/" antes de seguir.
        const result = await checkHttpHeaders(`127.0.0.1:${portA}`);

        // Prova que a 1.ª ligação PASSOU — portA foi atingido (não foi safeLookup a bloquear)
        expect(portAReached).toBe(true);
        // Prova que assertSafeRedirect bloqueou o redirect — portB nunca alcançado
        expect(portBReached).toBe(false);
        // Sem headers úteis devolvidos → score null
        expect(result.score).toBeNull();
        expect(result.serverBanner).not.toBe("INTERNAL-REACHED");
      } finally {
        await stopServer(redirector);
        await stopServer(internal);
      }
    },
    15_000
  );

  it(
    "Metade 2 — safeLookup bloqueia alvo que resolve directo para IP privado (1.º hop)",
    async () => {
      let serverReached = false;

      // Servidor em escuta — nunca deve receber a ligação
      const { server, port } = await startServer((_req, res) => {
        serverReached = true;
        res.writeHead(200, { "Server": "SHOULD-NOT-REACH" });
        res.end();
      });

      try {
        // Hostname 'localhost' → safeLookup fast-path: BLOCKED_HOSTNAMES → bloqueia antes de TCP
        const result = await checkHttpHeaders(`localhost:${port}`);

        // Prova que safeLookup bloqueou ANTES de TCP — servidor não foi atingido
        expect(serverReached).toBe(false);
        expect(result.score).toBeNull();
      } finally {
        await stopServer(server);
      }
    },
    10_000
  );
});
