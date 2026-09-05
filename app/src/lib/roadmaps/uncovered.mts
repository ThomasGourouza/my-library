import { listBooks } from "@/lib/queries";
import { resolveLibrary } from "./resolve";

const books = listBooks();
const resolved = resolveLibrary(books);
const uncovered = books.filter((b) => !resolved.refsByBookId.has(b.id));
for (const b of uncovered) {
  console.log(
    [b.category, b.period ?? "?", b.genre ?? "?", b.originalLanguage ?? "?", b.audience, b.author.name, b.title].join(" | ")
  );
}
console.error(`${uncovered.length} / ${books.length}`);
