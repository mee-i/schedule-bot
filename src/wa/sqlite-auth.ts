import type { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger.ts";

export interface SQLiteAuthStateOptions {
  sessionId?: string;
  legacyAuthDir?: string;
}

export interface SQLiteAuthStateResult {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearState: () => Promise<void>;
}

/**
 * Custom SQLite authentication state for Baileys.
 * Menggantikan useMultiFileAuthState dengan SQLite prepared statements dan atomic transactions.
 */
export async function useSQLiteAuthState(
  db: Database,
  options: SQLiteAuthStateOptions = {}
): Promise<SQLiteAuthStateResult> {
  const sessionId = options.sessionId ?? "baileys";
  const legacyAuthDir = options.legacyAuthDir;

  // Pastikan tabel whatsapp_auth ada (defensif untuk unit tests dan runtime)
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_auth (
      session    TEXT NOT NULL,
      id         TEXT NOT NULL,
      value      TEXT,
      PRIMARY KEY (session, id)
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_session ON whatsapp_auth(session);
  `);

  const read_stmt = db.query<{ value: string }, [string, string]>(
    "SELECT value FROM whatsapp_auth WHERE session = ? AND id = ?;"
  );
  const write_stmt = db.query<unknown, [string, string, string]>(
    "INSERT INTO whatsapp_auth (session, id, value) VALUES (?, ?, ?) ON CONFLICT (session, id) DO UPDATE SET value = excluded.value;"
  );
  const remove_stmt = db.query<unknown, [string, string]>(
    "DELETE FROM whatsapp_auth WHERE session = ? AND id = ?;"
  );
  const clear_stmt = db.query<unknown, [string]>(
    "DELETE FROM whatsapp_auth WHERE session = ?;"
  );
  const count_stmt = db.query<{ count: number }, [string]>(
    "SELECT COUNT(*) as count FROM whatsapp_auth WHERE session = ?;"
  );

  function write_data(id: string, value: unknown): void {
    const serialized = JSON.stringify(value, BufferJSON.replacer);
    write_stmt.run(sessionId, id, serialized);
  }

  function read_data<T = unknown>(id: string): T | null {
    const row = read_stmt.get(sessionId, id);
    if (!row || !row.value) {
      return null;
    }
    try {
      return JSON.parse(row.value, BufferJSON.reviver) as T;
    } catch (err) {
      logger.error({
        event: "sqlite_auth_parse_error",
        session: sessionId,
        id,
        error: String(err),
      });
      return null;
    }
  }

  function remove_data(id: string): void {
    remove_stmt.run(sessionId, id);
  }

  // Migrasi satu kali (one-time migration) dari folder data/auth jika tabel SQLite masih kosong
  const existing_count = count_stmt.get(sessionId)?.count ?? 0;
  if (existing_count === 0 && legacyAuthDir && fs.existsSync(legacyAuthDir)) {
    const creds_file = path.join(legacyAuthDir, "creds.json");
    if (fs.existsSync(creds_file)) {
      try {
        const files = fs
          .readdirSync(legacyAuthDir)
          .filter((f) => f.endsWith(".json"));
        let migrated_count = 0;

        db.transaction(() => {
          for (const file of files) {
            const file_path = path.join(legacyAuthDir, file);
            const raw = fs.readFileSync(file_path, "utf-8");
            const id = file === "creds.json" ? "creds" : file.slice(0, -5);
            write_stmt.run(sessionId, id, raw);
            migrated_count++;
          }
        })();

        logger.info({
          event: "migrated_auth_from_json_to_sqlite",
          session: sessionId,
          count: migrated_count,
          from_folder: legacyAuthDir,
        });
      } catch (err) {
        logger.error({
          event: "legacy_auth_migration_failed",
          session: sessionId,
          error: String(err),
        });
      }
    }
  }

  let creds: AuthenticationCreds | null =
    read_data<AuthenticationCreds>("creds");
  if (!creds) {
    creds = initAuthCreds();
    write_data("creds", creds);
  }

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[]
        ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            let value = read_data<SignalDataTypeMap[T]>(`${type}-${id}`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as proto.Message.IAppStateSyncKeyData
              ) as unknown as SignalDataTypeMap[T];
            }
            if (value !== null && value !== undefined) {
              data[id] = value;
            }
          }
          return data;
        },
        set: async (data: SignalDataSet): Promise<void> => {
          db.transaction(() => {
            for (const category in data) {
              const cat = category as keyof SignalDataTypeMap;
              const items = data[cat];
              if (!items) continue;

              for (const id in items) {
                const value = items[id];
                const key = `${category}-${id}`;
                if (value !== null && value !== undefined) {
                  write_data(key, value);
                } else {
                  remove_data(key);
                }
              }
            }
          })();
        },
        clear: async (): Promise<void> => {
          clear_stmt.run(sessionId);
        },
      },
    },
    saveCreds: async (): Promise<void> => {
      write_data("creds", creds);
    },
    clearState: async (): Promise<void> => {
      clear_stmt.run(sessionId);
    },
  };
}
