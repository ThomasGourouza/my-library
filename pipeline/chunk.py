#!/usr/bin/env python3
"""Cut records.jsonl into chunks for parallel cleaning agents.

- Records WITH an author are grouped by normalized author key and packed into
  N_AUTHOR_CHUNKS chunks, cutting only on author boundaries so all rows of a
  given author land in the same chunk (makes parallel dedup safe).
- Records WITHOUT an author (bare / title_only) go into smaller
  chunk-titles-N files (they need heavier per-row reasoning).

Output: output/chunks/chunk-NN.json, chunk-titles-N.json, manifest.json
"""
import json
import math
import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
CHUNKS = OUT / "chunks"

N_AUTHOR_CHUNKS = 12
TITLE_CHUNK_SIZE = 145


def norm_key(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("’", "'").lower()
    s = re.sub(r"[^a-z0-9']+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def main():
    CHUNKS.mkdir(parents=True, exist_ok=True)
    for old in CHUNKS.glob("*.json"):
        old.unlink()

    records = [json.loads(l) for l in (OUT / "records.jsonl").open(encoding="utf-8")]
    with_author = [r for r in records if r["author"]]
    without = [r for r in records if not r["author"]]

    # group by author key, sorted alphabetically
    groups = {}
    for r in with_author:
        groups.setdefault(norm_key(r["author"]), []).append(r)
    ordered = [groups[k] for k in sorted(groups)]

    target = math.ceil(len(with_author) / N_AUTHOR_CHUNKS)
    chunks, cur = [], []
    for g in ordered:
        if cur and len(cur) + len(g) > target and len(chunks) < N_AUTHOR_CHUNKS - 1:
            chunks.append(cur)
            cur = []
        cur.extend(g)
    if cur:
        chunks.append(cur)

    manifest = []
    for i, ch in enumerate(chunks, 1):
        name = f"chunk-{i:02d}.json"
        n_authors = len({norm_key(r["author"]) for r in ch})
        (CHUNKS / name).write_text(
            json.dumps({"chunk": name, "kind": "authors", "records": ch},
                       ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        manifest.append({"file": name, "records": len(ch), "authors": n_authors})
        print(f"  {name}: {len(ch)} records, {n_authors} authors "
              f"({ch[0]['author']!r} → {ch[-1]['author']!r})")

    n_title_chunks = math.ceil(len(without) / TITLE_CHUNK_SIZE)
    for i in range(n_title_chunks):
        part = without[i * TITLE_CHUNK_SIZE:(i + 1) * TITLE_CHUNK_SIZE]
        name = f"chunk-titles-{i + 1}.json"
        (CHUNKS / name).write_text(
            json.dumps({"chunk": name, "kind": "titles", "records": part},
                       ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        manifest.append({"file": name, "records": len(part), "authors": 0})
        print(f"  {name}: {len(part)} records (sans auteur)")

    (CHUNKS / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"Total: {len(records)} records -> {len(chunks)} author chunks "
          f"+ {n_title_chunks} title chunks")


if __name__ == "__main__":
    main()
