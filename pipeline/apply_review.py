#!/usr/bin/env python3
"""Applique déterministe les DÉCISIONS de la revue finale à merged.json.

Entrées : output/merged.json
          output/review-decisions.json  (produit par l'agent de revue finale)
Sorties : ../seed/authors.json + ../seed/books.json (schéma seed exact)

review-decisions.json :
{
  "genreMap":       {"<genre brut>": "<genre canonique>", ...},  # couvre TOUS les genres
  "authorMerges":   [{"keep": "<key>", "drop": "<key>", "reason": "..."}],
  "bookMerges":     [{"authorKey": "<key>", "keepTitle": "...", "dropTitle": "...", "reason": "..."}],
  "worldviewFixes": [{"authorKey": "<key>", "title": "...", "worldview": "<enum>"}],
  "bookDrops":      [{"authorKey": "<key>", "title": "...", "reason": "..."}],
  "notes": "..."
}

Le script fusionne les auteurs (repointe + re-dédoublonne les livres), fusionne
les livres quasi-doublons, applique la carte des genres (livres ET mainGenre
auteur), rattache les worldviews, supprime les livres-déchets, retire
sourceSheets, élague les auteurs sans livre, puis écrit les fichiers seed.
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

OUT = Path(__file__).parent / "output"
SEED = Path(__file__).parent.parent / "seed"

AUTHOR_FIELDS = ["key", "name", "birthYear", "deathYear", "nationality",
                 "language", "mainGenre", "mainField", "period", "notes"]
BOOK_MERGE_FIELDS = ["category", "genre", "courant", "theme", "period",
                     "publicationYear", "audience", "originalLanguage", "notes"]
SEED_BOOK_FIELDS = ["title", "authorKey", "category", "genre", "courant",
                    "theme", "period", "publicationYear", "audience",
                    "worldview", "originalLanguage", "notes", "enriched"]


def norm_key(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("’", "'").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9']+", " ", s)).strip()


def merge_two_books(a, c):
    """Fusionne deux dicts livre ; `a` prioritaire, complète les null via `c`."""
    out = {"title": a["title"], "authorKey": a["authorKey"]}
    for f in BOOK_MERGE_FIELDS:
        out[f] = a.get(f) if a.get(f) is not None else c.get(f)
    if a.get("audience") == "adultes" and c.get("audience") not in (None, "adultes"):
        out["audience"] = c["audience"]
    out["worldview"] = a.get("worldview") or c.get("worldview")
    out["enriched"] = bool(a.get("enriched")) and bool(c.get("enriched"))
    out["sourceSheets"] = list(dict.fromkeys(
        (a.get("sourceSheets") or []) + (c.get("sourceSheets") or [])))
    return out


def main():
    merged = json.loads((OUT / "merged.json").read_text(encoding="utf-8"))
    dec = json.loads((OUT / "review-decisions.json").read_text(encoding="utf-8"))
    authors = {a["key"]: dict(a) for a in merged["authors"]}
    books = [dict(b) for b in merged["books"]]
    log = []

    # ------------------------------------------------------------------
    # 1. Fusion d'auteurs : repointe les livres, complète les null
    # ------------------------------------------------------------------
    remap = {}
    for m in dec.get("authorMerges", []):
        keep, drop = m["keep"], m["drop"]
        if keep not in authors or drop not in authors:
            log.append(f"authorMerge ignoré (clé absente): {drop}->{keep}")
            continue
        for f in AUTHOR_FIELDS:
            if f in ("key", "name"):
                continue
            if authors[keep].get(f) is None and authors[drop].get(f) is not None:
                authors[keep][f] = authors[drop][f]
        remap[drop] = keep
        del authors[drop]
        log.append(f"authorMerge: {drop} -> {keep} ({m.get('reason','')})")

    def res(k):
        seen = set()
        while k in remap and k not in seen:
            seen.add(k)
            k = remap[k]
        return k

    for b in books:
        b["authorKey"] = res(b["authorKey"])

    # ------------------------------------------------------------------
    # 2. Suppressions explicites de livres
    # ------------------------------------------------------------------
    drops = {(d["authorKey"], norm_key(d["title"])) for d in dec.get("bookDrops", [])}
    if drops:
        before = len(books)
        books = [b for b in books if (b["authorKey"], norm_key(b["title"])) not in drops]
        log.append(f"bookDrops: {before - len(books)} livre(s) supprimé(s)")

    # ------------------------------------------------------------------
    # 3. Fusion de livres quasi-doublons (par auteur, titres normalisés)
    # ------------------------------------------------------------------
    idx = defaultdict(dict)  # authorKey -> {normTitle: book}
    for b in books:
        idx[b["authorKey"]][norm_key(b["title"])] = b
    for m in dec.get("bookMerges", []):
        ak = res(m["authorKey"])
        keep_n, drop_n = norm_key(m["keepTitle"]), norm_key(m["dropTitle"])
        grp = idx.get(ak, {})
        if keep_n in grp and drop_n in grp and keep_n != drop_n:
            grp[keep_n] = merge_two_books(grp[keep_n], grp.pop(drop_n))
            log.append(f"bookMerge[{ak}]: «{m['dropTitle']}» -> «{m['keepTitle']}»")
        else:
            log.append(f"bookMerge ignoré [{ak}]: {m.get('keepTitle')} / {m.get('dropTitle')}")
    books = [b for grp in idx.values() for b in grp.values()]

    # ------------------------------------------------------------------
    # 4. Re-dédoublonnage global (authorKey, titre normalisé)
    # ------------------------------------------------------------------
    dedup = {}
    for b in books:
        bid = (b["authorKey"], norm_key(b["title"]))
        dedup[bid] = merge_two_books(b, dedup[bid]) if bid in dedup else b
    books = list(dedup.values())

    # ------------------------------------------------------------------
    # 5. Carte des genres (livres + mainGenre auteur)
    # ------------------------------------------------------------------
    gmap = dec.get("genreMap", {})
    unmapped = set()
    for b in books:
        g = b.get("genre")
        if g is not None:
            if g in gmap:
                b["genre"] = gmap[g]
            else:
                unmapped.add(g)
    for a in authors.values():
        mg = a.get("mainGenre")
        if mg in gmap:
            a["mainGenre"] = gmap[mg]
    if unmapped:
        log.append(f"genres non mappés (laissés tels quels): {sorted(unmapped)}")
    distinct = sorted({b["genre"] for b in books if b.get("genre")})
    log.append(f"genres distincts après map: {len(distinct)}")

    # ------------------------------------------------------------------
    # 6. Rattachement des worldviews restantes
    # ------------------------------------------------------------------
    by_author = defaultdict(list)
    for b in books:
        by_author[b["authorKey"]].append(b)
    for w in dec.get("worldviewFixes", []):
        ak = res(w["authorKey"])
        tgt_n = norm_key(w["title"])
        cand = by_author.get(ak, [])
        hit = next((b for b in cand if norm_key(b["title"]) == tgt_n), None)
        if hit is None and cand:
            best = max(cand, key=lambda b: SequenceMatcher(None, norm_key(b["title"]), tgt_n).ratio())
            if SequenceMatcher(None, norm_key(best["title"]), tgt_n).ratio() >= 0.8:
                hit = best
        if hit is not None:
            hit["worldview"] = w["worldview"]
            log.append(f"worldview[{ak}] «{hit['title']}» = {w['worldview']}")
        else:
            log.append(f"worldviewFix non rattaché: {ak} / {w['title']}")

    # ------------------------------------------------------------------
    # 7. Élaguer les auteurs sans livre ; écrire les fichiers seed
    # ------------------------------------------------------------------
    used = {b["authorKey"] for b in books}
    for k in list(authors):
        if k not in used:
            del authors[k]
            log.append(f"auteur sans livre retiré: {k}")

    authors_out = sorted(
        ({f: a.get(f) for f in AUTHOR_FIELDS} for a in authors.values()),
        key=lambda a: a["key"])
    books_out = sorted(
        ({f: b.get(f) for f in SEED_BOOK_FIELDS} for b in books),
        key=lambda b: (b["authorKey"], norm_key(b["title"])))

    SEED.mkdir(exist_ok=True)
    (SEED / "authors.json").write_text(
        json.dumps(authors_out, ensure_ascii=False, indent=1), encoding="utf-8")
    (SEED / "books.json").write_text(
        json.dumps(books_out, ensure_ascii=False, indent=1), encoding="utf-8")

    print("\n".join(log))
    print(f"\nseed écrit : {len(authors_out)} auteurs, {len(books_out)} livres, "
          f"{len(distinct)} genres distincts")


if __name__ == "__main__":
    main()
