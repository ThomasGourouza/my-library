"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  BookOpen,
  LayoutDashboard,
  Library,
  Plus,
  Route,
  Search,
  Users,
} from "lucide-react";
import type { SearchResults } from "@/app/api/search/route";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

/** Pages atteignables sans rien taper. */
const PAGES = [
  { href: "/", label: "Vue d’ensemble", Icon: LayoutDashboard },
  { href: "/livres", label: "Livres", Icon: Library },
  { href: "/auteurs", label: "Auteurs", Icon: Users },
  { href: "/parcours", label: "Parcours de lecture", Icon: Route },
  { href: "/livres/nouveau", label: "Ajouter un livre", Icon: Plus },
  { href: "/auteurs/nouveau", label: "Ajouter un auteur", Icon: Plus },
];

const EMPTY: SearchResults = { books: [], authors: [], roadmaps: [] };

const fetcher = async (url: string): Promise<SearchResults> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

/**
 * Palette de commandes globale (⌘K / Ctrl+K).
 *
 * Aller à un auteur depuis une fiche livre demandait jusqu'ici de passer par
 * l'onglet Auteurs et de retaper le nom. La palette cherche d'un coup dans les
 * livres, les auteurs et les parcours, depuis n'importe quelle page.
 *
 * La recherche est faite par le serveur (`/api/search`) : les fiches ne
 * chargent ni les 2 038 livres ni les 1 069 auteurs, et il n'y a aucune raison
 * de les leur envoyer pour une recherche occasionnelle.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const trimmed = debounced.trim();
  const { data, isLoading } = useSWR<SearchResults>(
    open && trimmed.length >= 2
      ? `/api/search?q=${encodeURIComponent(trimmed)}`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const results = data ?? EMPTY;
  const hasResults =
    results.books.length + results.authors.length + results.roadmaps.length > 0;

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const groups: {
    heading: string;
    Icon: typeof BookOpen;
    hits: SearchResults["books"];
  }[] = [
    { heading: "Livres", Icon: BookOpen, hits: results.books },
    { heading: "Auteurs", Icon: Users, hits: results.authors },
    { heading: "Parcours", Icon: Route, hits: results.roadmaps },
  ];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-muted-foreground"
        // Le libellé disparaît sous 640 px : sans nom accessible, le bouton
        // n'est plus qu'une icône pour un lecteur d'écran.
        aria-label="Rechercher"
        title="Rechercher (⌘K ou Ctrl+K)"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden sm:inline">Rechercher</span>
        <CommandShortcut className="hidden sm:inline">⌘K</CommandShortcut>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Recherche"
        description="Chercher un livre, un auteur ou un parcours"
      >
        {/* CommandDialog n'enveloppe pas ses enfants dans <Command> : c'est ici
            qu'on pose la racine cmdk, et qu'on lui interdit de refiltrer. Le
            filtrage est fait par /api/search sur les colonnes normalisées ;
            refiltrer côté client masquerait des résultats pertinents (une
            recherche sans accents ne correspondrait plus au titre affiché). */}
        <Command shouldFilter={false} className="p-0">
          <CommandInput
            placeholder="Chercher un livre, un auteur, un parcours…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {trimmed.length >= 2 && !hasResults && (
              <CommandEmpty>
                {isLoading ? "Recherche…" : "Aucun résultat."}
              </CommandEmpty>
            )}

            {trimmed.length < 2 && (
              <CommandGroup heading="Aller à">
                {PAGES.map(({ href, label, Icon }) => (
                  <CommandItem
                    key={href}
                    value={href}
                    onSelect={() => go(href)}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {groups.map(({ heading, Icon, hits }) =>
              hits.length === 0 ? null : (
                <CommandGroup key={heading} heading={heading}>
                  {hits.map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={hit.id}
                      onSelect={() => go(hit.href)}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{hit.label}</span>
                      <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                        {hit.hint}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
