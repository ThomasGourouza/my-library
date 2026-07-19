#!/usr/bin/env python3
"""Validation d'un (ou plusieurs) chunk(s) NETTOYÉ(S) — output/cleaned/chunk-*.json.

Contrôle le contrat attendu par les agents de nettoyage (voir CLEANING_INSTRUCTIONS.md)
AVANT le merge : jeux de champs exacts, enums, format des clés, couverture des
authorKey, ≥1 livre par auteur, unicité (authorKey, titre normalisé), pas de « — »
ni de chaîne vide. Exit != 0 si erreur.

Usage :
    python3 pipeline/check_chunks.py pipeline/output/cleaned/chunk-01.json
    python3 pipeline/check_chunks.py            # tous les cleaned/chunk-*.json
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

OUT = Path(__file__).parent / "output"

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
               "originalLanguage", "notes", "enriched", "sourceSheets"}
DROP_FIELDS = {"id", "raw", "reason"}


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
            if "—" == v.strip():
                errors.append(f"{ctx}: champ {k} contient « — »")


def check_chunk(path):
    errors = []
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:
        return [f"{path}: JSON illisible — {e}"]

    if set(data) - {"chunk", "authors", "books", "dropped"}:
        errors.append(f"{path}: clés de haut niveau inattendues {sorted(set(data))}")
    authors = data.get("authors", [])
    books = data.get("books", [])
    dropped = data.get("dropped", [])

    keys = set()
    norm_names = {}
    for i, a in enumerate(authors):
        ctx = f"{path} authors[{i}] {a.get('name', '?')!r}"
        if set(a) != AUTHOR_FIELDS:
            errors.append(f"{ctx}: champs != attendus (+{sorted(set(a)-AUTHOR_FIELDS)} "
                          f"-{sorted(AUTHOR_FIELDS-set(a))})")
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", a.get("key") or ""):
            errors.append(f"{ctx}: key invalide {a.get('key')!r}")
        if a.get("key") in keys:
            errors.append(f"{ctx}: key dupliquée {a.get('key')!r}")
        keys.add(a.get("key"))
        nn = norm_key(a.get("name") or "")
        if not nn:
            errors.append(f"{ctx}: nom vide")
        elif nn in norm_names:
            errors.append(f"{ctx}: nom normalisé en double avec {norm_names[nn]!r}")
        norm_names[nn] = a.get("name")
        for f, y in (("birthYear", a.get("birthYear")), ("deathYear", a.get("deathYear"))):
            if y is not None and (not isinstance(y, int) or isinstance(y, bool) or not -3000 <= y <= 2026):
                errors.append(f"{ctx}: {f} invalide {y!r}")
        bY, dY = a.get("birthYear"), a.get("deathYear")
        if bY is not None and dY is not None and not 0 <= dY - bY <= 120:
            errors.append(f"{ctx}: longévité suspecte {bY}–{dY}")
        if a.get("period") is not None and a["period"] not in PERIODS:
            errors.append(f"{ctx}: period hors enum {a['period']!r}")
        if a.get("mainField") is not None and a["mainField"] not in CATEGORIES:
            errors.append(f"{ctx}: mainField hors enum {a['mainField']!r}")
        check_strings(errors, ctx, a)

    seen = set()
    used_keys = set()
    for i, b in enumerate(books):
        ctx = f"{path} books[{i}] {b.get('title', '?')!r}"
        if set(b) != BOOK_FIELDS:
            errors.append(f"{ctx}: champs != attendus (+{sorted(set(b)-BOOK_FIELDS)} "
                          f"-{sorted(BOOK_FIELDS-set(b))})")
        if not (b.get("title") or "").strip():
            errors.append(f"{ctx}: titre vide")
        ak = b.get("authorKey")
        used_keys.add(ak)
        if ak not in keys:
            errors.append(f"{ctx}: authorKey non résolu {ak!r} (pas dans authors[])")
        if b.get("category") not in CATEGORIES:
            errors.append(f"{ctx}: category hors enum {b.get('category')!r}")
        if b.get("audience") not in AUDIENCES:
            errors.append(f"{ctx}: audience hors enum {b.get('audience')!r}")
        if b.get("period") is not None and b["period"] not in PERIODS:
            errors.append(f"{ctx}: period hors enum {b['period']!r}")
        if b.get("worldview") is not None and b["worldview"] not in WORLDVIEWS:
            errors.append(f"{ctx}: worldview hors enum {b['worldview']!r} (doit être null)")
        y = b.get("publicationYear")
        if y is not None and (not isinstance(y, int) or isinstance(y, bool) or not -3000 <= y <= 2026):
            errors.append(f"{ctx}: publicationYear invalide {y!r}")
        if not isinstance(b.get("enriched"), bool):
            errors.append(f"{ctx}: enriched non booléen")
        if not isinstance(b.get("sourceSheets"), list) or not b.get("sourceSheets"):
            errors.append(f"{ctx}: sourceSheets doit être une liste non vide")
        dup = (ak, norm_key(b.get("title") or ""))
        if dup in seen:
            errors.append(f"{ctx}: doublon (authorKey, titre normalisé)")
        seen.add(dup)
        check_strings(errors, ctx, b)

    for k in keys:
        if k not in used_keys:
            errors.append(f"{path}: auteur {k!r} sans livre (chaque auteur émis doit avoir ≥1 livre)")

    for i, d in enumerate(dropped):
        if set(d) - DROP_FIELDS:
            errors.append(f"{path} dropped[{i}]: champs inattendus {sorted(set(d)-DROP_FIELDS)}")

    return errors


def main():
    if len(sys.argv) > 1:
        paths = [Path(p) for p in sys.argv[1:]]
    else:
        paths = sorted(OUT.glob("cleaned/chunk-*.json"))
    if not paths:
        sys.exit("Aucun chunk à valider")
    all_errors = []
    for p in paths:
        errs = check_chunk(p)
        a = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        print(f"{p.name}: {len(a.get('authors',[]))} auteurs, {len(a.get('books',[]))} livres, "
              f"{len(a.get('dropped',[]))} dropped — {'OK' if not errs else str(len(errs))+' ERREUR(S)'}")
        all_errors.extend(errs)
    if all_errors:
        print(f"\nÉCHEC — {len(all_errors)} erreur(s) :")
        for e in all_errors[:120]:
            print("  -", e)
        if len(all_errors) > 120:
            print(f"  … et {len(all_errors) - 120} autres")
        sys.exit(1)
    print("\nOK — tous les chunks validés")


if __name__ == "__main__":
    main()
