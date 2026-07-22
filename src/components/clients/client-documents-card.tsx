import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, FileText, History, Loader2, Trash2, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DocRow = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  created_at: string;
  uploaded_by: string | null;
};

type AuditRow = {
  id: string;
  document_id: string | null;
  document_name: string;
  action: "upload" | "download" | "delete";
  actor_email: string | null;
  created_at: string;
};

const MAX_MB = 25;
const BUCKET = "client-documents";

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const ACTION_LABEL: Record<AuditRow["action"], string> = {
  upload: "Geüpload",
  download: "Gedownload",
  delete: "Verwijderd",
};

const ACTION_VARIANT: Record<AuditRow["action"], "default" | "secondary" | "destructive"> = {
  upload: "default",
  download: "secondary",
  delete: "destructive",
};

export function ClientDocumentsCard({
  clientId,
  organizationId,
}: {
  clientId: string;
  organizationId: string;
}) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocRow | null>(null);
  const [search, setSearch] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [viewer, setViewer] = useState<{ doc: DocRow; url: string } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_documents")
      .select("id,name,storage_path,mime_type,size_bytes,description,created_at,uploaded_by")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Documenten laden mislukt", { description: error.message });
    } else {
      setDocs((data ?? []) as DocRow[]);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const logAudit = async (
    action: AuditRow["action"],
    doc: { id: string | null; name: string },
  ) => {
    if (!organizationId) return;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    const email = userData.user?.email ?? null;
    if (!uid) return;
    await supabase.from("client_document_audit_log").insert({
      organization_id: organizationId,
      client_id: clientId,
      document_id: doc.id,
      document_name: doc.name,
      action,
      actor_id: uid,
      actor_email: email,
    });
  };

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    const { data, error } = await supabase
      .from("client_document_audit_log")
      .select("id,document_id,document_name,action,actor_email,created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Auditlog laden mislukt", { description: error.message });
    } else {
      setAudit((data ?? []) as AuditRow[]);
    }
    setAuditLoading(false);
  }, [clientId]);

  const openAudit = () => {
    setAuditOpen(true);
    void loadAudit();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!organizationId) {
      toast.error("Geen organisatie gekoppeld aan deze klant.");
      return;
    }
    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    let ok = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`${file.name} is groter dan ${MAX_MB} MB`);
        continue;
      }
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${organizationId}/${clientId}/${crypto.randomUUID()}-${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (up.error) {
        toast.error(`Upload mislukt: ${file.name}`, { description: up.error.message });
        continue;
      }
      const ins = await supabase
        .from("client_documents")
        .insert({
          organization_id: organizationId,
          client_id: clientId,
          name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: uid,
        })
        .select("id")
        .single();
      if (ins.error) {
        toast.error(`Opslaan mislukt: ${file.name}`, { description: ins.error.message });
        await supabase.storage.from(BUCKET).remove([path]);
        continue;
      }
      await logAudit("upload", { id: ins.data?.id ?? null, name: file.name });
      ok++;
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    if (ok > 0) toast.success(`${ok} document${ok === 1 ? "" : "en"} geüpload`);
    await load();
  };

  const download = async (doc: DocRow) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Downloadlink mislukt", { description: error?.message });
      return;
    }
    await logAudit("download", { id: doc.id, name: doc.name });
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const doc = deleteTarget;
    setDeleteTarget(null);
    const rem = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    if (rem.error) {
      toast.error("Bestand verwijderen mislukt", { description: rem.error.message });
      return;
    }
    const del = await supabase.from("client_documents").delete().eq("id", doc.id);
    if (del.error) {
      toast.error("Record verwijderen mislukt", { description: del.error.message });
      return;
    }
    await logAudit("delete", { id: doc.id, name: doc.name });
    toast.success("Document verwijderd");
    await load();
  };

  const filtered = docs.filter((d) =>
    search.trim() ? d.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Documenten
            </CardTitle>
            <CardDescription>
              Bewaar documenten die je van deze klant ontvangt. Max {MAX_MB} MB per bestand.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openAudit}>
              <History className="mr-2 h-4 w-4" /> Auditlog
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={uploading || !organizationId}
              size="sm"
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload documenten
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Zoek op bestandsnaam…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden…
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFiles(e.dataTransfer.files);
            }}
          >
            <FileText className="mb-2 h-8 w-8 opacity-40" />
            <p>Nog geen documenten. Sleep bestanden hierheen of gebruik de uploadknop.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {filtered.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(d.size_bytes)} · {new Date(d.created_at).toLocaleString("nl-NL")}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void download(d)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(d)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Document verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je "{deleteTarget?.name}" definitief wilt verwijderen? Deze actie
              kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Auditlog documenten</DialogTitle>
            <DialogDescription>
              Overzicht van uploads, downloads en verwijderingen voor deze klant.
            </DialogDescription>
          </DialogHeader>
          {auditLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : audit.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nog geen activiteit vastgelegd.
            </div>
          ) : (
            <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-md border">
              {audit.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Badge variant={ACTION_VARIANT[row.action]} className="shrink-0">
                    {ACTION_LABEL[row.action]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.document_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.actor_email ?? "Onbekende gebruiker"} ·{" "}
                      {new Date(row.created_at).toLocaleString("nl-NL")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
