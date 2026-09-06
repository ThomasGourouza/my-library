"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import type { ListWithItems } from "@/lib/lists";
import { formatYear } from "@/lib/normalize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PriorityBadge } from "@/components/books/priority-badge";
import { ReadCheckbox } from "@/components/books/read-checkbox";
import { RoadmapProgress } from "@/components/roadmaps/roadmap-progress";
import type { Priority } from "@/lib/priorities/types";

export type ListItemPriority = Record<number, Priority | null>;

export function ListDetail({
  list,
  priorities,
}: {
  list: ListWithItems;
  /** Priorité par identifiant de livre, résolue côté serveur. */
  priorities: ListItemPriority;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(list.name);
  const [description, setDescription] = React.useState(list.description ?? "");

  const readCount = list.items.filter((i) => i.book.read).length;

  async function mutateItem(bookId: number, move?: "up" | "down") {
    setPending(true);
    try {
      const res = await fetch(`/api/lists/${list.id}/items`, {
        method: move ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, move }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Opération impossible");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Impossible de contacter le serveur");
    } finally {
      setPending(false);
    }
  }

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const res = await fetch(`/api/lists/${list.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Impossible d’enregistrer");
        return;
      }
      toast.success("Liste enregistrée");
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("Impossible de contacter le serveur");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    try {
      const res = await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Impossible de supprimer la liste");
        return;
      }
      toast.success("Liste supprimée");
      router.push("/listes");
      router.refresh();
    } catch {
      toast.error("Impossible de contacter le serveur");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/listes"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Mes listes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{list.name}</h1>
          {list.description && (
            <p className="max-w-3xl text-sm text-muted-foreground">
              {list.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
            Modifier
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="size-4" aria-hidden />
                Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Supprimer la liste « {list.name} » ?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Les {list.items.length} livre(s) qu’elle contient ne sont pas
                  supprimés de la bibliothèque, seule la liste disparaît. Cette
                  action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  disabled={pending}
                  onClick={() => void remove()}
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {list.items.length > 0 && (
        <div className="max-w-md">
          <RoadmapProgress read={readCount} total={list.items.length} />
        </div>
      )}

      {list.items.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          Cette liste est vide. Ouvrez la fiche d’un livre et utilisez
          « Ajouter à une liste ».
        </p>
      ) : (
        <ol className="divide-y rounded-md border">
          {list.items.map(({ position, book, note }, index) => {
            const year = formatYear(book.publicationYear);
            return (
              <li key={book.id} className="flex items-start gap-3 px-3 py-3">
                <span
                  className="mt-0.5 w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground"
                  aria-hidden
                >
                  {position}.
                </span>
                <span className="mt-0.5 shrink-0">
                  <ReadCheckbox
                    bookId={book.id}
                    read={book.read}
                    title={book.title}
                  />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/livres/${book.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {book.title}
                    </Link>
                    <span className="text-sm text-muted-foreground">·</span>
                    <Link
                      href={`/auteurs/${book.author.id}`}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {book.author.name}
                    </Link>
                    {year && (
                      <span className="text-xs text-muted-foreground">
                        ({year})
                      </span>
                    )}
                    <PriorityBadge priority={priorities[book.id] ?? null} />
                  </div>
                  {note && (
                    <p className="text-sm text-muted-foreground">{note}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Badge variant="secondary">{book.category}</Badge>
                    {book.genre && <Badge variant="outline">{book.genre}</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending || index === 0}
                    aria-label={`Monter « ${book.title} »`}
                    onClick={() => void mutateItem(book.id, "up")}
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending || index === list.items.length - 1}
                    aria-label={`Descendre « ${book.title} »`}
                    onClick={() => void mutateItem(book.id, "down")}
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    aria-label={`Retirer « ${book.title} » de la liste`}
                    onClick={() => void mutateItem(book.id)}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <form onSubmit={saveDetails} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Modifier la liste</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="edit-list-name">Nom</Label>
              <Input
                id="edit-list-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-list-description">Description</Label>
              <Textarea
                id="edit-list-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={pending || name.trim() === ""}>
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
