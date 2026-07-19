import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">Erreur 404</p>
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="max-w-md text-muted-foreground">
        La page ou la ressource que vous recherchez n’existe pas ou a été
        déplacée.
      </p>
      <Button asChild>
        <Link href="/livres">Retour à la bibliothèque</Link>
      </Button>
    </div>
  );
}
