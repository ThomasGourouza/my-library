/**
 * Mesures du corpus de parcours. Sert au avant/après de la révision.
 *
 *   npx tsx scripts/parcours-metrics.ts [étiquette]
 *
 * Le ratio parcours/livre par priorité est l'indicateur central : sous la
 * contrainte de couverture, un livre spécialisé valait 1,06 — c'est-à-dire
 * exactement une fois, parce qu'il fallait bien le caser quelque part.
 */
import { listBooks } from "@/lib/queries";
import { ROADMAPS } from "@/lib/roadmaps/index";
import { resolveLibrary } from "@/lib/roadmaps/resolve";
import { priorityIndex, priorityOf } from "@/lib/priorities/resolve";
import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/priorities/types";

async function main() {
const books = await listBooks();
const { itemsBySlug, refsByBookId } = resolveLibrary(books);
const idx = priorityIndex();

const tailles = [...itemsBySlug.values()].map((i) => i.length).sort((a, b) => a - b);
const entrees = tailles.reduce((a, b) => a + b, 0);
const couverts = books.filter((b) => refsByBookId.has(b.id)).length;
const mediane = tailles[Math.floor(tailles.length / 2)];

const parPrio = new Map<Priority, { livres: number; entrees: number; couverts: number }>();
for (const p of PRIORITIES) parPrio.set(p, { livres: 0, entrees: 0, couverts: 0 });
for (const b of books) {
  const p = priorityOf(b, idx);
  if (!p) continue;
  const s = parPrio.get(p)!;
  s.livres++;
  const n = refsByBookId.get(b.id)?.length ?? 0;
  s.entrees += n;
  if (n > 0) s.couverts++;
}

const etiquette = process.argv[2] ?? "état";
console.log(`\n═══ ${etiquette} ═══`);
console.log(`parcours ............ ${ROADMAPS.length}`);
console.log(`entrées ............. ${entrees}`);
console.log(`livres couverts ..... ${couverts} / ${books.length} (${((couverts / books.length) * 100).toFixed(1)} %)`);
console.log(`taille min/méd/max .. ${tailles[0]} / ${mediane} / ${tailles[tailles.length - 1]}`);

console.log(`\n  priorité          livres   couverts   entrées   parcours/livre`);
for (const p of PRIORITIES) {
  const s = parPrio.get(p)!;
  const ratio = s.couverts ? (s.entrees / s.couverts).toFixed(2) : "—";
  console.log(
    `  ${PRIORITY_LABELS[p].padEnd(16)} ${String(s.livres).padStart(6)} ${String(s.couverts).padStart(10)} ` +
      `${String(s.entrees).padStart(9)} ${ratio.padStart(16)}`
  );
}

// Part des entrées spécialisées par parcours : le marqueur de remplissage.
const parts = ROADMAPS.map((r) => {
  const items = itemsBySlug.get(r.slug) ?? [];
  const spe = items.filter((i) => priorityOf(i.book, idx) === "specialise").length;
  const ei = items.filter((i) => {
    const p = priorityOf(i.book, idx);
    return p === "essentiel" || p === "important";
  }).length;
  return { slug: r.slug, n: items.length, spe, pctSpe: items.length ? (spe / items.length) * 100 : 0, ei };
}).sort((a, b) => b.pctSpe - a.pctSpe);

const horsNorme = parts.filter((p) => p.pctSpe > 20 || p.ei < 6 || p.n < 8);
console.log(`\nparcours hors garde-fous (>20 % spécialisé, <6 E+I, ou <8 entrées) : ${horsNorme.length} / ${ROADMAPS.length}`);
for (const p of horsNorme.slice(0, 12)) {
  console.log(`  ${p.pctSpe.toFixed(0).padStart(3)} % spé · ${String(p.ei).padStart(2)} E+I · ${String(p.n).padStart(3)} entrées  ${p.slug}`);
}
if (horsNorme.length > 12) console.log(`  … et ${horsNorme.length - 12} autres`);
}

// La lecture de la bibliothèque est asynchrone (cf. `@/lib/store`) : le corps
// du script vit dans un `main()`, faute de quoi rien ne pourrait être `await`.
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
