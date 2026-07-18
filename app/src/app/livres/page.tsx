import { listBooks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Livres" };

export default function LivresPage() {
  const books = listBooks();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Livres</h1>
      <p className="text-muted-foreground">
        {books.length} livre{books.length > 1 ? "s" : ""} — interface en cours de
        construction.
      </p>
    </div>
  );
}
