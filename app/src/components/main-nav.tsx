"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LibraryBig, Moon, Sun } from "lucide-react";
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

export function MainNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <LibraryBig className="size-5" aria-hidden />
          {/* Sous 640 px, le nom faisait passer l'en-tête sur deux lignes et
              poussait la bascule de thème hors de l'écran. L'icône reste le
              lien vers l'accueil, et le nom revient dès qu'il y a la place. */}
          <span className="hidden sm:inline">Ma Bibliothèque</span>
          <span className="sr-only sm:hidden">Ma Bibliothèque</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Navigation principale">
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
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
        <div className="ml-auto flex items-center gap-2">
          <CommandPalette />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
