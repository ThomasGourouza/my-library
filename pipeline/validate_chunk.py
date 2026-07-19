#!/usr/bin/env python3
"""Validate one cleaned chunk file (used by cleaning agents as a self-check).

Usage: python3 validate_chunk.py output/cleaned/chunk-01.json
Exit code 0 = valid, 1 = errors (printed).
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

CATEGORIES = {"Littérature", "Philosophie & psychologie", "Histoire",
              "Sciences géopolitiques", "Sciences", "Mathématiques"}
AUDIENCES = {"enfants", "adolescents", "adultes", "tous"}
PERIODS = {"Antiquité", "Moyen Âge", "XVIe siècle", "XVIIe siècle",
           "XVIIIe siècle", "XIXe siècle", "XXe siècle", "XXIe siècle"}
AUTHOR_FIELDS = {"key", "name", "birthYear", "deathYear", "nationality",
                 "language", "mainGenre", "mainField", "period", "notes"}
BOOK_FIELDS = {"title", "authorKey", "category", "genre", "courant", "theme",
               "period", "publicationYear", "audience", "worldview",
               "originalLanguage", "notes", "enriched", "sourceSheets"}


def norm_key(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("’", "'").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9']+", " ", s)).strip()


def check_year(errors, ctx, label, y, lo=-3000, hi=2026):
    if y is None:
        return
    if not isinstance(y, int) or not (lo <= y <= hi):
        errors.append(f"{ctx}: {label} invalide: {y!r}")


def validate(path: Path):
    errors = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"JSON illisible: {e}"]

    for key in ("chunk", "authors", "books"):
        if key not in data:
            errors.append(f"clé racine manquante: {key}")
    if errors:
        return errors

    keys = {}
    for i, a in enumerate(data["authors"]):
        ctx = f"authors[{i}] {a.get('name', '?')!r}"
        extra = set(a) - AUTHOR_FIELDS
        missing = AUTHOR_FIELDS - set(a)
        if extra:
            errors.append(f"{ctx}: champs en trop {sorted(extra)}")
        if missing:
            errors.append(f"{ctx}: champs manquants {sorted(missing)}")
        if not a.get("name") or not str(a.get("name")).strip():
            errors.append(f"{ctx}: name vide")
        k = a.get("key") or ""
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", k):
            errors.append(f"{ctx}: key non kebab-case: {k!r}")
        if k in keys:
            errors.append(f"{ctx}: key dupliquée {k!r}")
        keys[k] = a
        check_year(errors, ctx, "birthYear", a.get("birthYear"))
        check_year(errors, ctx, "deathYear", a.get("deathYear"))
        b, d = a.get("birthYear"), a.get("deathYear")
        if b is not None and d is not None and d < b:
            errors.append(f"{ctx}: décès avant naissance ({b}..{d})")
        if a.get("period") is not None and a["period"] not in PERIODS:
            errors.append(f"{ctx}: period hors enum: {a['period']!r}")
        if a.get("mainField") is not None and a["mainField"] not in CATEGORIES:
            errors.append(f"{ctx}: mainField hors enum: {a['mainField']!r}")

    seen_books = set()
    books_per_author = {}
    enriched_per_author = {}
    for i, b in enumerate(data["books"]):
        ctx = f"books[{i}] {b.get('title', '?')!r}"
        extra = set(b) - BOOK_FIELDS
        missing = BOOK_FIELDS - set(b)
        if extra:
            errors.append(f"{ctx}: champs en trop {sorted(extra)}")
        if missing:
            errors.append(f"{ctx}: champs manquants {sorted(missing)}")
        title = b.get("title")
        if not title or not str(title).strip():
            errors.append(f"{ctx}: title vide")
            continue
        ak = b.get("authorKey")
        if ak not in keys:
            errors.append(f"{ctx}: authorKey inconnu {ak!r}")
        if b.get("category") not in CATEGORIES:
            errors.append(f"{ctx}: category hors enum: {b.get('category')!r}")
        if b.get("audience") not in AUDIENCES:
            errors.append(f"{ctx}: audience hors enum: {b.get('audience')!r}")
        if b.get("period") is not None and b["period"] not in PERIODS:
            errors.append(f"{ctx}: period hors enum: {b['period']!r}")
        if b.get("worldview") is not None:
            errors.append(f"{ctx}: worldview doit rester null (appliqué au merge)")
        check_year(errors, ctx, "publicationYear", b.get("publicationYear"))
        if not isinstance(b.get("enriched"), bool):
            errors.append(f"{ctx}: enriched doit être bool")
        if not isinstance(b.get("sourceSheets"), list) or not b.get("sourceSheets"):
            errors.append(f"{ctx}: sourceSheets doit être une liste non vide")
        dup = (ak, norm_key(title))
        if dup in seen_books:
            errors.append(f"{ctx}: doublon (authorKey, titre normalisé)")
        seen_books.add(dup)
        books_per_author[ak] = books_per_author.get(ak, 0) + 1
        if b.get("enriched"):
            enriched_per_author[ak] = enriched_per_author.get(ak, 0) + 1

    for k in keys:
        if books_per_author.get(k, 0) == 0:
            errors.append(f"auteur {k!r} sans aucun livre")
    for k, n in enriched_per_author.items():
        if n > 3:
            errors.append(f"auteur {k!r}: {n} livres enriched (max 3)")

    return errors


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: validate_chunk.py <cleaned-chunk.json>")
    path = Path(sys.argv[1])
    errors = validate(path)
    data = json.loads(path.read_text(encoding="utf-8")) if not errors or True else {}
    try:
        n_a, n_b = len(data.get("authors", [])), len(data.get("books", []))
        n_d = len(data.get("dropped", []))
        print(f"{path.name}: {n_a} auteurs, {n_b} livres, {n_d} écartés")
    except Exception:
        pass
    if errors:
        print(f"ÉCHEC — {len(errors)} erreur(s):")
        for e in errors[:60]:
            print("  -", e)
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
