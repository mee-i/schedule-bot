import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "@/config/env.ts";

export function create_database(db_path: string = ":memory:"): Database {
  if (db_path !== ":memory:") {
    const dir = path.dirname(db_path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(db_path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return db;
}

let default_db_instance: Database | null = null;

export function get_database(): Database {
  if (!default_db_instance) {
    const db_file = path.join(env.DATA_DIR, "bot.sqlite");
    default_db_instance = create_database(db_file);
  }
  return default_db_instance;
}

export function close_database(): void {
  if (default_db_instance) {
    default_db_instance.close();
    default_db_instance = null;
  }
}
