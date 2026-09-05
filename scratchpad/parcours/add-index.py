import sys, re, pathlib
slug, const = sys.argv[1], sys.argv[2]
p = pathlib.Path("/Users/tom/Documents/my-library/app/src/lib/roadmaps/index.ts")
s = p.read_text()
if f'"./data/{slug}"' in s:
    print("already present"); sys.exit(0)
imp = f'import {{ {const} }} from "./data/{slug}";\n'
s = s.replace("\nexport const ROADMAPS", imp + "\nexport const ROADMAPS", 1)
s = s.replace("\n];\n\nconst BY_SLUG", f"\n  {const},\n];\n\nconst BY_SLUG", 1)
p.write_text(s)
print("added", slug)
