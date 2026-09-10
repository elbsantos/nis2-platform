/**
 * backend/utils/encryption.test.ts
 *
 * Testes para encrypt()/decrypt()/assertEncryptionKey() — AES-256-GCM.
 * Autocontido: define a própria M365_ENCRYPTION_KEY de teste e restaura o
 * valor original no afterEach, sem depender de env ambiente (CI ou local).
 */

import { describe, it, expect, afterEach } from "vitest";
import { encrypt, decrypt, assertEncryptionKey } from "./encryption";

const _M365_ENCRYPTION_KEY = process.env.M365_ENCRYPTION_KEY;

afterEach(() => {
  process.env.M365_ENCRYPTION_KEY = _M365_ENCRYPTION_KEY;
});

// Duas chaves de 32 bytes válidas e distintas, para os testes de "chave errada".
const VALID_KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

function useKey(key: string | undefined) {
  if (key === undefined) delete process.env.M365_ENCRYPTION_KEY;
  else process.env.M365_ENCRYPTION_KEY = key;
}

describe("encrypt/decrypt — round-trip", () => {
  it("decrypt(encrypt(x)) === x", () => {
    useKey(VALID_KEY);
    const payload = encrypt("segredo");
    expect(decrypt(payload)).toBe("segredo");
  });

  it("preserva string vazia", () => {
    useKey(VALID_KEY);
    const payload = encrypt("");
    expect(decrypt(payload)).toBe("");
  });

  it("preserva UTF-8 — acentos e emojis", () => {
    useKey(VALID_KEY);
    const original = "conformidade não-verificada 🔒 ção çãé";
    const payload = encrypt(original);
    expect(decrypt(payload)).toBe(original);
  });
});

describe("encrypt — IV aleatório", () => {
  it("duas chamadas ao mesmo plaintext dão outputs diferentes, mas ambos decifram para o mesmo valor", () => {
    useKey(VALID_KEY);
    const a = encrypt("mesma-mensagem");
    const b = encrypt("mesma-mensagem");

    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("mesma-mensagem");
    expect(decrypt(b)).toBe("mesma-mensagem");
  });
});

describe("decrypt — deteção de adulteração (tag GCM)", () => {
  it("alterar um byte do ciphertext faz decrypt() lançar, nunca devolver lixo", () => {
    useKey(VALID_KEY);
    const payload = encrypt("segredo");
    const [iv, tag, ciphertext] = payload.split(".");

    const bytes = Buffer.from(ciphertext, "base64");
    bytes[0] = bytes[0] ^ 0xff; // inverte o primeiro byte
    const tampered = [iv, tag, bytes.toString("base64")].join(".");

    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("decrypt — chave errada", () => {
  it("cifrar com uma chave e decifrar com outra lança", () => {
    useKey(VALID_KEY);
    const payload = encrypt("segredo");

    useKey(OTHER_KEY);
    expect(() => decrypt(payload)).toThrow();
  });
});

describe("assertEncryptionKey / loadKey — chave mal formada", () => {
  it("chave ausente lança com mensagem clara", () => {
    useKey(undefined);
    expect(() => assertEncryptionKey()).toThrow("M365_ENCRYPTION_KEY deve ser 32 bytes em base64");
  });

  it("chave com comprimento errado (16 bytes) lança", () => {
    useKey(Buffer.alloc(16, 1).toString("base64"));
    expect(() => assertEncryptionKey()).toThrow("M365_ENCRYPTION_KEY deve ser 32 bytes em base64");
  });

  it("chave não-base64 lança (decodifica para comprimento diferente de 32)", () => {
    useKey("isto não é base64 válido de 32 bytes!!");
    expect(() => assertEncryptionKey()).toThrow("M365_ENCRYPTION_KEY deve ser 32 bytes em base64");
  });

  it("chave válida não lança", () => {
    useKey(VALID_KEY);
    expect(() => assertEncryptionKey()).not.toThrow();
  });
});

describe("decrypt — formato inválido", () => {
  it("payload sem a estrutura iv.tag.ciphertext lança, não crasha de forma feia", () => {
    useKey(VALID_KEY);
    expect(() => decrypt("lixo-que-não-é-o-formato")).toThrow("Formato de payload cifrado inválido.");
  });

  it("payload com 3 segmentos mas iv de comprimento errado lança", () => {
    useKey(VALID_KEY);
    const badIv = Buffer.alloc(4).toString("base64"); // deveria ser 12 bytes
    const payload = [badIv, Buffer.alloc(16).toString("base64"), Buffer.alloc(8).toString("base64")].join(".");
    expect(() => decrypt(payload)).toThrow("Formato de payload cifrado inválido.");
  });
});
