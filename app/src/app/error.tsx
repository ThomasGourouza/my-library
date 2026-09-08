"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Deux causes très différentes arrivent ici, et la seconde a besoin d'une
 * consigne.
 *
 * La panne ordinaire — GitHub injoignable, une lecture qui a échoué — se répare
 * en réessayant. Mais `assertIntegrity` peut aussi refuser le fichier de
 * données lui-même : identifiants en double ou livres orphelins, ce que produit
 * une fusion git mal reprise. Dans ce cas **toutes** les pages échouent, et
 * réessayer ne servira jamais à rien : il faut corriger `data/library.json` et
 * pousser. La bonne nouvelle est que la donnée étant lue à l'exécution, la
 * correction répare la production sans redéployer — elle peut même se faire
 * depuis l'éditeur web de GitHub.
 *
 * Le message d'erreur précis n'est pas affichable : Next le remplace par un
 * `digest` en production. Il est en revanche entier dans les journaux du
 * serveur.
 */
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
      <p className="max-w-md text-sm text-muted-foreground">
        Si <strong>toutes</strong> les pages échouent, c’est probablement que{" "}
        <code className="rounded bg-muted px-1 py-0.5">data/library.json</code>{" "}
        est incohérent — identifiants en double ou livres sans auteur, ce que
        laisse une fusion git mal reprise. Corrigez le fichier et poussez : la
        donnée étant relue à chaque requête, il n’y a pas de redéploiement à
        faire. Le détail est dans les journaux du serveur.
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
