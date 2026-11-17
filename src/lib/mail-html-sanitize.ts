import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize mail HTML from an untrusted source (received, sent, drafts) before
 * showing it. Removes scripts, iframes, forms, on*-handlers, javascript:-links
 * and external CSS. External images are blocked unless `allowImages` is true.
 * Links always open in a new tab with rel="noopener noreferrer".
 */
export function sanitizeIncomingMailHtml(
  input: string | null | undefined,
  opts: { allowImages?: boolean } = {},
): { html: string; blockedImages: number } {
  if (!input) return { html: "", blockedImages: 0 };
  let blocked = 0;
  const allowImages = !!opts.allowImages;
  const isExternal = (v: string) => /^\s*(https?:)?\/\//i.test(v);

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (!el.getAttribute) return;
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
    if (!allowImages) {
      for (const attr of ["src", "background", "poster"]) {
        const v = el.getAttribute(attr);
        if (v && isExternal(v)) {
          el.removeAttribute(attr);
          if (attr === "src") el.setAttribute("alt", el.getAttribute("alt") || "[afbeelding geblokkeerd]");
          blocked++;
        }
      }
    }
    const style = el.getAttribute("style");
    if (style && /url\s*\(|expression\s*\(|@import/i.test(style)) {
      const cleaned = style.replace(/url\s*\([^)]*\)/gi, (m) => {
        if (allowImages && /url\s*\(\s*['"]?https?:/i.test(m)) return m;
        blocked++;
        return "none";
      }).replace(/expression\s*\([^)]*\)/gi, "").replace(/@import[^;]*;?/gi, "");
      el.setAttribute("style", cleaned);
    }
  });
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style" && node.textContent) {
      node.textContent = node.textContent
        .replace(/@import[^;]*;?/gi, "")
        .replace(/url\s*\([^)]*\)/gi, (m) => {
          if (allowImages && /url\s*\(\s*['"]?https?:/i.test(m)) return m;
          blocked++;
          return "none";
        })
        .replace(/expression\s*\([^)]*\)/gi, "");
    }
  });
  try {
    const html = DOMPurify.sanitize(String(input).slice(0, 500_000), {
      USE_PROFILES: { html: true },
      ADD_TAGS: ["style"],
      ADD_ATTR: ["style", "align", "valign", "width", "height", "bgcolor", "border", "cellspacing", "cellpadding", "role", "target", "rel", "background", "colspan", "rowspan"],
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|cid:|#)/i,
      FORBID_TAGS: ["script", "iframe", "frame", "frameset", "object", "embed", "form", "input", "button", "select", "textarea", "base", "link", "meta", "applet", "svg", "math"],
      FORBID_ATTR: ["srcset", "formaction", "action", "xlink:href", "ping"],
      ALLOW_DATA_ATTR: false,
      KEEP_CONTENT: true,
    });
    return { html, blockedImages: blocked };
  } finally {
    DOMPurify.removeHook("afterSanitizeAttributes");
    DOMPurify.removeHook("uponSanitizeElement");
  }
}

/** Wrap sanitized HTML in a document with a strict CSP for a sandboxed iframe. */
export function buildSafeMailDocument(html: string, allowImages: boolean): string {
  const img = allowImages ? "img-src https: http: data: cid:;" : "img-src data: cid:;";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${img} style-src 'unsafe-inline'; font-src data:;"><base target="_blank"><style>body{margin:0;padding:8px;font-family:Arial,sans-serif;font-size:14px;color:#111;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}
