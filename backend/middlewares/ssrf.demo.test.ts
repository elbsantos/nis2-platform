/**
 * backend/middlewares/ssrf.demo.test.ts
 *
 * REGRESSÃO SSRF — A2 (auditoria CISPLAN v1)
 *
 * Demonstra que a cadeia de exploração está agora BLOQUEADA:
 *   localhost:portA (302 → http://127.0.0.1:portB/) é interceptada por safeLookup
 *   antes de conectar ao portA — localhost resolve para 127.0.0.1 (IP privado).
 *   checkHttpHeaders devolve score: null (inacessível), não o banner do servidor interno.
 *
 * Sem rede externa — tudo em localhost efémero.
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
      resolve({ server, port: addr.port });
    });
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// Demonstração
// ---------------------------------------------------------------------------

describe("SSRF — regressão A2: redirect para 127.0.0.1 bloqueado por safeLookup", () => {
  it(
    "checkHttpHeaders com alvo localhost retorna score: null (safeLookup bloqueia 127.0.0.1)",
    async () => {
      // Servidor B — nunca deve ser alcançado após a correcção A2
      const { server: internal, port: portB } = await startServer((_req, res) => {
        res.writeHead(200, {
          "Server":       "INTERNAL-REACHED",
          "Content-Type": "text/plain",
        });
        res.end("recurso interno");
      });

      // Servidor A — responde 302 para o servidor interno; mas safeLookup bloqueia
      // a ligação inicial a localhost antes de sequer chegar ao redirect.
      const { server: redirector, port: portA } = await startServer((_req, res) => {
        res.writeHead(302, { "Location": `http://127.0.0.1:${portB}/` });
        res.end();
      });

      try {
        const result = await checkHttpHeaders(`localhost:${portA}`);

        // safeLookup bloqueia localhost → 127.0.0.1 antes de qualquer conexão TCP.
        // checkHttpHeaders não consegue chegar ao servidor A (nem ao B).
        // Resultado esperado: inacessível (score: null).
        expect(result.score).toBeNull();

        // O banner do servidor interno nunca deve aparecer.
        expect(result.serverBanner).not.toBe("INTERNAL-REACHED");
      } finally {
        await stopServer(redirector);
        await stopServer(internal);
      }
    },
    15_000
  );
});
