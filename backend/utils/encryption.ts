/**
 * backend/utils/encryption.ts
 *
 * Cifragem em repouso — AES-256-GCM (AEAD). Para dados sensíveis que
 * precisam de ser lidos de volta (ex.: tokens OAuth do M365) — ao contrário
 * de passwords, que são irreversíveis por design (scrypt, ver _core/oauth.ts).
 *
 * Formato do payload devolvido por encrypt() — três segmentos em base64
 * separados por ".":
 *
 *   base64(iv) . base64(authTag) . base64(ciphertext)
 *
 *   iv          12 bytes aleatórios, gerados de novo em CADA chamada a
 *               encrypt() — nunca reutilizar um IV com a mesma chave em GCM.
 *   authTag     16 bytes, produzido pelo GCM na cifragem. Cobre o ciphertext
 *               inteiro; qualquer alteração a um único byte do payload faz
 *               decrypt() lançar em vez de devolver dados corrompidos.
 *   ciphertext  os bytes cifrados do plaintext UTF-8 (pode ter 0 bytes).
 *
 * "." nunca aparece dentro de um segmento — é standard base64 (A-Za-z0-9+/=),
 * não base64url, por isso o separador é inequívoco.
 *
 * Chave: M365_ENCRYPTION_KEY (env), 32 bytes em base64. Sem fallback de
 * desenvolvimento (ao contrário de JWT_SECRET) — uma chave ausente ou mal
 * formada tem de falhar sempre, nunca cifrar com um valor previsível.
 * assertEncryptionKey() valida o formato sem cifrar nada; é chamada no
 * arranque do servidor (backend/_core/index.ts) para falhar cedo.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM       = "aes-256-gcm";
const KEY_BYTES       = 32;
const IV_BYTES        = 12;
const AUTH_TAG_BYTES  = 16;
const SEPARATOR       = ".";

const INVALID_FORMAT_MESSAGE = "Formato de payload cifrado inválido.";
const DECRYPT_FAILED_MESSAGE = "Falha ao decifrar — dados adulterados ou chave incorreta.";

function loadKey(): Buffer {
  const raw = process.env.M365_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `M365_ENCRYPTION_KEY deve ser ${KEY_BYTES} bytes em base64 (recebido: ${key.length} byte${key.length === 1 ? "" : "s"}).`
    );
  }
  return key;
}

/**
 * Valida M365_ENCRYPTION_KEY sem cifrar nada. Chamar no arranque do servidor
 * para falhar antes de aceitar tráfego, em vez de só na primeira cifragem.
 */
export function assertEncryptionKey(): void {
  loadKey();
}

export function encrypt(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(SEPARATOR);
}

export function decrypt(payload: string): string {
  const key = loadKey();

  const parts = payload.split(SEPARATOR);
  if (parts.length !== 3) throw new Error(INVALID_FORMAT_MESSAGE);
  const [ivB64, tagB64, ciphertextB64] = parts;

  let iv: Buffer, authTag: Buffer, ciphertext: Buffer;
  try {
    iv = Buffer.from(ivB64, "base64");
    authTag = Buffer.from(tagB64, "base64");
    ciphertext = Buffer.from(ciphertextB64, "base64");
  } catch {
    throw new Error(INVALID_FORMAT_MESSAGE);
  }
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error(INVALID_FORMAT_MESSAGE);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    // GCM valida a tag em final() — adulteração ou chave errada lançam aqui.
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new Error(DECRYPT_FAILED_MESSAGE);
  }
}
