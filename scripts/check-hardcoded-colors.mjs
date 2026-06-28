#!/usr/bin/env node
/**
 * CI check: detect hardcoded colors that bypass the design system.
 *
 * Flags in src/:
 *   - Hex colors (#abc / #aabbcc / #aabbccdd) outside src/styles.css and the
 *     allowlist below
 *   - rgb()/rgba()/hsl()/hsla()/oklch() literals in component code
 *   - Tailwind arbitrary color utilities: bg-[#...], text-[#...], border-[#...],
 *     from-[#...], to-[#...], via-[#...], ring-[#...], fill-[#...], stroke-[#...]
 *   - Raw color utilities like text-white, bg-black, border-white/10
 *
 * Allowed paths (intentional brand / vendor):
 *   - src/styles.css                  (design tokens live here)
 *   - src/integrations/**             (generated)
 *   - src/components/ui/**            (shadcn primitives)
 *   - src/components/offerte-studio-editor.tsx
 *   - src/routes/q.$token.tsx
 *   - src/routes/t.$token.tsx
 *   - src/routes/quote.$token.pdf.tsx
 *   - src/routes/accept.quote.$token.tsx
 *   - src/lib/**                      (PDF / SVG / email HTML generators)
 *   - src/routeTree.gen.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const ALLOW_PATHS = [
  // Design tokens
  "src/styles.css",
  // Generated / vendored
  "src/integrations/",
  "src/components/ui/",
  "src/routeTree.gen.ts",
  // Brand-dark offerte/quote viewers (public, intentional brand theme)
  "src/components/offerte-studio-editor.tsx",
  "src/routes/q.$token.tsx",
  "src/routes/t.$token.tsx",
  "src/routes/quote.$token.pdf.tsx",
  "src/routes/accept.quote.$token.tsx",
  // PDF / signature / print rendering (raster output, not CSS theme)
  "src/components/pdf-template-dialog.tsx",
  "src/components/signature-pad.tsx",
  "src/components/expenses-tab.tsx",
  "src/lib/",
  // Transactional HTML email templates
  "src/routes/api/public/hooks/",
  // OAuth provider brand colors (Google etc.) — externally specified
  "src/routes/auth.tsx",
  // Quote template editor — colors are user/theme data
  "src/routes/_authenticated/quotes.tsx",
  // Pipeline stage status palette + ACCENT constant for inline opacity tricks
  "src/routes/_authenticated/outreach.index.tsx",
  "src/routes/_authenticated/analytics.index.tsx",
  // Enterprise: configurable per-tenant accent color picker
  "src/routes/_authenticated/enterprise.tsx",
  // Offerte-studio index: card thumbnails reuse the brand-dark viewer aesthetic
  "src/routes/_authenticated/offerte-studio.index.tsx",

];


const EXTS = new Set([".ts", ".tsx", ".css"]);

const PATTERNS = [
  { name: "tailwind-arbitrary-hex", re: /\b(?:bg|text|border|from|to|via|ring|fill|stroke|outline|decoration|shadow|caret|accent|placeholder)-\[#[0-9a-fA-F]{3,8}\]/g },
  { name: "raw-hex", re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g },
  { name: "css-color-fn", re: /\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\s*\(/g },
  { name: "raw-tailwind-color", re: /\b(?:bg|text|border|placeholder|hover:bg|hover:text|hover:border|focus:bg|focus:text)-(?:white|black)(?:\/\d{1,3})?\b/g },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (EXTS.has(full.slice(full.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

function isAllowed(relPath) {
  const p = relPath.split(sep).join("/");
  return ALLOW_PATHS.some((a) => (a.endsWith("/") ? p.startsWith(a) : p === a));
}

const findings = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (isAllowed(rel)) continue;
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments-only lines to reduce noise
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        findings.push({ file: rel, line: i + 1, rule: name, snippet: m[0] });
      }
    }
  }
}

if (findings.length === 0) {
  console.log("✓ design-system check: geen hardcoded kleuren gevonden");
  process.exit(0);
}

console.error(`✗ design-system check: ${findings.length} afwijking(en) gevonden\n`);
const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}
for (const [file, items] of byFile) {
  console.error(`  ${file}`);
  for (const it of items) {
    console.error(`    ${it.line}: [${it.rule}] ${it.snippet}`);
  }
}
console.error(
  "\nGebruik semantische tokens (bg-background, text-foreground, bg-brand, ...) " +
  "of voeg de file toe aan ALLOW_PATHS in scripts/check-hardcoded-colors.mjs " +
  "als het een bewuste uitzondering is."
);
process.exit(1);
