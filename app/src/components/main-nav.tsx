"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LibraryBig, Moon, RefreshCw, Sun } from "lucide-react";
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

/**
 * « Rafraîchir » — un `git pull` depuis la barre de navigation.
 *
 * N'apparaît qu'en local (cf. `onLocalFile()` dans `@/lib/store`), pour une
 * raison de fond : l'application déployée commite dans `data/library.json` à
 * chaque modification, et le poste local n'en sait rien tant qu'il n'a pas
 * tiré. C'est la seule couture du dispositif ; ce bouton évite de changer de
 * fenêtre pour la recoudre.
 *
 * Le refus le plus fréquent est utile, pas gênant : git s'arrête si le fichier
 * a des modifications non committées. C'est exactement le garde-fou voulu, et
 * le message de git est repris tel quel.
 */
function PullButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function pull() {
    setPending(true);
    try {
      const res = await fetch("/api/pull", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Rafraîchissement impossible");
        return;
      }
      if (json.commits === 0) {
        toast.info("Déjà à jour");
        return;
      }
      const n = `${json.commits} commit${json.commits > 1 ? "s" : ""}`;
      if (json.donnees) {
        toast.success(`${n} — bibliothèque mise à jour`);
        // Le magasin a été vidé côté serveur ; il faut redemander les pages.
        router.refresh();
      } else {
        toast.success(`${n} — code seulement, données inchangées`);
      }
    } catch {
      toast.error("Rafraîchissement impossible");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={pull}
      disabled={pending}
      aria-label="Rafraîchir les données (git pull)"
      title="Rafraîchir les données (git pull)"
    >
      <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden />
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
          {local && <PullButton />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
