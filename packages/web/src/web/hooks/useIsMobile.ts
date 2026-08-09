import { useEffect, useState } from "react";

/**
 * Detección de móvil basada en el viewport CSS.
 *
 * OJO: no usar `window.innerWidth`. En Chrome/Safari de móvil, si algo del
 * layout desborda a lo ancho, el navegador ensancha el viewport de layout y
 * `innerWidth` devuelve el ancho del CONTENIDO (p. ej. 1137) en vez del de la
 * pantalla (390). Eso provocaba un bucle: primer render en modo escritorio →
 * el layout de escritorio desborda → `innerWidth` grande → se sigue creyendo
 * escritorio, y en el móvil nunca aparecía la vista móvil (entre otras cosas,
 * el bottom sheet del calendario con "+ Añadir sesión / partido").
 *
 * `matchMedia` y `documentElement.clientWidth` sí van contra el viewport real.
 */

/** Media query equivalente al breakpoint (`< breakpoint`). */
export function mobileMediaQuery(breakpoint: number): string {
  return `(max-width: ${breakpoint - 0.02}px)`;
}

type WindowLike = {
  matchMedia?: (q: string) => { matches: boolean };
  innerWidth?: number;
  document?: { documentElement?: { clientWidth?: number } };
};

/** Lee si el viewport actual es de móvil. Exportada para poder testearla. */
export function readIsMobile(breakpoint: number, win?: WindowLike | null): boolean {
  const w = win ?? (typeof window !== "undefined" ? (window as unknown as WindowLike) : null);
  if (!w) return false; // SSR
  if (typeof w.matchMedia === "function") {
    return w.matchMedia(mobileMediaQuery(breakpoint)).matches;
  }
  const width = w.document?.documentElement?.clientWidth || w.innerWidth || 0;
  return width > 0 && width < breakpoint;
}

export function useIsMobile(breakpoint = 768) {
  // Valor correcto ya en el primer render: sin parpadeo y sin el bucle de arriba.
  const [isMobile, setIsMobile] = useState(() => readIsMobile(breakpoint));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      const check = () => setIsMobile(readIsMobile(breakpoint));
      check();
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }
    const mql = window.matchMedia(mobileMediaQuery(breakpoint));
    const onChange = () => setIsMobile(mql.matches);
    onChange(); // por si cambió entre el render y el efecto
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}
