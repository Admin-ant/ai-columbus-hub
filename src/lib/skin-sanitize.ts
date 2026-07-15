import DOMPurify from "isomorphic-dompurify";
import { z } from "zod";

/**
 * Sanitize HTML that will be rendered inside an e-mail header/footer or
 * inside a preview via dangerouslySetInnerHTML. Safe for both server and
 * client (isomorphic-dompurify picks the right implementation).
 *
 * Blocks: <script>, event handlers (onclick=…), javascript:/data: URLs,
 * <iframe>, <object>, <embed>, <form>, <meta>, <link>, style tags.
 * Allows: common inline formatting + inline style + safe URLs.
 */
export function sanitizeSkinHtml(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = String(input).slice(0, 20_000);
  return DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: [
      "a", "b", "br", "div", "em", "h1", "h2", "h3", "h4", "hr",
      "i", "img", "li", "ol", "p", "small", "span", "strong",
      "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead",
      "tr", "u", "ul",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "style", "width", "height", "align", "target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "meta", "link", "style"],
    FORBID_ATTR: ["srcset", "formaction", "xlink:href"],
    ALLOW_DATA_ATTR: false,
  });
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const NAMED_COLOR = /^[a-zA-Z]{3,20}$/; // white, transparent, rebeccapurple, …

/** Accept `#rgb`/`#rrggbb`/`#rrggbbaa` or a plain CSS keyword. Empty → null. */
export function sanitizeColor(input: string | null | undefined): string | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  if (v.length > 32) return null;
  if (HEX_COLOR.test(v) || NAMED_COLOR.test(v)) return v;
  return null;
}

/** Only allow absolute http(s) URLs for the background image. */
export function sanitizeImageUrl(input: string | null | undefined): string | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  if (v.length > 2000) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Zod schema for skin/template header+footer input (used on save). */
export const skinInputSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(120),
  background_color: z.string().max(32).nullable().optional(),
  background_image_url: z.string().max(2000).nullable().optional(),
  header_html: z.string().max(20_000).nullable().optional(),
  footer_html: z.string().max(20_000).nullable().optional(),
});

export type SkinInput = z.infer<typeof skinInputSchema>;

/** Validate + sanitize in one pass. Throws on invalid name. */
export function sanitizeSkinInput(input: SkinInput) {
  const parsed = skinInputSchema.parse(input);
  return {
    name: parsed.name,
    background_color: sanitizeColor(parsed.background_color ?? null),
    background_image_url: sanitizeImageUrl(parsed.background_image_url ?? null),
    header_html: parsed.header_html ? sanitizeSkinHtml(parsed.header_html) : null,
    footer_html: parsed.footer_html ? sanitizeSkinHtml(parsed.footer_html) : null,
  };
}
