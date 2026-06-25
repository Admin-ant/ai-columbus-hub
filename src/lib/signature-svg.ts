// Strict allowlist sanitizer for signature SVGs.
// The signature pad only ever emits <svg> containing <path> elements with
// d, fill, stroke, stroke-width, stroke-linecap, stroke-linejoin attributes.
// Anything else (scripts, event handlers, foreignObject, <image>, <use>, etc.)
// is stripped to prevent stored XSS.

const PATH_ATTR_RE =
  /\s(d|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)="([^"<>]*)"/g;

export function sanitizeSignatureSvg(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 200_000) return "";

  // Extract viewBox / width / height from the root <svg>.
  const svgOpen = trimmed.match(/<svg\b([^>]*)>/i);
  if (!svgOpen) return "";
  const attrs = svgOpen[1] ?? "";
  const viewBox = attrs.match(/\sviewBox="([0-9.\-\s]+)"/i)?.[1] ?? "0 0 600 180";
  const width = attrs.match(/\swidth="([0-9.]+)"/i)?.[1] ?? "600";
  const height = attrs.match(/\sheight="([0-9.]+)"/i)?.[1] ?? "180";

  // Pull out every <path .../> tag, keep only the allowed attributes.
  const paths: string[] = [];
  const pathRe = /<path\b([^>]*?)\/?>(?:<\/path>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(trimmed)) !== null) {
    const rawAttrs = m[1] ?? "";
    let safeAttrs = "";
    PATH_ATTR_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = PATH_ATTR_RE.exec(rawAttrs)) !== null) {
      const name = am[1];
      const value = am[2];
      // Defensive: reject anything that looks like JS/markup injection in value.
      if (/[<>]|javascript:|expression\(|url\(/i.test(value)) continue;
      safeAttrs += ` ${name}="${value}"`;
    }
    if (safeAttrs.length > 0) paths.push(`<path${safeAttrs}/>`);
    if (paths.length > 5000) break;
  }

  if (paths.length === 0) return "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">${paths.join("")}</svg>`;
}
