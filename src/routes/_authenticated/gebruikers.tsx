import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, KeyRound, Trash2, ShieldCheck, Shield, Mail, RotateCcw } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  listUsers,
  inviteUser,
  updateUserPassword,
  setUserRole,
  deleteUser,
  getInviteTemplate,
  saveInviteTemplate,
} from "@/lib/users.functions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/gebruikers")({
  head: () => ({ meta: [{ title: "Gebruikers — AI van Columbus Portaal" }] }),
  component: GebruikersPage,
});

type Row = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
};

function GebruikersPage() {
  const { hasRole, user, loading: authLoading } = useAuth();
  const fnList = useServerFn(listUsers);
  const fnInvite = useServerFn(inviteUser);
  const fnPwd = useServerFn(updateUserPassword);
  const fnRole = useServerFn(setUserRole);
  const fnDelete = useServerFn(deleteUser);
  const fnGetTpl = useServerFn(getInviteTemplate);
  const fnSaveTpl = useServerFn(saveInviteTemplate);

  // template editor
  const [tplOpen, setTplOpen] = useState(false);
  const [tplSubject, setTplSubject] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplDefaults, setTplDefaults] = useState<{ subject: string; body: string } | null>(null);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // invite form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [iName, setIName] = useState("");
  const [iEmail, setIEmail] = useState("");
  const [iPwd, setIPwd] = useState("");
  const [iRole, setIRole] = useState<"admin" | "medewerker">("medewerker");
  const [busy, setBusy] = useState(false);

  // password dialog
  const [pwdUser, setPwdUser] = useState<Row | null>(null);
  const [newPwd, setNewPwd] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const data = await fnList();
      setRows(data as Row[]);
    } catch (e: any) {
      toast.error("Laden mislukt: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasRole("admin")) refresh();
  }, [hasRole]);

  if (authLoading) return null;
  if (!hasRole("admin")) return <Navigate to="/" />;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fnInvite({ data: { email: iEmail, password: iPwd, displayName: iName, role: iRole } });
      toast.success("Gebruiker aangemaakt");
      setInviteOpen(false);
      setIName(""); setIEmail(""); setIPwd(""); setIRole("medewerker");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePwd(e: React.FormEvent) {
    e.preventDefault();
    if (!pwdUser) return;
    setBusy(true);
    try {
      await fnPwd({ data: { userId: pwdUser.id, password: newPwd } });
      toast.success("Wachtwoord aangepast");
      setPwdUser(null);
      setNewPwd("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAdmin(row: Row) {
    const isAdmin = row.roles.includes("admin");
    try {
      await fnRole({ data: { userId: row.id, role: "admin", enabled: !isAdmin } });
      toast.success(isAdmin ? "Admin-rol verwijderd" : "Admin-rol toegekend");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDelete(row: Row) {
    try {
      await fnDelete({ data: { userId: row.id } });
      toast.success("Gebruiker verwijderd");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gebruikers</h1>
          <p className="text-sm text-muted-foreground">
            Nodig collega's uit, beheer rollen en reset wachtwoorden.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openTemplate}>
            <Mail className="mr-2 h-4 w-4" />Uitnodigingsmail
          </Button>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="mr-2 h-4 w-4" />Nieuwe gebruiker</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gebruiker uitnodigen</DialogTitle>
              <DialogDescription>
                Account wordt direct aangemaakt met het opgegeven wachtwoord.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="i-name">Naam</Label>
                <Input id="i-name" value={iName} onChange={(e) => setIName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="i-email">E-mail</Label>
                <Input id="i-email" type="email" value={iEmail} onChange={(e) => setIEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="i-pwd">Tijdelijk wachtwoord (min. 8 tekens)</Label>
                <Input id="i-pwd" type="text" value={iPwd} onChange={(e) => setIPwd(e.target.value)} required minLength={8} />
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select value={iRole} onValueChange={(v) => setIRole(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medewerker">Medewerker</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aanmaken
                </Button>
              </DialogFooter>
            </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />Laden…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Rollen</TableHead>
                <TableHead>Laatste login</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isAdmin = row.roles.includes("admin");
                const isSelf = row.id === user?.id;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.display_name ?? "—"}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell className="space-x-1">
                      {row.roles.map((r) => (
                        <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>
                      ))}
                      {row.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.last_sign_in_at ? new Date(row.last_sign_in_at).toLocaleString("nl-NL") : "nooit"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleAdmin(row)}
                        disabled={isSelf && isAdmin}
                        title={isAdmin ? "Admin-rol intrekken" : "Admin maken"}
                      >
                        {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setPwdUser(row); setNewPwd(""); }}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" disabled={isSelf}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Gebruiker verwijderen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {row.email} wordt permanent verwijderd. Dit kan niet ongedaan worden gemaakt.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuleren</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(row)}>Verwijderen</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Nog geen gebruikers.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!pwdUser} onOpenChange={(o) => !o && setPwdUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wachtwoord aanpassen</DialogTitle>
            <DialogDescription>
              Nieuw wachtwoord voor {pwdUser?.email}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePwd} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-pwd">Nieuw wachtwoord (min. 8 tekens)</Label>
              <Input
                id="new-pwd"
                type="text"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
