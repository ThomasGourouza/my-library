import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __libraryDb?: DB };

function createDb(): DB {
  const dbPath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "library.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db: DB = globalForDb.__libraryDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__libraryDb = db;

export * from "./schema";
