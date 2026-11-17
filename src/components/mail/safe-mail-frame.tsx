import { useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildSafeMailDocument, sanitizeIncomingMailHtml } from "@/lib/mail-html-sanitize";

/**
 * Shows mail HTML safely: sanitized with DOMPurify and rendered in a sandboxed
 * iframe without scripts or same-origin access. External images stay blocked
 * until the user clicks "Afbeeldingen tonen".
 */
export function SafeMailFrame({ html, height = 520 }: { html: string; height?: number }) {
  const [allowImages, setAllowImages] = useState(false);
  const { doc, blocked } = useMemo(() => {
    const r = sanitizeIncomingMailHtml(html, { allowImages });
    return { doc: buildSafeMailDocument(r.html, allowImages), blocked: r.blockedImages };
  }, [html, allowImages]);
  return (
    <div className="space-y-1.5">
      {!allowImages && blocked > 0 && (
        <div className="flex items-center justify-between gap-2 rounded border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          <span>Externe afbeeldingen zijn geblokkeerd voor je veiligheid.</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setAllowImages(true)}>
            <ImageIcon className="mr-1 h-3 w-3" /> Afbeeldingen tonen
          </Button>
        </div>
      )}
      <iframe
        title="Inhoud van de mail"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={doc}
        className="w-full rounded border border-border bg-background"
        style={{ height }}
      />
    </div>
  );
}
