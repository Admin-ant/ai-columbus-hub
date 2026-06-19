import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Wachtwoord resetten — AI van Columbus" }] }),
  component: ResetPasswordPage,
});

const pwdSchema = z
  .object({
    password: z.string().min(8, "Minimaal 8 tekens").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Wachtwoorden komen niet overeen",
  });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash and fires PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setHasRecovery(true);
    });
    // If user already has a recovery session (e.g. on refresh after click), accept it.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasRecovery(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = pwdSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setBusy(false);
    if (error) {
      toast.error("Wijzigen mislukt: " + error.message);
      return;
    }
    toast.success("Wachtwoord aangepast. Je bent nu ingelogd.");
    navigate({ to: "/" });
  }

  if (!ready) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle className="text-center">Nieuw wachtwoord instellen</CardTitle>
          <CardDescription className="text-center">
            Kies een sterk wachtwoord van minimaal 8 tekens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasRecovery ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Deze link is verlopen of ongeldig. Vraag een nieuwe reset-link aan vanuit het inlogscherm.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Naar inloggen
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pwd">Nieuw wachtwoord</Label>
                <Input
                  id="pwd"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pwd2">Bevestig wachtwoord</Label>
                <Input
                  id="pwd2"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Wachtwoord opslaan
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
