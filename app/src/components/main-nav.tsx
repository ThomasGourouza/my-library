"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LibraryBig, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const tabs = [
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-14 items-center gap-6">
        <Link href="/livres" className="flex items-center gap-2 font-semibold">
          <LibraryBig className="size-5" aria-hidden />
          <span>Ma Bibliothèque</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Navigation principale">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(tab.href + "/");
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
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
