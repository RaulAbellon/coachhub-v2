// Alto de la barra de navegación inferior en móvil (BottomNav) y utilidades
// derivadas. Estaba duplicado como número suelto en app.tsx (paddingBottom: 70)
// y no lo conocía SessionPage, que usaba `height: 100vh` y por eso dejaba su
// cajón de Asistencia/Anotaciones/Lesiones justo DEBAJO de la barra fija.

/** Alto visual de la BottomNav, sin contar el safe area del iPhone. */
export const BOTTOM_NAV_HEIGHT = 62;

/** Espacio total que ocupa la BottomNav, safe area del iPhone incluida. */
export const BOTTOM_NAV_SPACE = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;

/**
 * Alto disponible para una pantalla a pantalla completa en móvil.
 *
 * Usa `dvh` (dynamic viewport height) en vez de `vh`: en Safari de iOS `100vh`
 * es el alto de la ventana SIN las barras del navegador, así que una pantalla
 * de `100vh` siempre queda un trozo por debajo del borde visible. Con `dvh` el
 * alto se ajusta a lo que realmente se ve.
 */
export const MOBILE_SCREEN_HEIGHT = `calc(100dvh - ${BOTTOM_NAV_SPACE})`;
