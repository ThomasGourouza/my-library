"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">
        Une erreur est survenue
      </p>
      <h1 className="text-2xl font-semibold">Quelque chose s’est mal passé</h1>
      <p className="max-w-md text-muted-foreground">
        Une erreur inattendue a interrompu le chargement de cette page. Vous
        pouvez réessayer ou revenir à la bibliothèque.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Réessayer</Button>
        <Button variant="outline" asChild>
          <Link href="/livres">Retour à la bibliothèque</Link>
        </Button>
      </div>
    </div>
  );
}
