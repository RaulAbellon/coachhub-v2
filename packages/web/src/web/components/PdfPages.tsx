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
 * IMPORTANTE: el fichero es un script CLÁSICO (formato IIFE), no un módulo, y la
 * extensión tiene que ser `.js`. Dos motivos, los dos por el iPhone:
 *  1. pdf.js, si le das solo la URL, crea el worker con
 *     `new Worker(url, { type: "module" })`, y los "module workers" NO existen en
 *     WKWebView (o sea, en Safari ni en Chrome de iOS). Al fallar, pdf.js intenta
 *     su "fake worker" con un import() dinámico, que falla igual: de ahí el error
 *     «Setting up fake worker failed: Importing a module script failed».
 *     La solución es crear nosotros un Worker clásico y pasárselo por `port`.
 *  2. Los `.mjs` servidos desde `public/` llegan sin cabecera `content-type` y
 *     WebKit los rechaza; con `.js` el servidor manda `text/javascript`.
 *
 * Si se actualiza pdfjs-dist hay que regenerar el fichero (no vale copiarlo tal
 * cual, porque el del paquete es un módulo):
 *   cd packages/web && bunx esbuild node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs \
 *     --bundle --format=iife --minify --target=es2017 --outfile=public/pdf.worker.min.js
 */
const WORKER_URL = "/pdf.worker.min.js";

/**
 * Segunda vía, la que salva al iPhone: el MISMO código de pdf.js empaquetado como
 * script clásico que se cuelga de `window.pdfjsWorker`. Cargándolo con una
 * etiqueta <script> normal (nada de módulos, nada de Worker), pdf.js detecta
 * `globalThis.pdfjsWorker.WorkerMessageHandler` y procesa el PDF **en el hilo
 * principal**, sin crear ningún Worker (ver `PDFWorker#initialize` en pdf.mjs).
 *
 * Hace falta porque en el iPhone de verdad (WKWebView) el Worker no arranca: el
 * usuario veía «El worker de pdf.js falló: el worker no arrancó». Va algo más
 * lento (bloquea la interfaz mientras lee el PDF), pero funciona siempre y las
 * sesiones son PDFs de pocas páginas.
 *
 * Al actualizar pdfjs-dist hay que regenerar los DOS ficheros:
 *   cd packages/web && bunx esbuild node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs \
 *     --bundle --format=iife --minify --target=es2017 --outfile=public/pdf.worker.min.js
 *   cd packages/web && bunx esbuild node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs \
 *     --bundle --format=iife --global-name=pdfjsWorker --minify --target=es2017 \
 *     --outfile=public/pdf.worker.main.js
 */
const MAIN_THREAD_URL = "/pdf.worker.main.js";

/** Cache: el script del hilo principal solo se descarga y evalúa una vez. */
let mainThreadPromise: Promise<void> | null = null;

function loadMainThreadHandler(): Promise<void> {
  if (!mainThreadPromise) {
    mainThreadPromise = new Promise<void>((resolve, reject) => {
      const g = globalThis as { pdfjsWorker?: { WorkerMessageHandler?: unknown } };
      if (g.pdfjsWorker?.WorkerMessageHandler) return resolve();
      const script = document.createElement("script");
      script.src = MAIN_THREAD_URL;
      script.async = true;
      script.onload = () =>
        g.pdfjsWorker?.WorkerMessageHandler
          ? resolve()
          : reject(new Error("el script de pdf.js no expuso WorkerMessageHandler"));
      script.onerror = () => reject(new Error("no se pudo descargar el script de pdf.js"));
      document.head.appendChild(script);
    }).catch((e) => {
      // Si falla, se permite reintentar en el siguiente PDF.
      mainThreadPromise = null;
      throw e;
    });
  }
  return mainThreadPromise;
}

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
      // Respaldo por si no se pudiera crear el Worker clásico a mano: pdf.js
      // seguiría intentando su ruta normal con esta URL.
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
 * Abre el PDF en una pestaña nueva usando un blob URL. No se puede abrir el data
 * URL directamente: Safari y Chrome bloquean `window.open("data:...")` por
 * seguridad. Con blob sí lo permiten y se usa el visor nativo del sistema.
 */
function openInNewTab(dataUrl: string) {
  try {
    const blob = new Blob([dataUrlToBytes(dataUrl) as unknown as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // Se libera con retraso: si se revoca al instante, la pestaña nueva no llega
    // a leer el blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    // Si el navegador no deja abrir la pestaña, siempre queda el enlace de descarga.
  }
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
  const [slow, setSlow] = useState(false);
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
    // El Worker se crea aquí, uno por documento (y no uno global compartido),
    // para que abrir a la vez la sesión de pista y la de físico no se pisen.
    let port: Worker | null = null;
    // Aviso al usuario si tarda, para no dejarle mirando «Cargando PDF…».
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlow(true);
    }, 5000);
    setDoc(null);
    setError(null);

    /**
     * Intento 1: Worker de verdad (rápido, no bloquea la interfaz). Se le pone un
     * plazo porque en el iPhone el Worker no arranca y pdf.js NO rechaza la
     * promesa: se queda esperando eternamente. Si falla, limpia lo que haya
     * creado antes de propagar el error.
     */
    const openWithWorker = async (pdfjs: Awaited<ReturnType<typeof loadPdfjs>>) => {
      const w = new Worker(WORKER_URL);
      let task: ReturnType<typeof pdfjs.getDocument> | null = null;
      try {
        const worker = new pdfjs.PDFWorker({ port: w as unknown as null });
        const t = pdfjs.getDocument({ data: dataUrlToBytes(dataUrl), worker });
        task = t;
        const loaded = await new Promise<PDFDocumentProxy>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error("el worker no contestó")), 6000);
          w.addEventListener("error", (ev) =>
            reject(new Error((ev as ErrorEvent).message || "el worker no arrancó")),
          );
          t.promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
        });
        return { loaded, task: t, port: w };
      } catch (e) {
        void task?.destroy();
        w.terminate();
        throw e;
      }
    };

    /**
     * Intento 2 (el que funciona en el iPhone): pdf.js en el hilo principal, sin
     * Worker ninguno. Hay que volver a generar los bytes: pdf.js transfiere el
     * buffer al worker en el primer intento y ese se queda vacío.
     */
    const openOnMainThread = async (pdfjs: Awaited<ReturnType<typeof loadPdfjs>>) => {
      await loadMainThreadHandler();
      const task = pdfjs.getDocument({ data: dataUrlToBytes(dataUrl) });
      return { loaded: await task.promise, task };
    };

    (async () => {
      let motivoWorker = "";
      try {
        const pdfjs = await loadPdfjs();
        let loaded: PDFDocumentProxy;
        try {
          const r = await openWithWorker(pdfjs);
          loadTask = r.task;
          port = r.port;
          loaded = r.loaded;
        } catch (e) {
          motivoWorker = e instanceof Error ? e.message : "falló el worker";
          if (cancelled) return;
          const r = await openOnMainThread(pdfjs);
          loadTask = r.task;
          loaded = r.loaded;
        }
        if (cancelled) return;
        window.clearTimeout(slowTimer);
        setSlow(false);
        setDoc(loaded);
      } catch (e) {
        const motivo = e instanceof Error ? e.message : "No se pudo abrir el PDF";
        if (!cancelled) setError(motivoWorker ? `${motivo} (worker: ${motivoWorker})` : motivo);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
      // Primero el documento y luego el worker: si se mata el Worker antes de
      // que pdf.js cierre el documento, se quedan promesas colgadas.
      void Promise.resolve(loadTask?.destroy()).finally(() => port?.terminate());
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
          No se pudo abrir el PDF aquí dentro.
          {/* Salida de emergencia: se abre el PDF en una pestaña nueva con un blob
              URL, así se usa el visor nativo del sistema (en iOS muestra todas las
              páginas) aunque pdf.js no haya podido arrancar. */}
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={() => openInNewTab(dataUrl)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Abrir el PDF
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <a href={dataUrl} download={name || "sesion.pdf"} style={{ color: "var(--accent)", fontSize: 12 }}>
              Descargar el archivo
            </a>
          </div>
          {/* Se muestra el motivo real: si vuelve a fallar en un movil concreto,
              con este texto se sabe si es el worker, la memoria o el fichero. */}
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--text-muted)", wordBreak: "break-word" }}>{error}</div>
        </div>
      ) : !doc || width === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          Cargando PDF…
          {/* Si tarda, no se deja al usuario mirando el mensaje: se le ofrece ya
              abrirlo con el visor del sistema sin esperar a que caduque. */}
          {slow && (
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() => openInNewTab(dataUrl)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--accent)",
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                Abrir el PDF aparte
              </button>
            </div>
          )}
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
