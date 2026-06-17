import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Inloggen — AI van Columbus Portaal" }] }),
  component: AuthPage,
});

const credentialsSchema = z.object({
  email: z.string().trim().email("Ongeldig e-mailadres").max(255),
  password: z.string().min(6, "Wachtwoord moet minimaal 6 tekens zijn").max(72),
});

const signupSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, "Naam is verplicht").max(100),
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup state
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  if (loading) return null;
  if (user) return <Navigate to="/" />;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentialsSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) {
      toast.error("Inloggen mislukt: " + error.message);
      return;
    }
    toast.success("Welkom terug!");
    navigate({ to: "/" });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse({
      email: signupEmail,
      password: signupPassword,
      displayName: signupName,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: parsed.data.displayName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error("Registreren mislukt: " + error.message);
      return;
    }
    toast.success("Account aangemaakt. Je bent ingelogd.");
    navigate({ to: "/" });
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Google login mislukt");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">AI van Columbus Portaal</h1>
          <p className="text-sm text-muted-foreground">Log in om toegang te krijgen.</p>
        </div>

        <Card>
          <Tabs defaultValue="login">
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Inloggen</TabsTrigger>
                <TabsTrigger value="signup">Registreren</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="space-y-4">
              <TabsContent value="login" className="space-y-4">
                <CardTitle className="text-base">Welkom terug</CardTitle>
                <CardDescription>Vul je gegevens in om verder te gaan.</CardDescription>
                <form onSubmit={handleLogin} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Wachtwoord</Label>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    Inloggen
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
                <CardTitle className="text-base">Nieuw account</CardTitle>
                <CardDescription>Maak een account aan met je werkmail.</CardDescription>
                <form onSubmit={handleSignup} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-name">Naam</Label>
                    <Input
                      id="signup-name"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password">Wachtwoord</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    Registreren
                  </Button>
                </form>
              </TabsContent>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">of</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
                disabled={busy}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Inloggen met Google
              </Button>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
