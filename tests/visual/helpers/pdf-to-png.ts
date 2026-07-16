/**
 * Rasterise every page of a PDF (given as a byte buffer) to PNG buffers,
 * using pdfjs-dist in Node. Used by the invoice-pdf-parity spec so we can
 * pixel-compare two PDFs.
 */
import { PNG } from "pngjs";
// pdfjs-dist v6 ships a Node-friendly legacy build.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no bundled types for the legacy entry
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// Minimal Canvas polyfill for pdf.js in Node. We back it with a raw RGBA
// buffer and let pdf.js write into ImageData. We don't need full 2D API —
// just the subset pdf.js touches for the render pipeline: getContext("2d"),
// createImageData, putImageData, drawImage, transform, fillRect, ...
//
// pdf.js v6 supports a Node canvas by way of an injected `canvasFactory`.
// It expects `{ create, reset, destroy }` returning `{ canvas, context }`.
// We hand it a real `@napi-rs/canvas`-less shim using the `canvas` polyfill
// bundled with pdfjs-dist under `legacy/build/pdf.mjs` via `NodeCanvasFactory`
// exported on the module (undocumented but stable across 4.x → 6.x).

interface CanvasLike {
  width: number;
  height: number;
}

interface CanvasFactoryResult {
  canvas: CanvasLike;
  context: unknown;
}

// pdfjs-dist v6 exports a Node-compatible canvas factory when running under
// Node with `@napi-rs/canvas` or `canvas`. To avoid pulling a native canvas
// dep, we render into an offscreen `OffscreenCanvas`-shaped buffer via a
// tiny factory that returns an ImageData-backed context implementing the
// operations pdf.js uses.
//
// Rather than reimplement Canvas2D (a lot of work), we lean on the
// pre-existing implementation shipped by pdfjs-dist: it exposes a
// `getDocument({ ..., canvasFactory })` API, and its own default factory
// uses the DOM. In Node we must provide one. The cleanest way without a
// native dep is `@napi-rs/canvas`, so we import it lazily and fall back to
// throwing a clear error if it's missing.

async function loadCanvasFactory(): Promise<{
  create: (w: number, h: number) => CanvasFactoryResult;
  reset: (result: CanvasFactoryResult, w: number, h: number) => void;
  destroy: (result: CanvasFactoryResult) => void;
}> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — optional peer dep, imported dynamically
  const mod = await import("@napi-rs/canvas").catch(() => null);
  if (!mod) {
    throw new Error(
      "Missing peer dep '@napi-rs/canvas' — install with `bun add -d @napi-rs/canvas` to enable PDF rasterization.",
    );
  }
  const { createCanvas } = mod as { createCanvas: (w: number, h: number) => CanvasLike };
  return {
    create(w, h) {
      const canvas = createCanvas(Math.max(1, w), Math.max(1, h));
      const context = (canvas as unknown as { getContext: (t: string) => unknown }).getContext("2d");
      return { canvas, context };
    },
    reset(result, w, h) {
      result.canvas.width = Math.max(1, w);
      result.canvas.height = Math.max(1, h);
    },
    destroy(result) {
      result.canvas.width = 0;
      result.canvas.height = 0;
    },
  };
}

export interface RasterOptions {
  /** Render density; 150 DPI matches the parity spec default. */
  dpi?: number;
}

/**
 * Render every page of the given PDF to a PNG buffer.
 * All pages are rasterised at the same DPI so pixel dimensions can be
 * compared 1:1 across two PDFs of the same layout.
 */
export async function pdfToPngPages(
  pdfBytes: Uint8Array,
  opts: RasterOptions = {},
): Promise<{ width: number; height: number; buffer: Buffer }[]> {
  const dpi = opts.dpi ?? 150;
  const scale = dpi / 72; // pdf points are 72/inch

  const canvasFactory = await loadCanvasFactory();

  const loadingTask = (pdfjs as {
    getDocument: (opts: unknown) => { promise: Promise<unknown> };
  }).getDocument({
    data: pdfBytes,
    disableFontFace: false,
    useSystemFonts: true,
    canvasFactory,
  });
  const doc = (await loadingTask.promise) as {
    numPages: number;
    getPage: (n: number) => Promise<unknown>;
  };

  const pages: { width: number; height: number; buffer: Buffer }[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = (await doc.getPage(p)) as {
      getViewport: (opts: { scale: number }) => { width: number; height: number };
      render: (opts: unknown) => { promise: Promise<void> };
    };
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);

    const target = canvasFactory.create(width, height);
    await page.render({
      canvasContext: target.context,
      viewport,
      canvasFactory,
    }).promise;

    // Convert the canvas to a PNG buffer.
    const encoded = (target.canvas as unknown as { toBuffer: (mime: string) => Buffer }).toBuffer(
      "image/png",
    );
    pages.push({ width, height, buffer: encoded });
    canvasFactory.destroy(target);
  }

  return pages;
}

/** Read a PNG buffer into a pngjs `PNG` instance (RGBA pixels + dims). */
export function decodePng(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}
