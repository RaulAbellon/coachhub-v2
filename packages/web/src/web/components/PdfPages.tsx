import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Visor de PDF que pinta TODAS las páginas, una debajo de otra.
 *
 * ¿Por qué no un <iframe src="data:application/pdf...">? Porque en móvil no
 * funciona: Safari de iOS trata el PDF embebido como una previsualización
 * estática y solo muestra la primera página (no deja hacer scroll dentro del
 * iframe), y Chrome de Android directamente no tiene visor embebido. Por eso
 * aquí se renderiza con pdf.js a <canvas>: una página por canvas, y el scroll
 * lo hace el contenedor normal de la página, que sí funciona en el móvil.
 *
 * pdf.js se carga con import() dinámico para que no entre en el bundle inicial
 * (son ~400 KB): solo se descarga cuando alguien abre una sesión con PDF.
 */

/**
 * Ruta del worker. Se sirve como fichero estático propio desde `public/`
 * (`packages/web/public/pdf.worker.min.js`, copiado del paquete pdfjs-dist)
 * en vez de resolverlo con `?url`: así la URL es siempre la misma en desarrollo,
 * en la vista previa y en producción, y no depende de cómo Vite empaquete
 * node_modules ni de un CDN externo.
 *
 * IMPORTANTE: la extensión tiene que ser `.js`, no `.mjs`. El servidor no le pone
 * cabecera `content-type` a los `.mjs`, y WebKit (o sea, cualquier navegador del
 * iPhone, incluido Chrome) se niega a importar un módulo que no llegue como
 * `text/javascript`: fallaba con «Importing a module script failed» y el PDF no
 * se cargaba. Con `.js` el servidor manda `text/javascript` y funciona.
 *
 * Si se actualiza pdfjs-dist hay que volver a copiar el fichero (renombrándolo):
 *   cp packages/web/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs \
 *      packages/web/public/pdf.worker.min.js
 */
const WORKER_URL = "/pdf.worker.min.js";

/** Cache del módulo para no re-importar ni reconfigurar el worker en cada visor. */
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // Se usa la compilación "legacy" a propósito: la moderna usa sintaxis y
      // APIs muy recientes (por ejemplo `Promise.withResolvers`, que Safari solo
      // trae desde la 17.4), así que en un iPhone o iPad con iOS algo antiguo el
      // módulo ni siquiera arranca y el PDF se queda sin cargar. La legacy va
      // transpilada y con polyfills, y funciona en esos navegadores.
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
      return pdfjs as unknown as typeof import("pdfjs-dist");
    })();
  }
  return pdfjsPromise;
}

/** Convierte un data URL de PDF a los bytes que espera pdf.js. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Escala de render. Se limita el devicePixelRatio a 2: a 3x (iPhone) un PDF de
 * varias páginas se come la memoria del navegador y Safari mata la pestaña.
 */
function renderScale(): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return Math.min(dpr, 2);
}

function PdfPage({
  doc,
  pageNumber,
  width,
  total,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  total: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // `render()` de pdf.js no se puede solapar sobre el mismo canvas: si llega
    // otro render (cambio de ancho al girar el móvil) hay que cancelar el anterior.
    let task: { cancel: () => void } | null = null;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const scale = (width / base.width) * renderScale();
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const t = page.render({ canvas, canvasContext: ctx, viewport });
      task = t;
      try {
        await t.promise;
      } catch {
        // Render cancelado (o página descartada): no es un error que mostrar.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, width]);

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        aria-label={`Página ${pageNumber} de ${total}`}
        style={{
          display: "block",
          width: "100%",
          // Reserva el alto real antes de pintar para que el scroll no salte.
          aspectRatio: ratio ? `1 / ${ratio}` : undefined,
          background: "#fff",
        }}
      />
      {total > 1 && (
        <span
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            padding: "3px 8px",
            borderRadius: 6,
            background: "rgba(9,9,11,0.75)",
            color: "var(--text-secondary)",
            pointerEvents: "none",
          }}
        >
          {pageNumber} / {total}
        </span>
      )}
    </div>
  );
}

export default function PdfPages({ dataUrl, name }: { dataUrl: string; name?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  // Ancho disponible: se mide del contenedor y se sigue con ResizeObserver para
  // volver a pintar al girar el móvil.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Se guarda la tarea de carga (no el documento) porque es la que expone
    // destroy(): al desmontar hay que liberar el worker y la memoria del PDF.
    let loadTask: { destroy: () => Promise<void> } | null = null;
    setDoc(null);
    setError(null);

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ data: dataUrlToBytes(dataUrl) });
        loadTask = task;
        const loaded = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }
        setDoc(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo abrir el PDF");
      }
    })();

    return () => {
      cancelled = true;
      void loadTask?.destroy();
    };
  }, [dataUrl]);

  return (
    <div
      ref={wrapRef}
      style={{
        flex: 1,
        overflow: "auto",
        WebkitOverflowScrolling: "touch",
        background: "var(--bg-secondary)",
      }}
    >
      {error ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>
          No se pudo abrir el PDF.
          <br />
          <a href={dataUrl} download={name || "sesion.pdf"} style={{ color: "var(--accent)", fontSize: 12 }}>
            Descargar el archivo
          </a>
          {/* Se muestra el motivo real: si vuelve a fallar en un movil concreto,
              con este texto se sabe si es el worker, la memoria o el fichero. */}
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--text-muted)", wordBreak: "break-word" }}>{error}</div>
        </div>
      ) : !doc || width === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          Cargando PDF…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} pageNumber={i + 1} width={width} total={doc.numPages} />
          ))}
        </div>
      )}
    </div>
  );
}
