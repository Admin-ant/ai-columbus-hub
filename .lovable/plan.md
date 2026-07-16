## Doel

Automatische visual-regression test die controleert dat de PDF uit de preview-download en de PDF uit de e-mailflow **pixel-gelijk** zijn (of binnen een kleine tolerantie), zodat toekomstige wijzigingen aan één render-pad niet ongemerkt de andere laten afwijken.

## Aanpak

Playwright-test die in de app inlogt met de gemanagede Supabase-sessie, een bestaande factuur opent, beide PDF's genereert via de al bestaande renderers, elke pagina naar PNG rastert, en per pagina vergelijkt met `pixelmatch`. Baseline-snapshots worden opgeslagen; verschillen boven de drempel laten de test falen met een diff-afbeelding.

## Stappen

1. **Test-fixture** — `tests/visual/invoice-pdf-parity.spec.ts`
   - Start de dev server (al draaiend op :8080).
   - Log in met de geïnjecteerde Supabase-sessie (localStorage + cookies zoals beschreven in browser-use).
   - Navigeer naar een bekende factuur (via env `TEST_INVOICE_ID`, fallback: eerste factuur uit lijst).
   - Voert twee `page.evaluate` calls uit die de bestaande renderers rechtstreeks aanroepen:
     - Preview-download: `buildTemplatePdfBlob()` via een test-hook op `window` (zie stap 2).
     - E-mail: dezelfde `renderInvoiceTemplatePdfBlob` — beide geven een `Blob` terug die als base64 naar Node wordt gestuurd.
2. **Test-hook** — `src/routes/_authenticated/invoices.$invoiceId.tsx`
   - Alleen in `import.meta.env.DEV`: `window.__invoicePdfTestHook = { renderPreview, renderEmail }`, beide teruggevend als `Blob`. Zo hoeft de test geen UI-knoppen te klikken en zit er geen productiecode-pad omheen.
3. **PDF→PNG rasteriseren** — Node-kant met `pdfjs-dist` (`bun add -d pdfjs-dist pixelmatch pngjs`), elke pagina op 150 DPI, PNG buffers.
4. **Vergelijken** — `pixelmatch` per pagina met `threshold: 0.1`. Metrieken: totaal-pixels, verschillende-pixels, ratio. Faalt als ratio > `0.5%` (aanpasbaar via env).
5. **Artefacten** — bij falen wegschrijven onder `tests/visual/__artifacts__/invoice-pdf/`:
   `preview-page-N.png`, `email-page-N.png`, `diff-page-N.png` — zodat je in de PR/log direct ziet waar het afwijkt.
6. **Baseline-mode** — env `UPDATE_BASELINE=1` slaat de preview-PNG's op als baseline; standaard vergelijkt hij live preview vs. live email en heeft dus geen baseline nodig (beide worden per run gegenereerd).
7. **Runner** — script `bun run test:visual:pdf` in `package.json` dat Playwright met alleen deze spec draait, zodat CI hem apart kan uitvoeren zonder de bestaande `tests/visual/theme.spec.ts` te raken.

## Technische details

**Pagina-tellen mismatch**
Als de twee PDF's een ander aantal pagina's hebben, faalt de test direct met een duidelijk bericht (verschillende pagina-tellen impliceren dat de rendering al afwijkt).

**Dynamische inhoud**
De renderers gebruiken `new Date()` alleen voor `issueStr` uit de factuur-data (niet uit `Date.now()`), dus twee runs zijn deterministisch. QR-codes / handtekeningen zijn deterministisch per factuur.

**Waarom `window.__invoicePdfTestHook`**
De download- en e-mailrenderer zitten in verschillende componenten (`invoice-preview-dialog.tsx` clone-pad vs. `render-invoice-template-pdf.tsx`). Ze via de UI aanroepen zou dialogen en compose-flow openen; via de hook krijgen we allebei via één simpele call.

**Tolerantie**
`0.5%` afwijking is genoeg om font-subpixel jitter tussen twee `html2canvas-pro` runs op te vangen zonder echte kleur/layout regressies te missen. Instelbaar via `PDF_DIFF_THRESHOLD`.

**Bestanden**
- nieuw: `tests/visual/invoice-pdf-parity.spec.ts`
- nieuw: `tests/visual/helpers/pdf-to-png.ts` (pdfjs-dist rasterizer)
- gewijzigd: `src/routes/_authenticated/invoices.$invoiceId.tsx` (dev-only test-hook, ~10 regels achter `import.meta.env.DEV`)
- gewijzigd: `package.json` (dev-deps + script)

## Wat de test **niet** doet

- Geen visuele check op de HTML-preview zelf — die is al gedekt door `tests/visual/theme.spec.ts`.
- Geen semantische PDF-diff (tekstinhoud) — puur pixel-vergelijk, want kleuren + layout is de vraag.
- Geen CI-integratie / GitHub Action — script is runbaar, wel/niet in CI hangen kan later.
