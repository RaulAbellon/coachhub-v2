import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_SIDE,
  scaledSize,
  sessionFileKind,
  sessionFileLabel,
  isHeicFile,
  isImageFile,
  validateSessionFile,
} from "../sessionFiles";

describe("sessionFileKind", () => {
  it("detecta fotos", () => {
    expect(sessionFileKind("data:image/jpeg;base64,AAA")).toBe("image");
    expect(sessionFileKind("data:image/png;base64,AAA")).toBe("image");
  });
  it("detecta PDF", () => {
    expect(sessionFileKind("data:application/pdf;base64,AAA")).toBe("pdf");
  });
  it("sin adjunto devuelve none", () => {
    expect(sessionFileKind("")).toBe("none");
    expect(sessionFileKind(null)).toBe("none");
    expect(sessionFileKind(undefined)).toBe("none");
  });
  it("data URL raro se trata como PDF (sesiones antiguas)", () => {
    expect(sessionFileKind("JVBERi0xLjQK")).toBe("pdf");
  });
});

describe("sessionFileLabel", () => {
  it("devuelve la palabra correcta", () => {
    expect(sessionFileLabel("data:image/jpeg;base64,AAA")).toBe("foto");
    expect(sessionFileLabel("data:application/pdf;base64,AAA")).toBe("PDF");
    expect(sessionFileLabel("")).toBe("archivo");
  });
});

describe("isImageFile / isHeicFile", () => {
  it("reconoce por mime y por extensión", () => {
    expect(isImageFile({ type: "image/jpeg", name: "a.jpg" })).toBe(true);
    expect(isImageFile({ type: "", name: "pizarra.PNG" })).toBe(true);
    expect(isImageFile({ type: "application/pdf", name: "sesion.pdf" })).toBe(false);
  });
  it("reconoce HEIC", () => {
    expect(isHeicFile({ type: "image/heic", name: "IMG_1.heic" })).toBe(true);
    expect(isHeicFile({ type: "", name: "IMG_1.HEIF" })).toBe(true);
    expect(isHeicFile({ type: "image/jpeg", name: "a.jpg" })).toBe(false);
  });
});

describe("validateSessionFile", () => {
  it("acepta PDF", () => {
    expect(validateSessionFile({ type: "application/pdf", name: "s.pdf" })).toBeNull();
    expect(validateSessionFile({ type: "", name: "s.pdf" })).toBeNull();
  });
  it("acepta fotos normales", () => {
    expect(validateSessionFile({ type: "image/jpeg", name: "a.jpg" })).toBeNull();
    expect(validateSessionFile({ type: "image/png", name: "a.png" })).toBeNull();
    expect(validateSessionFile({ type: "image/webp", name: "a.webp" })).toBeNull();
  });
  it("rechaza HEIC con explicación", () => {
    const msg = validateSessionFile({ type: "image/heic", name: "IMG.heic" });
    expect(msg).toContain("HEIC");
  });
  it("rechaza otros formatos", () => {
    expect(validateSessionFile({ type: "video/mp4", name: "v.mp4" })).toBe(
      "Solo se admiten archivos PDF o fotos (JPG, PNG, WEBP)",
    );
  });
});

describe("scaledSize", () => {
  it("no amplía imágenes pequeñas", () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("reduce por el lado más largo manteniendo proporción", () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: MAX_IMAGE_SIDE, height: 1500 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1500, height: MAX_IMAGE_SIDE });
  });
  it("tolera dimensiones cero", () => {
    expect(scaledSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});
