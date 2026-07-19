"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import type { BookWithAuthor } from "@/db/schema";
import {
  AUDIENCES,
  CATEGORIES,
  PERIODS,
  WORLDVIEWS,
  WORLDVIEW_LABELS,
} from "@/lib/validation";
import { normalizeKey } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Schéma local (aligné sur bookInputSchema, adapté aux contrôles du formulaire)
// ---------------------------------------------------------------------------

const NONE = "__none__";

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));
}

const bookFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Le titre est requis")
      .max(300, "300 caractères maximum"),
    authorId: z.number().int().positive().nullable(),
    newAuthorName: z.string().trim().max(200).nullable(),
    category: z
      .string()
      .min(1, "La catégorie est requise")
      .refine((v) => (CATEGORIES as readonly string[]).includes(v), {
        message: "Catégorie invalide",
      }),
    genre: optionalText(100),
    courant: optionalText(150),
    theme: optionalText(150),
    originalLanguage: optionalText(100),
    period: z.string().transform((v) => (v === "" || v === NONE ? null : v)),
    publicationYear: z
      .preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        z.coerce
          .number({ error: "Année invalide" })
          .int("Année invalide")
          .min(-3000, "Année trop ancienne")
          .max(2100, "Année trop lointaine")
          .optional()
      )
      .transform((v) => v ?? null),
    audience: z
      .string()
      .min(1, "Le public est requis")
      .refine((v) => (AUDIENCES as readonly string[]).includes(v), {
        message: "Public invalide",
      }),
    worldview: z.string().transform((v) => (v === "" || v === NONE ? null : v)),
    notes: optionalText(4000),
  })
  .refine(
    (v) =>
      v.authorId != null ||
      (v.newAuthorName != null && v.newAuthorName.trim() !== ""),
    { message: "Un auteur est requis", path: ["authorId"] }
  );

type BookFormInput = z.input<typeof bookFormSchema>;
type BookFormOutput = z.output<typeof bookFormSchema>;

// ---------------------------------------------------------------------------
// Combobox auteur
// ---------------------------------------------------------------------------

type AuthorOption = { id: number; name: string };
type AuthorSelection = { id: number; name: string } | { newName: string } | null;

function AuthorCombobox({
  authors,
  selection,
  onChange,
  invalid,
}: {
  authors: AuthorOption[];
  selection: AuthorSelection;
  onChange: (selection: AuthorSelection) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const key = normalizeKey(query);
    if (!key) return authors;
    return authors.filter((a) => normalizeKey(a.name).includes(key));
  }, [authors, query]);

  const exactMatch = React.useMemo(() => {
    const key = normalizeKey(query);
    return key ? authors.some((a) => normalizeKey(a.name) === key) : true;
  }, [authors, query]);

  const label =
    selection == null
      ? "Sélectionner un auteur…"
      : "id" in selection
        ? selection.name
        : `Créer « ${selection.newName} »`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="w-full justify-between font-normal"
        >
          <span
            className={cn(
              "truncate",
              selection == null && "text-muted-foreground"
            )}
          >
            {label}
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Rechercher un auteur…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Aucun auteur trouvé.</CommandEmpty>
            <CommandGroup>
              {filtered.map((a) => {
                const isSelected =
                  selection != null && "id" in selection && selection.id === a.id;
                return (
                  <CommandItem
                    key={a.id}
                    value={`author-${a.id}`}
                    onSelect={() => {
                      onChange({ id: a.id, name: a.name });
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn(!isSelected && "opacity-0")}
                      aria-hidden
                    />
                    {a.name}
                  </CommandItem>
                );
              })}
              {query.trim() !== "" && !exactMatch && (
                <CommandItem
                  value={`new-author-${query}`}
                  onSelect={() => {
                    onChange({ newName: query.trim() });
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Plus aria-hidden />
                  Créer l&apos;auteur « {query.trim()} »
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Formulaire principal
// ---------------------------------------------------------------------------

export function BookForm({
  authors,
  book,
}: {
  authors: AuthorOption[];
  book?: BookWithAuthor;
}) {
  const router = useRouter();
  const isEdit = book != null;

  const form = useForm<BookFormInput, unknown, BookFormOutput>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: {
      title: book?.title ?? "",
      authorId: book?.authorId ?? null,
      newAuthorName: null,
      category: book?.category ?? "",
      genre: book?.genre ?? "",
      courant: book?.courant ?? "",
      theme: book?.theme ?? "",
      originalLanguage: book?.originalLanguage ?? "",
      period: book?.period ?? NONE,
      publicationYear:
        book?.publicationYear != null ? String(book.publicationYear) : "",
      audience: book?.audience ?? "adultes",
      worldview: book?.worldview ?? NONE,
      notes: book?.notes ?? "",
    },
  });

  const authorId = form.watch("authorId");
  const newAuthorName = form.watch("newAuthorName");

  const authorSelection: AuthorSelection = React.useMemo(() => {
    if (authorId != null) {
      const match = authors.find((a) => a.id === authorId);
      return { id: authorId, name: match?.name ?? book?.author.name ?? "" };
    }
    if (newAuthorName) return { newName: newAuthorName };
    return null;
  }, [authorId, newAuthorName, authors, book]);

  function handleAuthorChange(selection: AuthorSelection) {
    if (selection != null && "id" in selection) {
      form.setValue("authorId", selection.id, {
        shouldValidate: true,
        shouldDirty: true,
      });
      form.setValue("newAuthorName", null, { shouldDirty: true });
    } else if (selection != null && "newName" in selection) {
      form.setValue("authorId", null, { shouldDirty: true });
      form.setValue("newAuthorName", selection.newName, {
        shouldValidate: true,
        shouldDirty: true,
      });
    } else {
      form.setValue("authorId", null, { shouldValidate: true, shouldDirty: true });
      form.setValue("newAuthorName", null, { shouldDirty: true });
    }
  }

  async function onSubmit(data: BookFormOutput) {
    const payload = {
      title: data.title,
      category: data.category,
      genre: data.genre,
      courant: data.courant,
      theme: data.theme,
      originalLanguage: data.originalLanguage,
      period: data.period,
      publicationYear: data.publicationYear,
      audience: data.audience,
      worldview: data.worldview,
      notes: data.notes,
      ...(data.authorId != null
        ? { authorId: data.authorId }
        : { newAuthor: { name: data.newAuthorName as string } }),
    };

    const url = isEdit ? `/api/books/${book!.id}` : "/api/books";
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Une erreur est survenue");
        return;
      }
      toast.success(isEdit ? "Livre modifié" : "Livre créé");
      const bookId = json.book.id as number;
      router.push(`/livres/${bookId}`);
      router.refresh();
    } catch {
      toast.error("Impossible de contacter le serveur");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="title">Titre</Label>
        <Input id="title" {...form.register("title")} aria-invalid={!!form.formState.errors.title} />
        {form.formState.errors.title && (
          <p className="text-sm text-destructive">
            {form.formState.errors.title.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Auteur</Label>
        <AuthorCombobox
          authors={authors}
          selection={authorSelection}
          onChange={handleAuthorChange}
          invalid={!!form.formState.errors.authorId}
        />
        {form.formState.errors.authorId && (
          <p className="text-sm text-destructive">
            {form.formState.errors.authorId.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">Catégorie</Label>
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="category"
                  className="w-full"
                  aria-invalid={!!form.formState.errors.category}
                >
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.category && (
            <p className="text-sm text-destructive">
              {form.formState.errors.category.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audience">Public</Label>
          <Controller
            control={form.control}
            name="audience"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="audience" className="w-full">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {capitalize(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="genre">Genre</Label>
          <Input id="genre" {...form.register("genre")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="courant">Courant</Label>
          <Input id="courant" {...form.register("courant")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="theme">Thème</Label>
          <Input id="theme" {...form.register("theme")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="originalLanguage">Langue originale</Label>
          <Input id="originalLanguage" {...form.register("originalLanguage")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="period">Période</Label>
          <Controller
            control={form.control}
            name="period"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="period" className="w-full">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {PERIODS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="publicationYear">Année de publication</Label>
          <Input
            id="publicationYear"
            type="number"
            {...form.register("publicationYear")}
            aria-invalid={!!form.formState.errors.publicationYear}
          />
          <p className="text-xs text-muted-foreground">négatif = av. J.-C.</p>
          {form.formState.errors.publicationYear && (
            <p className="text-sm text-destructive">
              {form.formState.errors.publicationYear.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="worldview">Vision du monde</Label>
          <Controller
            control={form.control}
            name="worldview"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="worldview" className="w-full">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {WORLDVIEWS.map((w) => (
                    <SelectItem key={w} value={w}>
                      {WORLDVIEW_LABELS[w]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={4} {...form.register("notes")} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
