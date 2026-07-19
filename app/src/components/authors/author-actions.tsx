"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
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

export function AuthorActions({
  authorId,
  authorName,
}: {
  authorId: number;
  authorName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function handleDelete() {
    setPending(true);
    try {
      const res = await fetch(`/api/authors/${authorId}`, {
        method: "DELETE",
      });

      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as {
          bookCount?: number;
        } | null;
        const count = body?.bookCount ?? 0;
        toast.error(
          `Impossible de supprimer : ${count} livre${
            count > 1 ? "s" : ""
          } rattaché${count > 1 ? "s" : ""} à cet auteur`
        );
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(body?.error ?? "Une erreur est survenue");
        return;
      }

      toast.success("Auteur supprimé");
      router.push("/auteurs");
      router.refresh();
    } catch {
      toast.error("Impossible de contacter le serveur");
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="size-4" aria-hidden />
          Supprimer
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cet auteur ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. « {authorName} » sera supprimé de la
            bibliothèque.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
