import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type jsPDF from "jspdf";

import { prepareCreditNotePdf } from "@/lib/credit-note-pdf";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CreditNotePdfPreviewDialog({
  creditNoteId,
  userId,
  open,
  onOpenChange,
}: {
  creditNoteId: string;
  userId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [doc, setDoc] = useState<jsPDF | null>(null);
  const [filename, setFilename] = useState("creditnota.pdf");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSrc(null);
    prepareCreditNotePdf({ creditNoteId, userId })
      .then((r) => {
        if (cancelled) return;
        setDoc(r.doc);
        setFilename(r.filename);
        setSrc(r.dataUrl);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Preview maken mislukt"),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, creditNoteId, userId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Voorbeeld creditnota</DialogTitle>
          <DialogDescription>
            Controleer de creditnota voordat je de PDF downloadt.
          </DialogDescription>
        </DialogHeader>

        <div className="h-[65vh] overflow-hidden rounded-md border bg-muted/30">
          {loading || !src ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <iframe title="Creditnota voorbeeld" src={src} className="h-full w-full" />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Sluiten
          </Button>
          <Button
            disabled={!doc || loading}
            onClick={() => {
              doc?.save(filename);
              onOpenChange(false);
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Downloaden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
