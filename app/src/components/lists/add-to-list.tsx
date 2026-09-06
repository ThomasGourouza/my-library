"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { Check, ListPlus, Plus } from "lucide-react";
import type { ListSummary } from "@/lib/lists";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CreateListDialog } from "./lists-view";

const fetcher = async (url: string): Promise<{ lists: ListSummary[] }> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

/**
 * « Ajouter à une liste » sur une fiche livre.
 *
 * Les listes sont chargées à l'ouverture du menu, pas au rendu de la page : la
 * fiche d'un livre n'a aucune raison de payer cette requête tant que personne
 * ne clique.
 */
export function AddToList({
  bookId,
  memberOf,
}: {
  bookId: number;
  /** Identifiants des listes qui contiennent déjà ce livre. */
  memberOf: number[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const { data, mutate } = useSWR(open ? "/api/lists" : null, fetcher);
  const lists = data?.lists ?? [];
  const member = new Set(memberOf);

  async function toggle(list: ListSummary) {
    const inList = member.has(list.id);
    setPending(true);
    try {
      const res = await fetch(`/api/lists/${list.id}/items`, {
        method: inList ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Opération impossible");
        return;
      }
      toast.success(
        inList ? `Retiré de « ${list.name} »` : `Ajouté à « ${list.name} »`
      );
      mutate();
      router.refresh();
    } catch {
      toast.error("Impossible de contacter le serveur");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <ListPlus className="size-4" aria-hidden />
            Listes
            {memberOf.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({memberOf.length})
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <Command>
            <CommandInput placeholder="Chercher une liste…" />
            <CommandList>
              <CommandEmpty>
                {data ? "Aucune liste." : "Chargement…"}
              </CommandEmpty>
              {lists.length > 0 && (
                <CommandGroup>
                  {lists.map((list) => {
                    const inList = member.has(list.id);
                    return (
                      <CommandItem
                        key={list.id}
                        value={list.name}
                        disabled={pending}
                        onSelect={() => void toggle(list)}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                            inList
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input [&_svg]:invisible"
                          )}
                        >
                          <Check className="size-3" />
                        </span>
                        <span className="truncate">{list.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {list.bookCount}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__nouvelle__"
                  onSelect={() => {
                    setOpen(false);
                    setCreating(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Nouvelle liste…
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateListDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={async (list) => {
          // La liste vient d'être créée : on y met le livre dans la foulée,
          // c'est la seule raison pour laquelle on la créait depuis ici.
          await fetch(`/api/lists/${list.id}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookId }),
          });
          toast.success(`Ajouté à « ${list.name} »`);
          router.refresh();
        }}
      />
    </>
  );
}
