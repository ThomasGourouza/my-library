"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { exportRows, type ExportColumn } from "@/lib/export";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Bouton « Exporter » : télécharge les lignes que les filtres laissent passer.
 *
 * Le menu annonce le nombre exporté et l'ordre du fichier, pour qu'on ne
 * découvre pas après coup qu'on vient d'exporter 2 038 livres au lieu des 12
 * affichés. L'ordre est celui du corpus filtré, pas celui de la colonne sur
 * laquelle on vient de trier : un fichier se retrie dans le tableur, et
 * dupliquer ici les règles de tri de la table serait deux vérités à tenir.
 */
export function ExportMenu<T>({
  rows,
  columns,
  basename,
  label,
  order,
}: {
  rows: T[];
  columns: ExportColumn<T>[];
  /** Préfixe du nom de fichier ; la date est ajoutée automatiquement. */
  basename: string;
  /** Nom des lignes au singulier : « livre », « auteur ». */
  label: string;
  /** Comment le fichier est ordonné, annoncé dans le menu. */
  order: string;
}) {
  const plural = rows.length > 1 ? "s" : "";

  const run = (format: "csv" | "json") => {
    if (rows.length === 0) {
      toast.info("Rien à exporter avec ces filtres");
      return;
    }
    exportRows(format, basename, columns, rows);
    toast.success(
      `${rows.length} ${label}${plural} exporté${plural} en ${format.toUpperCase()}`
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <Download className="size-4" aria-hidden />
          Exporter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          <span className="font-medium">
            {rows.length} {label}
            {plural}
          </span>{" "}
          — filtres actifs, {order}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => run("csv")}>
          CSV (tableur)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("json")}>JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
