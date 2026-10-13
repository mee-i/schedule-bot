import type { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@/lib/logger.ts";

export function run_migrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const migrations_dir = path.join(import.meta.dir, "migrations");
  if (!fs.existsSync(migrations_dir)) {
    logger.warn({ event: "migrations_dir_missing", dir: migrations_dir });
    return;
  }

  const files = fs
    .readdirSync(migrations_dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = path.basename(file, ".sql");
    const existing = db
      .query<{ version: string }, [string]>(
        "SELECT version FROM schema_migrations WHERE version = ?"
      )
      .get(version);

    if (existing) {
      continue;
    }

    const file_path = path.join(migrations_dir, file);
    const sql = fs.readFileSync(file_path, "utf-8");

    logger.info({ event: "applying_migration", version });

    db.transaction(() => {
      db.exec(sql);
      db.query(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)"
      ).run(version, Date.now());
    })();

    logger.info({ event: "migration_applied", version });
  }
}
