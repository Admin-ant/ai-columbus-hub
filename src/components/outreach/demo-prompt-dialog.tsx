import { useState } from "react";
import { toast } from "sonner";
import { Video, MapPin, CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export type DemoType = "online" | "onsite";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetId: string | null;
  targetCompany?: string;
  initialType?: DemoType | null;
  initialAt?: string | null;
  onSaved?: () => void;
};

function defaultIso() {
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  d.setHours(14);
  // datetime-local needs yyyy-mm-ddThh:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DemoPromptDialog({
  open,
  onOpenChange,
  targetId,
  targetCompany,
  initialType,
  initialAt,
  onSaved,
}: Props) {
  const [demoType, setDemoType] = useState<DemoType>(initialType ?? "online");
  const [demoAt, setDemoAt] = useState<string>(
    initialAt ? new Date(initialAt).toISOString().slice(0, 16) : defaultIso(),
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!targetId) return;
    setSaving(true);
    const { error } = await supabase
      .from("outreach_targets")
      .update({
        demo_type: demoType,
        demo_at: new Date(demoAt).toISOString(),
      })
      .eq("id", targetId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Demo opgeslagen");
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[#0a0a0a] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" style={{ color: "#ff2bd6" }} />
            Demo inplannen{targetCompany ? ` — ${targetCompany}` : ""}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Leg vast hoe en wanneer de demo plaatsvindt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-[11px] text-white/60">Type</Label>
            <Select value={demoType} onValueChange={(v) => setDemoType(v as DemoType)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">
                  <span className="inline-flex items-center gap-2">
                    <Video className="h-3.5 w-3.5" /> Online (Microsoft Teams)
                  </span>
                </SelectItem>
                <SelectItem value="onsite">
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> Fysiek (op locatie)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-white/60">Datum &amp; tijd</Label>
            <Input
              type="datetime-local"
              value={demoAt}
              onChange={(e) => setDemoAt(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-[#ff2bd6] hover:bg-[#ff2bd6]/90 text-white"
          >
            {saving ? "Opslaan…" : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
