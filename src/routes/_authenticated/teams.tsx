import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  Plus,
  Trash2,
  UserPlus,
  Pencil,
  Crown,
  Mail,
  CheckSquare,
  CalendarDays,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { inviteUser } from "@/lib/users.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({
    meta: [
      { title: "Teams — AI van Columbus Portaal" },
      {
        name: "description",
        content: "Beheer teams binnen je organisatie, wijs teamleiders aan en nodig collega's uit.",
      },
      { property: "og:title", content: "Teams — AI van Columbus Portaal" },
      {
        property: "og:description",
        content: "Beheer teams binnen je organisatie, wijs teamleiders aan en nodig collega's uit.",
      },
    ],
  }),
  component: TeamsPage,
});

type Team = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  lead_user_id: string | null;
};

type Member = { id: string; team_id: string; user_id: string; role: string };
type Person = { id: string; display_name: string | null; email: string | null };

type Activity = {
  kind: string;
  done: boolean | null;
  created_by: string | null;
  assignee_ids: string[] | null;
};
type Meeting = { created_by: string | null; starts_at: string; status: string | null };
type TeamStats = {
  tasksOpen: number;
  tasksTotal: number;
  emails: number;
  meetingsUpcoming: number;
  meetingsTotal: number;
};

const EMPTY_STATS: TeamStats = {
  tasksOpen: 0,
  tasksTotal: 0,
  emails: 0,
  meetingsUpcoming: 0,
  meetingsTotal: 0,
};

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function StatsGrid({ stats }: { stats: TeamStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile
        icon={CheckSquare}
        label="Taken"
        value={stats.tasksOpen}
        hint={`${stats.tasksTotal} totaal`}
        tone="bg-sky-100 text-sky-700"
      />
      <StatTile
        icon={Mail}
        label="E-mails"
        value={stats.emails}
        hint="verstuurd/gelogd"
        tone="bg-violet-100 text-violet-700"
      />
      <StatTile
        icon={CalendarDays}
        label="Meetings"
        value={stats.meetingsUpcoming}
        hint={`${stats.meetingsTotal} totaal`}
        tone="bg-emerald-100 text-emerald-700"
      />
    </div>
  );
}


function initials(p?: Person | null): string {
  const src = p?.display_name || p?.email || "?";
  return src
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

function randomPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
  let out = "";
  const buf = new Uint32Array(16);
  crypto.getRandomValues(buf);
  buf.forEach((n) => (out += chars[n % chars.length]));
  return out;
}

function TeamsPage() {
  const { currentOrganizationId, currentOrganization } = useWorkspace();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const fnInvite = useServerFn(inviteUser);

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState({ name: "", description: "", lead_user_id: "none" });
  const [saving, setSaving] = useState(false);

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberTeam, setMemberTeam] = useState<Team | null>(null);
  const [pickUser, setPickUser] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", name: "", role: "medewerker" });
  const [inviting, setInviting] = useState(false);

  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const load = useCallback(async () => {
    if (!currentOrganizationId) {
      setTeams([]);
      setMembers([]);
      setPeople([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [teamRes, memberRes] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, description, color, lead_user_id")
        .eq("organization_id", currentOrganizationId)
        .order("name"),
      supabase.from("organization_members").select("user_id").eq("organization_id", currentOrganizationId),
    ]);
    if (teamRes.error) toast.error(teamRes.error.message);
    const list = (teamRes.data ?? []) as Team[];
    setTeams(list);

    const ids = (memberRes.data ?? []).map((m) => m.user_id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ids);
      setPeople((profs ?? []) as Person[]);
    } else {
      setPeople([]);
    }

    if (list.length) {
      const { data: tm, error } = await supabase
        .from("team_members")
        .select("id, team_id, user_id, role")
        .in(
          "team_id",
          list.map((t) => t.id),
        );
      if (error) toast.error(error.message);
      setMembers((tm ?? []) as Member[]);
    } else {
      setMembers([]);
    }

    const [actRes, meetRes] = await Promise.all([
      supabase
        .from("crm_activities")
        .select("kind, done, created_by, assignee_ids")
        .eq("organization_id", currentOrganizationId),
      supabase
        .from("appointments")
        .select("created_by, starts_at, status")
        .eq("organization_id", currentOrganizationId),
    ]);
    setActivities((actRes.data ?? []) as Activity[]);
    setMeetings((meetRes.data ?? []) as Meeting[]);
    setLoading(false);
  }, [currentOrganizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm({ name: "", description: "", lead_user_id: "none" });
    setEditOpen(true);
  }

  function openEdit(t: Team) {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? "",
      lead_user_id: t.lead_user_id ?? "none",
    });
    setEditOpen(true);
  }

  async function saveTeam() {
    if (!currentOrganizationId) {
      toast.error("Kies eerst een organisatie");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Teamnaam is verplicht");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      lead_user_id: form.lead_user_id === "none" ? null : form.lead_user_id,
    };
    const res = editing
      ? await supabase.from("teams").update(payload).eq("id", editing.id)
      : await supabase.from("teams").insert({ ...payload, organization_id: currentOrganizationId });
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(editing ? "Team bijgewerkt" : "Team aangemaakt");
    setEditOpen(false);
    void load();
  }

  async function removeTeam(t: Team) {
    const { error } = await supabase.from("teams").delete().eq("id", t.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Team verwijderd");
    setDeleteTeam(null);
    void load();
  }

  async function addMember(teamId: string, userId: string) {
    const { error } = await supabase.from("team_members").insert({ team_id: teamId, user_id: userId });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Teamlid toegevoegd");
    setPickUser("");
    void load();
  }

  async function removeMember(id: string) {
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void load();
  }

  async function sendInvite() {
    if (!invite.email.trim() || !invite.name.trim()) {
      toast.error("Naam en e-mailadres zijn verplicht");
      return;
    }
    setInviting(true);
    try {
      const res = (await fnInvite({
        data: {
          email: invite.email.trim(),
          displayName: invite.name.trim(),
          role: invite.role as "admin" | "medewerker",
          password: randomPassword(),
        },
      })) as { id: string };
      if (memberTeam && res?.id) {
        await supabase.from("team_members").insert({ team_id: memberTeam.id, user_id: res.id });
      }
      toast.success("Uitnodiging verstuurd");
      setInviteOpen(false);
      setInvite({ email: "", name: "", role: "medewerker" });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uitnodigen mislukt");
    } finally {
      setInviting(false);
    }
  }

  const teamMembers = (teamId: string) => members.filter((m) => m.team_id === teamId);

  const statsByTeam = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, TeamStats>();
    for (const t of teams) {
      const ids = new Set(members.filter((m) => m.team_id === t.id).map((m) => m.user_id));
      if (t.lead_user_id) ids.add(t.lead_user_id);
      const s: TeamStats = { ...EMPTY_STATS };
      for (const a of activities) {
        const owned =
          (a.created_by && ids.has(a.created_by)) ||
          (a.assignee_ids ?? []).some((u) => ids.has(u));
        if (!owned) continue;
        if (a.kind === "task") {
          s.tasksTotal += 1;
          if (!a.done) s.tasksOpen += 1;
        } else if (a.kind === "email") {
          s.emails += 1;
        }
      }
      for (const m of meetings) {
        if (!m.created_by || !ids.has(m.created_by)) continue;
        if (m.status === "cancelled") continue;
        s.meetingsTotal += 1;
        if (new Date(m.starts_at).getTime() >= now) s.meetingsUpcoming += 1;
      }
      map.set(t.id, s);
    }
    return map;
  }, [teams, members, activities, meetings]);

  const totals = useMemo(() => {
    const t: TeamStats = { ...EMPTY_STATS };
    for (const s of statsByTeam.values()) {
      t.tasksOpen += s.tasksOpen;
      t.tasksTotal += s.tasksTotal;
      t.emails += s.emails;
      t.meetingsUpcoming += s.meetingsUpcoming;
      t.meetingsTotal += s.meetingsTotal;
    }
    return t;
  }, [statsByTeam]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
            <p className="text-sm text-muted-foreground">
              Beheer teams binnen {currentOrganization?.name ?? "je organisatie"} en nodig collega's uit.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => {
                setMemberTeam(null);
                setInviteOpen(true);
              }}
            >
              <Mail className="mr-2 h-4 w-4" /> Collega uitnodigen
            </Button>
          )}
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Nieuw team
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nog geen teams</p>
              <p className="text-sm text-muted-foreground">
                Maak een team aan om collega's te groeperen per afdeling of project.
              </p>
            </div>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Eerste team aanmaken
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Overzicht alle teams</CardTitle>
              <CardDescription>
                Openstaande taken, gelogde e-mails en geplande meetings van alle teamleden.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatsGrid stats={totals} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
          {teams.map((t) => {
            const list = teamMembers(t.id);
            const stats = statsByTeam.get(t.id) ?? EMPTY_STATS;
            const lead = t.lead_user_id ? peopleById.get(t.lead_user_id) : null;
            return (
              <Card key={t.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="bg-brand/10 text-brand">
                          {t.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{t.name}</CardTitle>
                        <CardDescription>
                          {list.length} {list.length === 1 ? "teamlid" : "teamleden"}
                          {lead ? ` · leider ${lead.display_name ?? lead.email}` : ""}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)} aria-label="Team bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTeam(t)}
                        aria-label="Team verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                  <div className="space-y-1.5">
                    {list.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nog geen teamleden.</p>
                    )}
                    {list.map((m) => {
                      const p = peopleById.get(m.user_id);
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between rounded-md border px-2.5 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[11px]">{initials(p)}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{p?.display_name ?? p?.email ?? m.user_id}</span>
                            {t.lead_user_id === m.user_id && (
                              <Badge variant="secondary" className="gap-1">
                                <Crown className="h-3 w-3" /> Leider
                              </Badge>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => void removeMember(m.id)}
                            aria-label="Teamlid verwijderen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMemberTeam(t);
                      setPickUser("");
                      setMemberOpen(true);
                    }}
                  >
                    <UserPlus className="mr-2 h-4 w-4" /> Leden toevoegen
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Team aanmaken / bewerken */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Team bewerken" : "Nieuw team"}</DialogTitle>
            <DialogDescription>Geef het team een naam en kies eventueel een teamleider.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Naam</Label>
              <Input
                id="team-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Bijv. Sales & Support"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-desc">Omschrijving</Label>
              <Textarea
                id="team-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Teamleider</Label>
              <Select
                value={form.lead_user_id}
                onValueChange={(v) => setForm((f) => ({ ...f, lead_user_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Geen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen teamleider</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name ?? p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={() => void saveTeam()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leden toevoegen */}
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leden toevoegen aan {memberTeam?.name}</DialogTitle>
            <DialogDescription>
              Kies een collega uit je organisatie of nodig iemand nieuw uit per e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Collega</Label>
              <Select value={pickUser} onValueChange={setPickUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer een collega" />
                </SelectTrigger>
                <SelectContent>
                  {people
                    .filter(
                      (p) => !members.some((m) => m.team_id === memberTeam?.id && m.user_id === p.id),
                    )
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.display_name ?? p.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!pickUser || !memberTeam}
              onClick={() => memberTeam && pickUser && void addMember(memberTeam.id, pickUser)}
            >
              <UserPlus className="mr-2 h-4 w-4" /> Toevoegen aan team
            </Button>
            {isAdmin && (
              <Button variant="outline" className="w-full" onClick={() => setInviteOpen(true)}>
                <Mail className="mr-2 h-4 w-4" /> Nieuwe collega uitnodigen
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Uitnodigen */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collega uitnodigen</DialogTitle>
            <DialogDescription>
              De collega ontvangt een uitnodigingsmail met een link om een wachtwoord in te stellen
              {memberTeam ? ` en wordt toegevoegd aan ${memberTeam.name}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Naam</Label>
              <Input
                id="inv-name"
                value={invite.name}
                onChange={(e) => setInvite((i) => ({ ...i, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">E-mailadres</Label>
              <Input
                id="inv-email"
                type="email"
                value={invite.email}
                onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={invite.role} onValueChange={(v) => setInvite((i) => ({ ...i, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medewerker">Medewerker</SelectItem>
                  <SelectItem value="admin">Beheerder</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={() => void sendInvite()} disabled={inviting}>
              {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Uitnodiging versturen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTeam} onOpenChange={(o) => !o && setDeleteTeam(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Team verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTeam?.name} en alle teamlidmaatschappen worden verwijderd. Dit kan niet ongedaan
              worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTeam && void removeTeam(deleteTeam)}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
