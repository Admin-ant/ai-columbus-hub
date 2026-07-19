import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Settings, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type ContactAction = "create" | "update" | "delete";
export type ContactPermissionRole = "admin" | "medewerker";
export type ContactPermissions = Record<ContactAction, ContactPermissionRole>;

export const DEFAULT_PERMISSIONS: ContactPermissions = {
  create: "admin",
  update: "admin",
  delete: "admin",
};

const ACTION_LABELS: Record<ContactAction, string> = {
  create: "Medewerker toevoegen",
  update: "Medewerker bewerken",
  delete: "Medewerker verwijderen",
};

export function ContactPermissionsDialog({
  organizationId,
  value,
  onSaved,
}: {
  organizationId: string;
  value: ContactPermissions;
  onSaved: (next: ContactPermissions) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ContactPermissions>(value);

  useEffect(() => { setDraft(value); }, [value, open]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ contact_permissions: draft })
      .eq("id", organizationId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Rechten opgeslagen");
    onSaved(draft);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Shield className="mr-2 h-4 w-4" /> Rechten
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Rechten voor medewerkers
          </DialogTitle>
          <DialogDescription>
            Bepaal per actie welke rol deze mag uitvoeren op contactpersonen. Admins kunnen altijd alles.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {(Object.keys(ACTION_LABELS) as ContactAction[]).map((a) => (
            <div key={a} className="flex items-center justify-between gap-3">
              <Label className="text-sm">{ACTION_LABELS[a]}</Label>
              <Select
                value={draft[a]}
                onValueChange={(v) => setDraft({ ...draft, [a]: v as ContactPermissionRole })}
              >
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Alleen admin</SelectItem>
                  <SelectItem value="medewerker">Admin + medewerker</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
