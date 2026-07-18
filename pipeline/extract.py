#!/usr/bin/env python3
"""Extract raw rows from the two .ods source files and the worldview .md.

Reads the .ods zip archives directly (works even with LibreOffice lock files
present) and writes one JSON file per sheet to output/raw/, plus
worldviews.json parsed from "bibliothèque vision du monde.md".

Sources are read-only and never modified.
"""
import json
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "output" / "raw"

TABLE_NS = "urn:oasis:names:tc:opendocument:xmlns:table:1.0"

SOURCES = [
    REPO / "liste livres final.ods",
    REPO / "library-organized.ods",
]
WORLDVIEW_MD = REPO / "bibliothèque vision du monde.md"


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    return s


def row_cells(row, max_repeat=60):
    """Return the list of cell texts for a table-row, expanding
    number-columns-repeated and trimming trailing empties."""
    cells = []
    for cell in row.findall(f"{{{TABLE_NS}}}table-cell"):
        repeat = int(cell.get(f"{{{TABLE_NS}}}number-columns-repeated", "1"))
        paras = []
        for child in cell:
            t = "".join(child.itertext()).strip()
            if t:
                paras.append(t)
        text = " ".join(paras)
        for _ in range(min(repeat, max_repeat)):
            cells.append(text)
    while cells and not cells[-1]:
        cells.pop()
    return cells


def extract_ods(path: Path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("content.xml"))
    sheets = {}
    for table in root.iter(f"{{{TABLE_NS}}}table"):
        name = table.get(f"{{{TABLE_NS}}}name")
        rows = []
        idx = 0
        for r in table.findall(f"{{{TABLE_NS}}}table-row"):
            rep = int(r.get(f"{{{TABLE_NS}}}number-rows-repeated", "1"))
            cs = row_cells(r)
            for _ in range(min(rep, 5)):
                if cs:
                    rows.append({"row": idx, "cells": cs})
                idx += 1
        sheets[name] = rows
    return sheets


VISION_RE = re.compile(r"^#\s+.*Vision\s+\*\*(.+?)\*\*")
ENTRY_RE = re.compile(r"^\*\s+(.+?)\s+[—–-]\s+\*(.+?)\*")


def extract_worldviews(path: Path):
    categories = []
    current = None
    for line in path.read_text(encoding="utf-8").splitlines():
        m = VISION_RE.match(line.strip())
        if m:
            label = m.group(1).strip()
            slug = label.split("/")[0].strip().split()[0]
            current = {"worldview": slug, "label": label, "entries": []}
            categories.append(current)
            continue
        # Stop collecting entries after the 7 category sections end
        if line.startswith("# 📌") or line.startswith("Si tu veux"):
            current = None
        if current is None:
            continue
        m = ENTRY_RE.match(line.strip())
        if m:
            current["entries"].append(
                {"author": m.group(1).strip(), "title": m.group(2).strip()}
            )
    return categories


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for src in SOURCES:
        src_slug = slugify(src.stem)
        for sheet, rows in extract_ods(src).items():
            fname = f"{src_slug}__{slugify(sheet)}.json"
            payload = {"source": src.name, "sheet": sheet, "rows": rows}
            (OUT / fname).write_text(
                json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
            )
            print(f"  {fname}: {len(rows)} rows")
            total += len(rows)

    worldviews = extract_worldviews(WORLDVIEW_MD)
    (OUT / "worldviews.json").write_text(
        json.dumps(worldviews, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    n_entries = sum(len(c["entries"]) for c in worldviews)
    print(f"  worldviews.json: {len(worldviews)} categories, {n_entries} entries")
    print(f"Total rows extracted: {total}")
    if len(worldviews) != 7:
        raise SystemExit(f"ERROR: expected 7 worldview categories, got {len(worldviews)}")


if __name__ == "__main__":
    main()
