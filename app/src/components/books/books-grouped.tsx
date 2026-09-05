"use client";

import * as React from "react";
import Link from "next/link";
import type { BookWithAuthor } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GROUP_OPTIONS,
  groupBooks,
  type GroupByKey,
} from "./books-helpers";

const DEFAULT_OPEN_COUNT = 3;

export function BooksGrouped({
  books,
  groupBy,
  onGroupByChange,
}: {
  books: BookWithAuthor[];
  groupBy: GroupByKey;
  onGroupByChange: (key: GroupByKey) => void;
}) {
  const groups = React.useMemo(() => groupBooks(books, groupBy), [books, groupBy]);
  const defaultOpen = React.useMemo(
    () => groups.slice(0, DEFAULT_OPEN_COUNT).map((g) => g.key),
    [groups]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm text-muted-foreground">Grouper par</span>
        <Select
          value={groupBy}
          onValueChange={(v) => onGroupByChange(v as GroupByKey)}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-6 text-center text-sm text-muted-foreground">
          Aucun livre ne correspond aux critères.
        </div>
      ) : (
        <Accordion
          key={groupBy}
          type="multiple"
          defaultValue={defaultOpen}
          className="min-h-0 flex-1 overflow-y-auto rounded-md border px-3"
        >
          {groups.map((group) => (
            <AccordionItem key={group.key} value={group.key}>
              <AccordionTrigger>
                {group.label}{" "}
                <span className="font-normal text-muted-foreground">
                  ({group.books.length})
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1">
                  {group.books.map((book) => (
                    <li
                      key={book.id}
                      className="flex flex-wrap items-center gap-2 border-b py-1.5 last:border-b-0"
                    >
                      <Link
                        href={`/livres/${book.id}`}
                        className="font-medium hover:underline"
                      >
                        {book.title}
                      </Link>
                      <span className="text-muted-foreground">·</span>
                      <Link
                        href={`/auteurs/${book.author.id}`}
                        className="text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {book.author.name}
                      </Link>
                      <Badge variant="outline">{book.category}</Badge>
                      {book.enriched && (
                        <Badge variant="secondary">Ajout Claude</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
