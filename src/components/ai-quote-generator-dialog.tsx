import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, MicOff, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { generateQuoteDraft } from "@/lib/ai-power.functions";
import type { StudioPackage, StudioSection } from "@/lib/offerte-studio";

type DraftResult = {
  title: string;
  client: string;
  sections: StudioSection[];
  packages: StudioPackage[];
};

type SpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: SpeechRecognitionEvent) => void;
  onerror: (e: { error?: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

export function AIQuoteGeneratorDialog({
  open,
  onOpenChange,
  defaultClient,
  onResult,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultClient?: string;
  onResult: (draft: DraftResult) => void;
}) {
  const [brief, setBrief] = useState("");
  const [client, setClient] = useState(defaultClient ?? "");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const baseRef = useRef("");
  const generate = useServerFn(generateQuoteDraft);

  useEffect(() => {
    if (!open) {
      stopListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopListening() {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }

  function startListening() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Spraakherkenning niet ondersteund in deze browser (gebruik Chrome).");
      return;
    }
    const rec = new Ctor();
    rec.lang = "nl-NL";
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = brief;
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) {
        txt += e.results[i][0]?.transcript ?? "";
      }
      setBrief((baseRef.current ? baseRef.current + " " : "") + txt);
    };
    rec.onerror = (e) => {
      toast.error(`Microfoon: ${e.error ?? "fout"}`);
      stopListening();
    };
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  async function run() {
    if (!brief.trim()) return toast.error("Beschrijf eerst waar de offerte over gaat");
    setBusy(true);
    try {
      const res = await generate({ data: { brief: brief.trim(), client: client.trim() || undefined } });
      onResult(res as DraftResult);
      toast.success("Offerte gegenereerd ✨");
      onOpenChange(false);
      setBrief("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Genereren mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-brand" />
            AI Offerte-generator
          </DialogTitle>
          <DialogDescription>
            Typ of dicteer waar de offerte over gaat — AI vult alle secties en pakketten in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Klant (optioneel)</Label>
            <Input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Bv. Bakkerij Janssen"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Brief</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => (listening ? stopListening() : startListening())}
                className="h-7"
              >
                {listening ? (
                  <>
                    <MicOff className="mr-1 h-3.5 w-3.5 text-red-500" /> Stop
                  </>
                ) : (
                  <>
                    <Mic className="mr-1 h-3.5 w-3.5" /> Dicteer
                  </>
                )}
              </Button>
            </div>
            <Textarea
              rows={6}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder='Bv. "Webshop voor 5k, Shopify, met productfotografie en 3 maanden support"'
            />
            {listening && (
              <p className="text-xs text-brand">🎙️ Luisteren… praat gewoon door.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuleer
          </Button>
          <Button
            onClick={run}
            disabled={busy}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Genereer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
