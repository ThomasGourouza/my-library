#!/usr/bin/env python3
"""Merge déterministe des chunks nettoyés.

Entrées : output/cleaned/chunk-*.json
Sorties : output/merged.json          — auteurs + livres fusionnés
          output/near-duplicates.json — paires suspectes pour revue finale
          output/genre-inventory.json — inventaire des genres (harmonisation)

Règles :
- Auteurs fusionnés par `key`, puis par nom normalisé (clés divergentes).
- Champs : priorité aux chunks dont les livres citent « liste livres final.ods »,
  sinon premier non-null ; le nom le plus fréquent l'emporte.
- Livres dédupliqués sur (clé auteur canonique, titre normalisé) ;
  enriched=False si au moins une copie vient réellement des données.
- Near-dups : SequenceMatcher >= 0.90 sur titres d'un même auteur,
  >= 0.92 sur noms d'auteurs (tolérant aux initiales).
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

OUT = Path(__file__).parent / "output"
PRIORITY_SOURCE = "liste livres final.ods"

AUTHOR_FIELDS = ["birthYear", "deathYear", "nationality", "language",
                 "mainGenre", "mainField", "period", "notes"]
BOOK_FIELDS = ["category", "genre", "courant", "theme", "period",
               "publicationYear", "audience", "originalLanguage", "notes"]


def norm_key(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("’", "'").lower().replace("œ", "oe").replace("æ", "ae")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9']+", " ", s)).strip()


def strip_initials(s):
    """'a r radcliffe brown' -> 'radcliffe brown' (tolérance aux initiales)."""
    return " ".join(w for w in s.split() if len(w) > 1)


def is_priority(book):
    return any(str(s).startswith(PRIORITY_SOURCE) for s in book.get("sourceSheets", []))


def main():
    chunks = sorted(OUT.glob("cleaned/chunk-*.json"))
    if not chunks:
        sys.exit("Aucun chunk nettoyé dans output/cleaned/")
    print(f"{len(chunks)} chunks nettoyés")

    # ------------------------------------------------------------------
    # 1. Charger ; noter la priorité de chaque auteur (via ses livres)
    # ------------------------------------------------------------------
    raw_authors = []   # (key, author_dict, priority, chunk_name)
    raw_books = []     # book_dict (avec authorKey)
    for path in chunks:
        data = json.loads(path.read_text(encoding="utf-8"))
        prio_keys = {b["authorKey"] for b in data["books"] if is_priority(b)}
        for a in data["authors"]:
            raw_authors.append((a["key"], a, a["key"] in prio_keys, path.name))
        raw_books.extend(data["books"])

    # ------------------------------------------------------------------
    # 2. Unifier les clés d'auteurs : par key, puis par nom normalisé
    # ------------------------------------------------------------------
    canon = {}                       # key -> clé canonique
    by_norm_name = {}                # nom normalisé -> clé canonique
    for key, a, _p, _c in raw_authors:
        canon.setdefault(key, key)
    for key, a, _p, _c in raw_authors:
        nn = norm_key(a["name"])
        if nn in by_norm_name:
            canon[key] = by_norm_name[nn]
        else:
            by_norm_name[nn] = canon[key]

    def resolve(key):
        seen = set()
        while canon.get(key, key) != key and key not in seen:
            seen.add(key)
            key = canon[key]
        return key

    groups = defaultdict(list)       # clé canonique -> [(author, priority)]
    for key, a, prio, _c in raw_authors:
        groups[resolve(key)].append((a, prio))

    # ------------------------------------------------------------------
    # 3. Fusion champ par champ (priorité, puis premier non-null)
    # ------------------------------------------------------------------
    merged_authors = {}
    for ckey, items in groups.items():
        ordered = [a for a, p in items if p] + [a for a, p in items if not p]
        names = Counter(a["name"] for a in ordered)
        out = {"key": ckey, "name": names.most_common(1)[0][0]}
        for f in AUTHOR_FIELDS:
            out[f] = next((a[f] for a in ordered if a.get(f) is not None), None)
        merged_authors[ckey] = out

    # ------------------------------------------------------------------
    # 4. Fusion des livres sur (clé canonique, titre normalisé)
    # ------------------------------------------------------------------
    merged_books = {}
    for b in raw_books:
        ak = resolve(b["authorKey"])
        bid = (ak, norm_key(b["title"]))
        b = {**b, "authorKey": ak}
        if bid not in merged_books:
            merged_books[bid] = {**b, "sourceSheets": list(dict.fromkeys(b["sourceSheets"]))}
            continue
        cur = merged_books[bid]
        a, c = (b, cur) if (is_priority(b) and not is_priority(cur)) else (cur, b)
        out = {"title": a["title"], "authorKey": ak}
        for f in BOOK_FIELDS:
            out[f] = a.get(f) if a.get(f) is not None else c.get(f)
        # audience : la plus spécifique l'emporte sur le défaut « adultes »
        if a.get("audience") == "adultes" and c.get("audience") not in (None, "adultes"):
            out["audience"] = c["audience"]
        out["enriched"] = bool(a.get("enriched")) and bool(c.get("enriched"))
        out["sourceSheets"] = list(dict.fromkeys(a["sourceSheets"] + c["sourceSheets"]))
        merged_books[bid] = out

    # ------------------------------------------------------------------
    # 6. Near-dups pour la revue finale
    # ------------------------------------------------------------------
    near_books = []
    by_author = defaultdict(list)
    for (ak, nt), b in merged_books.items():
        by_author[ak].append((nt, b["title"]))
    for ak, titles in by_author.items():
        titles.sort()
        for i in range(len(titles)):
            for j in range(i + 1, len(titles)):
                r = SequenceMatcher(None, titles[i][0], titles[j][0]).ratio()
                if r >= 0.90:
                    near_books.append({"authorKey": ak, "title1": titles[i][1],
                                       "title2": titles[j][1], "ratio": round(r, 3)})

    near_authors = []
    keys = sorted(merged_authors)
    norm_names = {k: norm_key(merged_authors[k]["name"]) for k in keys}
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            n1, n2 = norm_names[keys[i]], norm_names[keys[j]]
            r = SequenceMatcher(None, n1, n2).ratio()
            r2 = SequenceMatcher(None, strip_initials(n1), strip_initials(n2)).ratio()
            if max(r, r2) >= 0.92 and strip_initials(n1) and strip_initials(n2):
                near_authors.append({"key1": keys[i], "name1": merged_authors[keys[i]]["name"],
                                     "key2": keys[j], "name2": merged_authors[keys[j]]["name"],
                                     "ratio": round(max(r, r2), 3)})

    # ------------------------------------------------------------------
    # 7. Écritures + stats
    # ------------------------------------------------------------------
    authors_list = sorted(merged_authors.values(), key=lambda a: a["key"])
    books_list = sorted(merged_books.values(),
                        key=lambda b: (b["authorKey"], norm_key(b["title"])))
    (OUT / "merged.json").write_text(
        json.dumps({"authors": authors_list, "books": books_list},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "near-duplicates.json").write_text(
        json.dumps({"books": near_books, "authors": near_authors},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    genres = Counter(b["genre"] for b in books_list if b.get("genre"))
    (OUT / "genre-inventory.json").write_text(
        json.dumps(dict(genres.most_common()), ensure_ascii=False, indent=1),
        encoding="utf-8")

    print(f"merged.json : {len(authors_list)} auteurs, {len(books_list)} livres")
    print(f"near-dups   : {len(near_books)} titres, {len(near_authors)} auteurs")
    print(f"genres      : {len(genres)} distincts")


if __name__ == "__main__":
    main()
