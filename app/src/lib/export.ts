/**
 * Export de la vue courante en CSV ou JSON.
 *
 * Tout se fait dans le navigateur, à partir des lignes déjà filtrées et
 * triées : ce qu'on télécharge est exactement ce qu'on voit. Une route serveur
 * aurait exigé de lui renvoyer l'état des filtres pour qu'il refasse le même
 * travail, sans rien apporter.
 */

export type ExportValue = string | number | boolean | null | undefined;

export interface ExportColumn<T> {
  /** En-tête de colonne, en clair : le fichier doit se lire sans la doc. */
  header: string;
  value: (row: T) => ExportValue;
}

/** Rendu d'une valeur pour le CSV. Les booléens deviennent oui/non. */
function toText(value: ExportValue): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

/**
 * Échappement RFC 4180 : guillemets doublés, champ mis entre guillemets dès
 * qu'il contient une virgule, un guillemet ou un saut de ligne. Les titres de
 * la bibliothèque en contiennent (« 30 ans après Maastricht : Le Frexit ou la
 * mort ») — sans cela le fichier se décale d'une colonne.
 */
function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => escapeCsv(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsv(toText(c.value(row)))).join(","));
  }
  // CRLF : la fin de ligne prescrite par la RFC, et celle qu'attendent les
  // tableurs sous Windows.
  return lines.join("\r\n") + "\r\n";
}

export function toJson<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const objects = rows.map((row) => {
    const out: Record<string, ExportValue> = {};
    for (const c of columns) out[c.header] = c.value(row) ?? null;
    return out;
  });
  return JSON.stringify(objects, null, 2) + "\n";
}

/** Horodatage court pour le nom de fichier : 2026-09-06. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function download(
  content: string,
  filename: string,
  mime: string
): void {
  // BOM UTF-8 : sans lui, LibreOffice et Excel ouvrent « Châtiment » en
  // « ChÃ¢timent ». Il est inoffensif pour tout lecteur correct.
  const blob = new Blob(["﻿", content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRows<T>(
  format: "csv" | "json",
  basename: string,
  columns: ExportColumn<T>[],
  rows: T[]
): void {
  if (format === "csv") {
    download(toCsv(columns, rows), `${basename}-${today()}.csv`, "text/csv");
  } else {
    download(
      toJson(columns, rows),
      `${basename}-${today()}.json`,
      "application/json"
    );
  }
}
