import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

/**
 * Une destination interne, et seulement interne. `//evil.example` est une URL
 * absolue pour le navigateur : sans ce contrôle, la page de connexion
 * deviendrait une redirection ouverte.
 */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ suivant?: string }>;
}) {
  const suivant = safeNext((await searchParams).suivant);

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center gap-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Ma Bibliothèque</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            L’accès à cette bibliothèque est protégé par un mot de passe.
          </p>
          <LoginForm suivant={suivant} />
        </CardContent>
      </Card>
    </div>
  );
}
