"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ suivant }: { suivant: string }) {
  const router = useRouter();
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
      // `replace` plutôt que `push` : la page de connexion n'a pas à rester
      // dans l'historique une fois franchie.
      router.replace(suivant);
      // Le cookie vient d'être posé ; les pages déjà rendues côté client
      // doivent être redemandées au serveur.
      router.refresh();
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
