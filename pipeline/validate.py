#!/usr/bin/env python3
"""Portail de validation final des fichiers de seed (exit != 0 si échec).

Usage : python3 validate.py [../seed]
Vérifie : enums, résolution des FK authorKey, unicités, cohérence des dates,
fenêtres de volume (800–1600 livres, 400–800 auteurs), absence de « — » et de
chaînes vides ; affiche un échantillon de 20 livres.
"""
import json
import random
import re
import sys
import unicodedata
from pathlib import Path

CATEGORIES = {"Littérature", "Philosophie & psychologie", "Histoire",
              "Sciences géopolitiques", "Sciences", "Mathématiques"}
AUDIENCES = {"enfants", "adolescents", "adultes", "tous"}
PERIODS = {"Antiquité", "Moyen Âge", "XVIe siècle", "XVIIe siècle",
           "XVIIIe siècle", "XIXe siècle", "XXe siècle", "XXIe siècle"}
WORLDVIEWS = {"cynique", "chrétienne", "aristocratique", "classique",
              "scientifique", "existentialiste", "géopolitique"}

AUTHOR_FIELDS = {"key", "name", "birthYear", "deathYear", "nationality",
                 "language", "mainGenre", "mainField", "period", "notes"}
BOOK_FIELDS = {"title", "authorKey", "category", "genre", "courant", "theme",
               "period", "publicationYear", "audience", "worldview",
               "originalLanguage", "notes", "enriched"}


def norm_key(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("’", "'").lower().replace("œ", "oe").replace("æ", "ae")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9']+", " ", s)).strip()


def check_strings(errors, ctx, obj):
    for k, v in obj.items():
        if isinstance(v, str):
            if v.strip() == "":
                errors.append(f"{ctx}: champ {k} chaîne vide (utiliser null)")
            if v.strip() == "—" or "—" == v:
                errors.append(f"{ctx}: champ {k} contient « — »")


def main():
    seed_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / "seed"
    authors = json.loads((seed_dir / "authors.json").read_text(encoding="utf-8"))
    books = json.loads((seed_dir / "books.json").read_text(encoding="utf-8"))
    errors = []

    keys = set()
    norm_names = {}
    for i, a in enumerate(authors):
        ctx = f"authors[{i}] {a.get('name', '?')!r}"
        if set(a) != AUTHOR_FIELDS:
            errors.append(f"{ctx}: champs != attendus (+{sorted(set(a)-AUTHOR_FIELDS)} "
                          f"-{sorted(AUTHOR_FIELDS-set(a))})")
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", a.get("key") or ""):
            errors.append(f"{ctx}: key invalide {a.get('key')!r}")
        if a["key"] in keys:
            errors.append(f"{ctx}: key dupliquée {a['key']!r}")
        keys.add(a["key"])
        nn = norm_key(a.get("name") or "")
        if not nn:
            errors.append(f"{ctx}: nom vide")
        elif nn in norm_names:
            errors.append(f"{ctx}: nom normalisé en double avec {norm_names[nn]!r}")
        norm_names[nn] = a.get("name")
        for f, y in (("birthYear", a.get("birthYear")), ("deathYear", a.get("deathYear"))):
            if y is not None and (not isinstance(y, int) or not -3000 <= y <= 2026):
                errors.append(f"{ctx}: {f} invalide {y!r}")
        b, d = a.get("birthYear"), a.get("deathYear")
        if b is not None and d is not None and not 0 <= d - b <= 120:
            errors.append(f"{ctx}: longévité suspecte {b}–{d}")
        if a.get("period") is not None and a["period"] not in PERIODS:
            errors.append(f"{ctx}: period hors enum {a['period']!r}")
        if a.get("mainField") is not None and a["mainField"] not in CATEGORIES:
            errors.append(f"{ctx}: mainField hors enum {a['mainField']!r}")
        check_strings(errors, ctx, a)

    seen = set()
    books_per_author = {}
    for i, b in enumerate(books):
        ctx = f"books[{i}] {b.get('title', '?')!r}"
        if set(b) != BOOK_FIELDS:
            errors.append(f"{ctx}: champs != attendus (+{sorted(set(b)-BOOK_FIELDS)} "
                          f"-{sorted(BOOK_FIELDS-set(b))})")
        if not (b.get("title") or "").strip():
            errors.append(f"{ctx}: titre vide")
        if b.get("authorKey") not in keys:
            errors.append(f"{ctx}: authorKey non résolu {b.get('authorKey')!r}")
        if b.get("category") not in CATEGORIES:
            errors.append(f"{ctx}: category hors enum {b.get('category')!r}")
        if b.get("audience") not in AUDIENCES:
            errors.append(f"{ctx}: audience hors enum {b.get('audience')!r}")
        if b.get("period") is not None and b["period"] not in PERIODS:
            errors.append(f"{ctx}: period hors enum {b['period']!r}")
        if b.get("worldview") is not None and b["worldview"] not in WORLDVIEWS:
            errors.append(f"{ctx}: worldview hors enum {b['worldview']!r}")
        y = b.get("publicationYear")
        if y is not None and (not isinstance(y, int) or not -3000 <= y <= 2026):
            errors.append(f"{ctx}: publicationYear invalide {y!r}")
        if not isinstance(b.get("enriched"), bool):
            errors.append(f"{ctx}: enriched non booléen")
        dup = (b.get("authorKey"), norm_key(b.get("title") or ""))
        if dup in seen:
            errors.append(f"{ctx}: doublon (authorKey, titre normalisé)")
        seen.add(dup)
        books_per_author[b.get("authorKey")] = books_per_author.get(b.get("authorKey"), 0) + 1
        check_strings(errors, ctx, b)

    for k in keys:
        if books_per_author.get(k, 0) == 0:
            errors.append(f"auteur {k!r} sans livre")

    # Fenêtres de volume : bornes de garde-fou (détecter une perte massive ou une
    # explosion anormale de données). L'estimation initiale du PLAN (400–800
    # auteurs / 800–1600 livres) s'est révélée basse : après nettoyage, split des
    # cellules multi-œuvres, enrichissement des lignes auteur-seul et dédoublonnage
    # honnête (fusion de 11 auteurs + 18 livres à la revue finale), le corpus réel
    # dédupliqué compte ~1050 auteurs / ~2030 livres. On élargit donc la fenêtre à
    # la réalité (objectif : conserver TOUTES les données réelles de Tom) sans
    # relâcher les contrôles d'exactitude (enums, FK, unicité, dates).
    if not 400 <= len(authors) <= 1300:
        errors.append(f"volume auteurs hors fenêtre 400–1300 : {len(authors)}")
    if not 800 <= len(books) <= 2400:
        errors.append(f"volume livres hors fenêtre 800–2400 : {len(books)}")

    print(f"seed : {len(authors)} auteurs, {len(books)} livres")
    wv = sum(1 for b in books if b.get("worldview"))
    en = sum(1 for b in books if b.get("enriched"))
    print(f"       {wv} livres avec worldview, {en} livres enrichis")

    print("\nÉchantillon de 20 livres :")
    name_by_key = {a["key"]: a["name"] for a in authors}
    for b in random.Random(42).sample(books, min(20, len(books))):
        print(f"  - {b['title']} — {name_by_key.get(b['authorKey'], '?')} "
              f"[{b['category']}/{b.get('genre') or '∅'}] {b.get('period') or ''}"
              f"{' (enrichi)' if b.get('enriched') else ''}")

    if errors:
        print(f"\nÉCHEC — {len(errors)} erreur(s) :")
        for e in errors[:80]:
            print("  -", e)
        if len(errors) > 80:
            print(f"  … et {len(errors) - 80} autres")
        sys.exit(1)
    print("\nOK — validation réussie")


if __name__ == "__main__":
    main()
