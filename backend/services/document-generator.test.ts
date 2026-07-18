/**
 * backend/services/document-generator.test.ts
 *
 * C14b — testa infra de geração de documentos:
 *   1. Erro claro quando template em falta
 *   2. CONTENT_TYPES correctos
 *   3. Buffer válido (base64) com template dummy
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";

// ---------------------------------------------------------------------------
// Mocks de módulo — hoisted pelo vitest antes dos imports
// ---------------------------------------------------------------------------

vi.mock("exceljs", () => ({
  default: {
    Workbook: class MockWorkbook {
      xlsx = {
        readFile: vi.fn().mockResolvedValue(undefined),
        writeBuffer: vi.fn().mockResolvedValue(Buffer.from("DUMMY_XLSX_CONTENT")),
      };
    },
  },
}));

vi.mock("pizzip", () => ({
  default: class MockPizZip {
    generate = vi.fn().mockReturnValue(Buffer.from("DUMMY_DOCX_CONTENT"));
  },
}));

vi.mock("docxtemplater", () => ({
  default: class MockDocxtemplater {
    render = vi.fn();
    getZip = vi.fn().mockReturnValue({
      generate: vi.fn().mockReturnValue(Buffer.from("DUMMY_DOCX_CONTENT")),
    });
  },
}));

// ---------------------------------------------------------------------------
// Imports reais (após mocks terem sido registados)
// ---------------------------------------------------------------------------

import {
  generateRegistoRiscos,
  generateInventarioAtivos,
  generatePsi,
  CONTENT_TYPES,
} from "./document-generator";

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

describe("document-generator — guard de template em falta", () => {
  it("generateRegistoRiscos lança erro claro com nome do ficheiro xlsx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateRegistoRiscos(1, 1)).rejects.toThrow(
      "[Documentos] Template não encontrado: registo-riscos.xlsx"
    );
  });

  it("generateInventarioAtivos lança erro claro com nome do ficheiro xlsx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateInventarioAtivos(1, 1)).rejects.toThrow(
      "[Documentos] Template não encontrado: inventario-ativos.xlsx"
    );
  });

  it("generatePsi lança erro claro com nome do ficheiro docx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generatePsi(1)).rejects.toThrow(
      "[Documentos] Template não encontrado: psi-template.docx"
    );
  });
});

describe("document-generator — CONTENT_TYPES", () => {
  it("xlsx mime type é o correcto para Excel Open XML", () => {
    expect(CONTENT_TYPES.xlsx).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("docx mime type é o correcto para Word Open XML", () => {
    expect(CONTENT_TYPES.docx).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });
});

describe("document-generator — com template dummy devolve Buffer codificável em base64", () => {
  it("generateRegistoRiscos devolve Buffer não vazio", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const buf = await generateRegistoRiscos(1, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString("base64")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("generateInventarioAtivos devolve Buffer não vazio", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const buf = await generateInventarioAtivos(1, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString("base64")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("generatePsi devolve Buffer não vazio", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    const buf = await generatePsi(1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString("base64")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
