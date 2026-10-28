import { Button } from "@/components/ui/button";
import { sanitizeMailHtml } from "@/lib/skin-sanitize";

/** Escape token values so they can be inserted safely into an HTML template. */
export function escapeTokenVars(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  return out;
}

/** Shows an HTML template as the formatted mail the recipient will receive. */
export function HtmlMailBody({
  html,
  height = 420,
  onSwitchToText,
}: {
  html: string;
  height?: number;
  onSwitchToText: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="overflow-hidden rounded-md border border-input bg-muted">
        <iframe
          title="Voorbeeld van de opgemaakte mail"
          sandbox=""
          srcDoc={sanitizeMailHtml(html)}
          className="w-full bg-background"
          style={{ height }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Opgemaakte mail — wordt precies zo verstuurd. Aanpassen doe je in Mail → Sjablonen.</span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onSwitchToText}>
          Gewone tekst typen
        </Button>
      </div>
    </div>
  );
}
