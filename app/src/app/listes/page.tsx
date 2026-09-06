import { listLists } from "@/lib/lists";
import { ListsView } from "@/components/lists/lists-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mes listes" };

export default function ListesPage() {
  return <ListsView lists={listLists()} />;
}
