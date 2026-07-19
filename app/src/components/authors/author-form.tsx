"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { Author } from "@/db/schema";
import { CATEGORIES, PERIODS } from "@/lib/validation";
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

// ---------------------------------------------------------------------------
// Schéma du formulaire (aligné sur authorInputSchema de lib/validation.ts,
// mais côté "brut" : les champs viennent d'inputs HTML sous forme de chaînes
// et sont transformés vers les types attendus par l'API).
// ---------------------------------------------------------------------------

const NONE_VALUE = "__none__";

const yearField = z
  .string()
  .trim()
  .refine(
    (v) =>
      v === "" ||
      (/^-?\d+$/.test(v) && Number(v) >= -3000 && Number(v) <= 2100),
    { message: "Année invalide (-3000 à 2100)" }
  )
  .transform((v) => (v === "" ? null : Number(v)));

function nullableText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .transform((v) => (v === "" ? null : v));
}

const authorFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom est requis")
    .max(200, "200 caractères maximum"),
  birthYear: yearField,
  deathYear: yearField,
  nationality: nullableText(100),
  language: nullableText(100),
  mainGenre: nullableText(100),
  mainField: z
    .string()
    .transform((v) => (v === NONE_VALUE || v === "" ? null : v)),
  period: z
    .string()
    .refine(
      (v) => v === NONE_VALUE || (PERIODS as readonly string[]).includes(v),
      { message: "Période invalide" }
    )
    .transform((v) => (v === NONE_VALUE ? null : v)),
  notes: nullableText(4000),
});

type AuthorFormInput = z.input<typeof authorFormSchema>;
type AuthorFormOutput = z.output<typeof authorFormSchema>;

function toDefaultValues(author?: Author): AuthorFormInput {
  return {
    name: author?.name ?? "",
    birthYear: author?.birthYear != null ? String(author.birthYear) : "",
    deathYear: author?.deathYear != null ? String(author.deathYear) : "",
    nationality: author?.nationality ?? "",
    language: author?.language ?? "",
    mainGenre: author?.mainGenre ?? "",
    mainField: author?.mainField ?? NONE_VALUE,
    period: author?.period ?? NONE_VALUE,
    notes: author?.notes ?? "",
  };
}

export function AuthorForm({ author }: { author?: Author }) {
  const router = useRouter();
  const isEdit = author != null;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthorFormInput, unknown, AuthorFormOutput>({
    resolver: zodResolver(authorFormSchema),
    defaultValues: toDefaultValues(author),
  });

  const onSubmit: SubmitHandler<AuthorFormOutput> = async (values) => {
    try {
      const res = await fetch(
        isEdit ? `/api/authors/${author.id}` : "/api/authors",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }
      );

      if (res.status === 409) {
        toast.error("Cet auteur existe déjà");
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          details?: string[];
        } | null;
        if (res.status === 400 && Array.isArray(body?.details)) {
          body.details.forEach((detail) => toast.error(detail));
        } else {
          toast.error(body?.error ?? "Une erreur est survenue");
        }
        return;
      }

      const body = (await res.json()) as { author: Author };
      toast.success(isEdit ? "Auteur modifié" : "Auteur créé");
      router.push(`/auteurs/${body.author.id}`);
      router.refresh();
    } catch {
      toast.error("Erreur réseau");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nom</Label>
        <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="birthYear">Année de naissance</Label>
          <Input
            id="birthYear"
            inputMode="numeric"
            placeholder="ex. -428"
            aria-invalid={!!errors.birthYear}
            {...register("birthYear")}
          />
          <p className="text-xs text-muted-foreground">négatif = av. J.-C.</p>
          {errors.birthYear && (
            <p className="text-xs text-destructive">
              {errors.birthYear.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deathYear">Année de décès</Label>
          <Input
            id="deathYear"
            inputMode="numeric"
            placeholder="ex. -348"
            aria-invalid={!!errors.deathYear}
            {...register("deathYear")}
          />
          <p className="text-xs text-muted-foreground">négatif = av. J.-C.</p>
          {errors.deathYear && (
            <p className="text-xs text-destructive">
              {errors.deathYear.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nationality">Nationalité</Label>
          <Input
            id="nationality"
            placeholder="ex. française"
            {...register("nationality")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="language">Langue</Label>
          <Input
            id="language"
            placeholder="ex. français"
            {...register("language")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mainGenre">Genre principal</Label>
          <Input id="mainGenre" {...register("mainGenre")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mainField">Domaine</Label>
          <Controller
            control={control}
            name="mainField"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="mainField" className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>—</SelectItem>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="period">Période</Label>
        <Controller
          control={control}
          name="period"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="period" className="w-full sm:w-64">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>—</SelectItem>
                {PERIODS.map((period) => (
                  <SelectItem key={period} value={period}>
                    {period}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={4} {...register("notes")} />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSubmitting}>
          Enregistrer
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
