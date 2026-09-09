"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import useSWR from "swr";
import { Loader2, LibraryBig, Moon, Sun, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/command-palette";

const tabs = [
  // « Accueil » plutôt que « Vue d'ensemble » : à 390 px, le libellé long
  // faisait passer la barre de navigation sur deux lignes.
  { href: "/", label: "Accueil" },
  { href: "/livres", label: "Livres" },
  { href: "/auteurs", label: "Auteurs" },
  { href: "/parcours", label: "Parcours" },
  { href: "/listes", label: "Listes" },
];

/**
 * Bascule clair/sombre.
 *
 * L'icône est choisie par CSS (`dark:`), pas par un état « monté ». Le thème
 * n'est connu qu'au navigateur : le rendu serveur ne peut pas le deviner, et
 * la parade habituelle — un `useState(false)` repassé à `true` dans un effet —
 * provoque un rendu en cascade à chaque chargement (et une erreur de lint).
 * next-themes pose déjà la classe `dark` sur <html> avant l'hydratation ; deux
 * icônes dont une seule est affichée suffisent donc, sans état ni décalage.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Changer de thème"
      title="Changer de thème"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon className="size-4 dark:hidden" aria-hidden />
      <Sun className="hidden size-4 dark:block" aria-hidden />
    </Button>
  );
}

/** L'état renvoyé par `POST /api/sync` (cf. `src/lib/git.ts`). */
interface EtatSync {
  dirty: boolean;
  ahead: number;
  behind: number;
  pulled: number;
  dataChanged: boolean;
  blocked: string | null;
}

/** POST, parce que la route modifie l'état du dépôt. */
const sonder = async (url: string): Promise<EtatSync> => {
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

/**
 * Synchronisation avec le dépôt, en local seulement.
 *
 * **Tirer est automatique** : toutes les 15 secondes, la route regarde si le
 * distant a pris de l'avance et tire le cas échéant. C'est ce qui fait qu'on
 * n'a plus à se demander si la bibliothèque locale est à jour de ce que
 * l'application déployée a écrit. SWR suspend le sondage sur un onglet caché et
 * revalide au retour du focus : revenir sur l'onglet resynchronise sans rien
 * coûter pendant qu'on est ailleurs.
 *
 * **Pousser reste un geste**, parce que c'est une décision : le bouton
 * committe `data/library.json` et le pousse. Il est désactivé quand il n'y a
 * rien à envoyer, ce qui en fait aussi un indicateur — s'il est actif, le poste
 * local a quelque chose que le site n'a pas.
 */
function SyncButton() {
  const router = useRouter();
  const [envoi, setEnvoi] = React.useState(false);

  const { data, mutate } = useSWR<EtatSync>("/api/sync", sonder, {
    refreshInterval: 15_000,
    // Un échec réseau ne doit pas se voir : la route rend déjà `blocked` plutôt
    // qu'une erreur, et le sondage reprendra tout seul.
    shouldRetryOnError: false,
  });

  // Des données sont arrivées : l'écran doit les montrer. Le magasin serveur a
  // déjà été vidé par la route, il ne reste qu'à redemander le rendu.
  React.useEffect(() => {
    if (!data?.dataChanged) return;
    toast.info("Bibliothèque mise à jour depuis GitHub");
    router.refresh();
  }, [data, router]);

  const enAttente = (data?.ahead ?? 0) + (data?.dirty ? 1 : 0);
  const rienAPousser = enAttente === 0;

  async function pousser() {
    setEnvoi(true);
    try {
      const res = await fetch("/api/sync/push", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Envoi impossible");
        return;
      }
      toast.success("Poussé — le site en ligne est à jour");
      // Le site relit le fichier depuis GitHub à chaque requête : il n'y a rien
      // à redéployer. Reste à rafraîchir l'état du bouton.
      mutate();
    } catch {
      toast.error("Envoi impossible");
    } finally {
      setEnvoi(false);
    }
  }

  const titre = envoi
    ? "Envoi en cours…"
    : rienAPousser
      ? "Rien à pousser — le site est à jour"
      : `Pousser ${enAttente} modification${enAttente > 1 ? "s" : ""} vers GitHub`;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={pousser}
      disabled={envoi || rienAPousser}
      aria-label={titre}
      title={data?.blocked ? `${titre} — ${data.blocked}` : titre}
      className="relative"
    >
      {envoi ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Upload className="size-4" aria-hidden />
      )}
      {/* La synchronisation automatique est en attente : pousser la débloque. */}
      {data?.blocked && !envoi && (
        <span
          className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-amber-500"
          aria-hidden
        />
      )}
    </Button>
  );
}

export function MainNav({ local = false }: { local?: boolean }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* Un seul rang au-delà de 768 px ; en dessous, les onglets passent sur
          un second rang (`order` + `w-full`) plutôt que d'être comprimés avec
          le logo et les actions. Rendre la barre deux fois aurait donné deux
          repères de navigation au lecteur d'écran ; ici c'est le même nœud qui
          change de place.
          ⚠️ Les deux hauteurs (3.5rem + 2.75rem) sont reprises par
          --app-content-h dans globals.css : les modifier ici impose de mettre
          cette variable à jour. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 px-4 sm:gap-x-6 sm:px-6">
        <Link
          href="/"
          className="order-1 flex h-14 shrink-0 items-center gap-2 font-semibold"
        >
          <LibraryBig className="size-5" aria-hidden />
          {/* Le nom prenait la place des onglets sous 640 px. L'icône reste le
              lien vers l'accueil, et le nom revient dès qu'il y a la place. */}
          <span className="hidden sm:inline">Ma Bibliothèque</span>
          <span className="sr-only sm:hidden">Ma Bibliothèque</span>
        </Link>
        <nav
          // Défilement horizontal : garde-fou si un onglet s'ajoute un jour.
          // Les cinq actuels tiennent sur 390 px.
          className="order-3 -mx-1 flex h-11 w-full items-center gap-1 overflow-x-auto px-1 md:order-2 md:mx-0 md:h-14 md:w-auto md:overflow-visible md:px-0"
          aria-label="Navigation principale"
        >
          {tabs.map((tab) => {
            // « / » n'est actif que sur lui-même : sans ce cas particulier,
            // startsWith("/") le rendrait actif sur toutes les pages.
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="order-2 ml-auto flex h-14 items-center gap-2 md:order-3">
          <CommandPalette />
          {local && <SyncButton />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
