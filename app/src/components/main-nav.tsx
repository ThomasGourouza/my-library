"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LibraryBig } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/livres", label: "Livres" },
  { href: "/auteurs", label: "Auteurs" },
];

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
      </div>
    </header>
  );
}
