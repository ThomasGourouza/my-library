"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ suivant }: { suivant: string }) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Connexion impossible");
        return;
      }
      // Navigation **dure**, et c'est indispensable ici.
      //
      // Tant qu'on n'est pas connecté, le routeur précharge chaque lien de la
      // barre de navigation — /livres, /auteurs, /listes, /parcours — et le
      // proxy répond à chacun par une redirection vers /connexion. Ces réponses
      // restent dans le cache du routeur client. Un `router.replace()` y
      // puiserait et nous ramènerait aussitôt sur le formulaire, sans erreur et
      // sans rien dans la console : l'écran ne réagit pas, tout simplement.
      //
      // `window.location` ignore ce cache et repart du serveur, cette fois avec
      // le cookie. `replace` plutôt que `assign` : la page de connexion n'a pas
      // à rester dans l'historique une fois franchie.
      window.location.replace(suivant);
      return;
    } catch {
      setError("Connexion impossible");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "erreur-connexion" : undefined}
        />
        {error && (
          <p id="erreur-connexion" className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={pending || !password}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Entrer
      </Button>
    </form>
  );
}
