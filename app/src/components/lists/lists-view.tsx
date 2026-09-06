"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListPlus, Plus } from "lucide-react";
import type { ListSummary } from "@/lib/lists";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RoadmapProgress } from "@/components/roadmaps/roadmap-progress";

/**
 * Boîte de création d'une liste. Réutilisée depuis la page des listes et depuis
 * le sélecteur « Ajouter à une liste » d'une fiche livre.
 */
export function CreateListDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (list: { id: number; name: string }) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "" || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Impossible de créer la liste");
        return;
      }
      toast.success(`Liste « ${json.list.name} » créée`);
      setName("");
      setDescription("");
      onOpenChange(false);
      onCreated(json.list);
    } catch {
      toast.error("Impossible de contacter le serveur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nouvelle liste</DialogTitle>
            <DialogDescription>
              Une liste est à vous : vous en choisissez le contenu et l’ordre.
              Les parcours, eux, ne se modifient pas depuis l’application.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="list-name">Nom</Label>
            <Input
              id="list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="À lire cet été"
              maxLength={120}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-description">Description (facultatif)</Label>
            <Textarea
              id="list-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ce que cette liste rassemble, et pourquoi."
              maxLength={2000}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={saving || name.trim() === ""}>
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ListsView({ lists }: { lists: ListSummary[] }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mes listes</h1>
          <p className="text-sm text-muted-foreground">
            {lists.length} liste{lists.length > 1 ? "s" : ""} · vos sélections,
            dans l’ordre que vous voulez
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          Nouvelle liste
        </Button>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-md border p-8 text-center">
          <ListPlus
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden
          />
          <p className="mt-3 text-sm font-medium">Aucune liste pour l’instant</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Les 53 parcours de lecture sont du contenu rédigé, que
            l’application ne modifie pas. Une liste, au contraire, est à vous :
            créez-en une, puis ajoutez-y des livres depuis leur fiche.
          </p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Créer ma première liste
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <li key={list.id} className="h-full">
              <div className="relative flex h-full flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/40">
                <Link
                  href={`/listes/${list.id}`}
                  className="font-medium after:absolute after:inset-0 hover:underline"
                >
                  {list.name}
                </Link>
                {list.description && (
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {list.description}
                  </p>
                )}
                <div className="mt-auto pt-1">
                  {list.bookCount === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Liste vide — ajoutez un livre depuis sa fiche.
                    </p>
                  ) : (
                    <RoadmapProgress
                      read={list.readCount}
                      total={list.bookCount}
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateListDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(list) => router.push(`/listes/${list.id}`)}
      />
    </div>
  );
}
