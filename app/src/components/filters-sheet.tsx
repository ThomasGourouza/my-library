"use client";

import * as React from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Les filtres, pour les livres comme pour les auteurs.
 *
 * Sur un portable, chaque filtre est un popover aligné dans la barre d'outils.
 * À 390 px ils débordaient sur plusieurs rangs, repoussant la première ligne
 * sous la ligne de flottaison. Ici un seul bouton les rassemble dans un
 * panneau qui monte du bas — un accordéon, parce que « Genre » compte une
 * quarantaine de valeurs et que tout déplier d'un coup ne se parcourt pas.
 *
 * `FilterOptionList` est la liste cochable elle-même, partagée par le panneau
 * mobile et par les popovers de bureau des deux pages — qui en avaient chacune
 * leur copie. Une seule façon de cocher un filtre, quelle que soit la page ou
 * la largeur de l'écran.
 */

/** La liste cochable d'un filtre, avec sa recherche. Utilisée par le popover
 *  de bureau et par le panneau mobile. */
export function FilterOptionList({
  options,
  selected,
  onToggle,
  getLabel,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  getLabel?: (value: string) => string;
}) {
  const display = getLabel ?? ((v: string) => v);
  return (
    <Command>
      <CommandInput placeholder="Rechercher…" />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <CommandItem key={option} onSelect={() => onToggle(option)}>
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input [&_svg]:invisible"
                  )}
                >
                  <Check className="size-3" />
                </span>
                {display(option)}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export interface FilterGroup<K extends string> {
  key: K;
  label: string;
  options: string[];
  getLabel?: (value: string) => string;
}

export function FiltersSheet<K extends string>({
  groups,
  selected,
  onToggle,
  onReset,
  className,
}: {
  groups: FilterGroup<K>[];
  selected: Record<K, string[]>;
  onToggle: (key: K, value: string) => void;
  onReset: () => void;
  className?: string;
}) {
  const activeCount = groups.reduce(
    (n, g) => n + selected[g.key].length,
    0
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        {/* h-10 : cible confortable au pouce, contre h-8 sur le bureau. */}
        <Button variant="outline" className={cn("h-10", className)}>
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtres
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Filtres</SheetTitle>
        </SheetHeader>
        <SheetBody className="px-0">
          <Accordion type="single" collapsible>
            {groups.map((group) => {
              const count = selected[group.key].length;
              return (
                <AccordionItem key={group.key} value={group.key}>
                  <AccordionTrigger className="px-4">
                    <span className="flex items-center gap-2">
                      {group.label}
                      {count > 0 && (
                        <Badge variant="secondary" className="px-1.5">
                          {count}
                        </Badge>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-2 pb-2">
                    <FilterOptionList
                      options={group.options}
                      selected={selected[group.key]}
                      onToggle={(v) => onToggle(group.key, v)}
                      getLabel={group.getLabel}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </SheetBody>
        <SheetFooter>
          <Button
            variant="ghost"
            className="h-10 flex-1"
            onClick={onReset}
            disabled={activeCount === 0}
          >
            Réinitialiser
            <X className="size-4" aria-hidden />
          </Button>
          <SheetClose asChild>
            <Button className="h-10 flex-1">
              Voir les résultats
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
