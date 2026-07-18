#!/usr/bin/env python3
"""Normalize the 10 raw sheet extracts into a uniform records.jsonl.

Handles per-sheet quirks:
- liste livres final (6 sheets): 9 rich columns, "—" gaps, multi-work cells.
- contes: parallel tables (cols A/B = children's books -> audienceHint enfants;
  cols E/F = classics with running section headers; stray far-right author lists).
- histoire,_politique_et_geopolit: Author/Title columns reversed, WhatsApp
  paste artifacts, category header junk rows.
- romans,_poesie_et_theatre: alphabetically sorted so period headers are junk;
  bare-author and bare-title single-cell rows.
- philosophie: reversed pairs + 429 single-cell rows of mixed formats.

Output: output/records.jsonl (one record per line) + output/junk.jsonl (audit).
"""
import json
import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "output" / "raw"
OUT = HERE / "output"

CATEGORY_BY_SHEET = {
    "liste_livres_final__litterature": "Littérature",
    "liste_livres_final__philosophie_psychologie": "Philosophie & psychologie",
    "liste_livres_final__sciences_geopolitiques": "Sciences géopolitiques",
    "liste_livres_final__histoire": "Histoire",
    "liste_livres_final__sciences": "Sciences",
    "liste_livres_final__mathematiques": "Mathématiques",
    "library_organized__contes": "Littérature",
    "library_organized__histoire_politique_et_geopolit": "Histoire",
    "library_organized__romans_poesie_et_theatre": "Littérature",
    "library_organized__philosophie": "Philosophie & psychologie",
}

# Section headers observed in the contes right-hand table (col E when col F empty).
CONTES_SECTION_HEADERS = {
    "Épopée & poésie archaïque", "Tragédie et comédie", "Histoire", "Philosophie",
    "Poésie & épopée romaine", "Christianisme", "Ancien Testament", "Nouveau Testament",
}

WHATSAPP_RE = re.compile(r"^\[\d{1,2}:\d{2},\s*\d{1,2}/\d{1,2}/\d{4}\]\s*[^:]{1,30}:\s*")
DATES_RE = re.compile(
    r"\((?:né(?:e)? en )?(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?\s*"
    r"(av\.?\s*J\.?\s*-?\s*C\.?)?\s*(apr\.?\s*J\.?\s*-?\s*C\.?)?\)"
)
NUM_HEADER_RE = re.compile(r"^\d+\.\s")


def nfc(s):
    if s is None:
        return None
    s = unicodedata.normalize("NFC", s)
    s = s.replace("’", "’").replace("'", "’")  # unify apostrophes
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def norm_key(s):
    """Accent-insensitive lowercase key (dedup/search only, never displayed)."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("’", "'").lower()
    s = re.sub(r"[^a-z0-9']+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def clean_gap(s):
    """'—' style placeholders -> None."""
    s = nfc(s)
    if s in (None, "—", "–", "-", "?", "N/A", "n/a"):
        return None
    return s


def parse_year(s):
    s = clean_gap(s)
    if s is None:
        return None
    m = re.search(r"-?\d{1,4}", s)
    if not m:
        return None
    y = int(m.group(0))
    if re.search(r"av\.?\s*J", s):
        y = -abs(y)
    return y


def split_works(cell, strict=False):
    """Split a multi-work cell on top-level ', ' (outside parentheses).
    Commas inside numbers ('5,000') survive because they lack the space.
    If strict and any resulting part starts lowercase (likely a series title
    like 'il etait une fois, l'homme, ...'), return the whole cell unsplit."""
    if cell is None:
        return []
    parts, depth, cur, i = [], 0, "", 0
    while i < len(cell):
        ch = cell[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0 and i + 1 < len(cell) and cell[i + 1] == " ":
            parts.append(cur)
            cur = ""
            i += 2
            continue
        cur += ch
        i += 1
    parts.append(cur)
    parts = [p.strip(" ,") for p in parts if p.strip(" ,")]
    if len(parts) > 1 and strict:
        for p in parts[1:]:
            first = p.lstrip("’'\"«")[:1]
            if first and first.islower():
                return [cell.strip()]
    return parts


class Precleaner:
    def __init__(self):
        self.records = []
        self.junk = []
        self.known_authors = set()
        self.known_surnames = set()

    def rec(self, sheet_slug, source, sheet, row, kind, author=None, title=None,
            uncertain=False, author_only=False, raw=None, **extra):
        r = {
            "id": f"r{len(self.records) + 1:04d}",
            "source": source,
            "sheet": sheet,
            "row": row,
            "kind": kind,
            "author": nfc(author),
            "title": nfc(title),
            "theme": None, "genre": None, "courant": None, "period": None,
            "birthYear": None, "deathYear": None, "notes": None,
            "categoryHint": CATEGORY_BY_SHEET[sheet_slug],
            "audienceHint": None, "sectionHint": None,
            "authorOnly": author_only, "uncertain": uncertain,
            "raw": raw,
        }
        r.update(extra)
        self.records.append(r)
        return r

    def junk_row(self, source, sheet, row, text, reason):
        self.junk.append({"source": source, "sheet": sheet, "row": row,
                          "text": text, "reason": reason})

    # ---------- author knowledge base (built from well-structured sheets) ----

    def learn_author(self, name):
        k = norm_key(name)
        if not k:
            return
        self.known_authors.add(k)
        parts = k.split()
        if len(parts) >= 2:
            self.known_surnames.add(parts[-1])

    def looks_known_author(self, text):
        k = norm_key(text)
        return k in self.known_authors or (len(k.split()) == 1 and k in self.known_surnames)

    # ---------- sheet handlers ----------------------------------------------

    def do_liste(self, slug, data):
        src, sheet = data["source"], data["sheet"]
        for r in data["rows"]:
            cells = r["cells"] + [""] * 9
            if cells[0] == "Auteur":
                continue
            author = clean_gap(cells[0])
            works = clean_gap(cells[1])
            if author is None and works is None:
                self.junk_row(src, sheet, r["row"], json.dumps(cells[:9], ensure_ascii=False), "empty")
                continue
            common = dict(
                theme=clean_gap(cells[2]), genre=clean_gap(cells[3]),
                courant=clean_gap(cells[4]), period=clean_gap(cells[5]),
                birthYear=parse_year(cells[6]), deathYear=parse_year(cells[7]),
                notes=clean_gap(cells[8]),
            )
            self.learn_author(author)
            raw = " | ".join(c for c in cells[:9] if c)
            if works is None:
                self.rec(slug, src, sheet, r["row"], "author_only", author=author,
                         author_only=True, raw=raw, **common)
            else:
                for w in split_works(works):
                    self.rec(slug, src, sheet, r["row"], "pair", author=author,
                             title=w, raw=raw, **common)

    def do_contes(self, slug, data):
        src, sheet = data["source"], data["sheet"]
        section = None
        for r in data["rows"]:
            cells = r["cells"] + [""] * 12
            row = r["row"]
            a, t = nfc(cells[0]), nfc(cells[1])
            # left table: children's books
            if a == "Auteur":
                pass
            elif a and t:
                self.learn_author(a)
                for w in split_works(t, strict=True):
                    self.rec(slug, src, sheet, row, "pair", author=a, title=w,
                             audienceHint="enfants", raw=f"{a} | {t}")
            elif a and not t:
                self.rec(slug, src, sheet, row, "author_only", author=a,
                         author_only=True, audienceHint="enfants", raw=a)
            elif t and not a:
                self.rec(slug, src, sheet, row, "title_only", title=t,
                         uncertain=True, audienceHint="enfants", raw=t)
            # right table: classics with running section headers
            ra, rt = nfc(cells[4]), nfc(cells[5])
            if ra and not rt:
                if ra in CONTES_SECTION_HEADERS:
                    section = ra
                else:
                    self.rec(slug, src, sheet, row, "author_only", author=ra,
                             author_only=True, uncertain=True, sectionHint=section, raw=ra)
            elif ra and rt:
                author = None if ra == "?" else ra
                if author and "," not in author:
                    self.learn_author(author)
                for w in split_works(rt, strict=True):
                    self.rec(slug, src, sheet, row, "pair" if author else "title_only",
                             author=author, title=w, uncertain=author is None,
                             sectionHint=section, raw=f"{ra} | {rt}")
            # stray far-right cells (author lists, parenthesized names)
            for extra_cell in cells[6:12]:
                x = nfc(extra_cell)
                if not x:
                    continue
                x = x.strip("()")
                for part in split_works(x):
                    self.rec(slug, src, sheet, row, "author_only", author=part,
                             author_only=True, uncertain=True, raw=extra_cell)

    def do_histoire_politique(self, slug, data):
        src, sheet = data["source"], data["sheet"]
        for r in data["rows"]:
            cells = r["cells"] + [""] * 2
            row = r["row"]
            c0, c1 = nfc(cells[0]), nfc(cells[1])
            if c0 == "Auteur":
                continue
            if c0 and c1:  # reversed: title in col A, author in col B
                self.learn_author(c1)
                self.rec(slug, src, sheet, row, "pair", author=c1, title=c0,
                         raw=f"{c0} | {c1}")
            elif c0 and not c1:
                self.junk_row(src, sheet, row, c0, "category header in sorted sheet")
            elif c1 and not c0:
                text = WHATSAPP_RE.sub("", c1).strip()
                if not text:
                    self.junk_row(src, sheet, row, c1, "whatsapp artifact only")
                    continue
                # comma-packed shorthand lists -> one uncertain record per part
                for part in split_works(text):
                    self.rec(slug, src, sheet, row, "bare", title=part,
                             uncertain=True, raw=c1)

    def classify_single(self, slug, src, sheet, row, text, raw):
        if text.startswith("#") or NUM_HEADER_RE.match(text):
            self.junk_row(src, sheet, row, text, "header/meta in sorted sheet")
            return
        m = DATES_RE.search(text)
        if m and not re.match(r"^\d", text):
            name = nfc(DATES_RE.sub("", text).strip(" ,;"))
            # drop trailing parentheticals like "(Comédie)" or "(maths)"
            note_m = re.search(r"\(([^)]*)\)\s*$", name or "")
            notes = None
            if note_m:
                notes = note_m.group(1)
                name = nfc(re.sub(r"\([^)]*\)\s*$", "", name).strip(" ,;"))
            birth = int(m.group(1))
            death = int(m.group(2)) if m.group(2) else None
            if m.group(3):  # av. J.-C.
                birth = -birth
                if death is not None:
                    death = -death
            self.learn_author(name)
            self.rec(slug, src, sheet, row, "author_only", author=name,
                     author_only=True, birthYear=birth, deathYear=death,
                     notes=notes, raw=raw)
            return
        if " - " in text or " — " in text or " – " in text:
            left, right = re.split(r"\s+[-–—]\s+", text, maxsplit=1)
            self.rec(slug, src, sheet, row, "dash_pair", author=left, title=right,
                     uncertain=True, raw=raw,
                     notes="ordre auteur/titre incertain (séparateur tiret)")
            return
        stripped = text.strip("()")
        if self.looks_known_author(stripped):
            self.rec(slug, src, sheet, row, "author_only", author=stripped,
                     author_only=True, uncertain=text != stripped, raw=raw)
            return
        self.rec(slug, src, sheet, row, "bare", title=stripped, uncertain=True, raw=raw)

    def do_romans(self, slug, data):
        src, sheet = data["source"], data["sheet"]
        for r in data["rows"]:
            cells = r["cells"] + [""] * 2
            row = r["row"]
            c0, c1 = nfc(cells[0]), nfc(cells[1])
            if c0 == "Auteur":
                continue
            if c0 and c1:  # correct order: author, title
                if "," not in c0:
                    self.learn_author(c0)
                self.rec(slug, src, sheet, row, "pair", author=c0, title=c1,
                         raw=f"{c0} | {c1}")
            elif c0:
                self.classify_single(slug, src, sheet, row, c0, c0)
            elif c1:
                self.rec(slug, src, sheet, row, "title_only", title=c1,
                         uncertain=True, raw=c1)

    def do_philosophie(self, slug, data):
        src, sheet = data["source"], data["sheet"]
        for r in data["rows"]:
            cells = r["cells"] + [""] * 2
            row = r["row"]
            c0, c1 = nfc(cells[0]), nfc(cells[1])
            if c0 == "Auteur":
                continue
            if c0 and c1:  # reversed: title in col A, author in col B
                self.learn_author(c1)
                self.rec(slug, src, sheet, row, "pair", author=c1, title=c0,
                         raw=f"{c0} | {c1}")
            elif c0:
                self.classify_single(slug, src, sheet, row, c0, c0)
            elif c1:
                self.rec(slug, src, sheet, row, "title_only", title=c1,
                         uncertain=True, raw=c1)


def main():
    p = Precleaner()
    files = {f.stem: json.loads(f.read_text(encoding="utf-8"))
             for f in RAW.glob("*.json") if f.stem != "worldviews"}

    # Pass 1: well-structured sheets first, to build the known-author base.
    for slug in sorted(files):
        if slug.startswith("liste_livres_final__"):
            p.do_liste(slug, files[slug])
    p.do_contes("library_organized__contes", files["library_organized__contes"])
    p.do_histoire_politique("library_organized__histoire_politique_et_geopolit",
                            files["library_organized__histoire_politique_et_geopolit"])
    p.do_romans("library_organized__romans_poesie_et_theatre",
                files["library_organized__romans_poesie_et_theatre"])
    p.do_philosophie("library_organized__philosophie",
                     files["library_organized__philosophie"])

    with (OUT / "records.jsonl").open("w", encoding="utf-8") as f:
        for r in p.records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with (OUT / "junk.jsonl").open("w", encoding="utf-8") as f:
        for j in p.junk:
            f.write(json.dumps(j, ensure_ascii=False) + "\n")

    kinds = {}
    for r in p.records:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print(f"records: {len(p.records)}  junk: {len(p.junk)}")
    print("kinds:", json.dumps(kinds, ensure_ascii=False))
    print("uncertain:", sum(1 for r in p.records if r["uncertain"]))
    print("authorOnly:", sum(1 for r in p.records if r["authorOnly"]))
    print("known authors:", len(p.known_authors))


if __name__ == "__main__":
    main()
