import { describe, expect, it } from "vitest";
import { mobileMediaQuery, readIsMobile } from "../useIsMobile";

function winWith(opts: {
  matches?: boolean;
  innerWidth?: number;
  clientWidth?: number;
}) {
  return {
    matchMedia:
      opts.matches === undefined
        ? undefined
        : (_q: string) => ({ matches: opts.matches as boolean }),
    innerWidth: opts.innerWidth,
    document: { documentElement: { clientWidth: opts.clientWidth } },
  };
}

describe("mobileMediaQuery", () => {
  it("genera la media query del breakpoint", () => {
    expect(mobileMediaQuery(768)).toBe("(max-width: 767.98px)");
    expect(mobileMediaQuery(1024)).toBe("(max-width: 1023.98px)");
  });
});

describe("readIsMobile", () => {
  it("usa matchMedia cuando está disponible", () => {
    expect(readIsMobile(768, winWith({ matches: true, innerWidth: 1137 }))).toBe(true);
    expect(readIsMobile(768, winWith({ matches: false, innerWidth: 390 }))).toBe(false);
  });

  it("caso del bug: innerWidth desbordado pero pantalla de móvil", () => {
    // Sin matchMedia, el fallback debe fiarse de clientWidth (390), no de innerWidth (1137).
    expect(readIsMobile(768, winWith({ innerWidth: 1137, clientWidth: 390 }))).toBe(true);
  });

  it("fallback a innerWidth si no hay clientWidth", () => {
    expect(readIsMobile(768, winWith({ innerWidth: 500 }))).toBe(true);
    expect(readIsMobile(768, winWith({ innerWidth: 1200 }))).toBe(false);
  });

  it("escritorio con clientWidth grande", () => {
    expect(readIsMobile(768, winWith({ innerWidth: 1440, clientWidth: 1440 }))).toBe(false);
  });

  it("devuelve false sin window (SSR)", () => {
    expect(readIsMobile(768, null)).toBe(false);
  });

  it("devuelve false con anchos a 0", () => {
    expect(readIsMobile(768, winWith({ innerWidth: 0, clientWidth: 0 }))).toBe(false);
  });
});
