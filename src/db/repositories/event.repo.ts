import type { Database } from "bun:sqlite";
import type { Event } from "@/db/types.ts";

export interface CreateEventInput {
  chat_jid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: number;
  end_at?: number | null;
  created_by: string;
  now_ms?: number;
}

export interface UpdateEventInput {
  title?: string;
  description?: string | null;
  location?: string | null;
  start_at?: number;
  end_at?: number | null;
  now_ms?: number;
}

export class EventRepository {
  constructor(private readonly db: Database) {}

  next_seq(chat_jid: string): number {
    const row = this.db
      .query<{ next: number }, [string]>(
        "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM events WHERE chat_jid = ?"
      )
      .get(chat_jid);
    return row?.next ?? 1;
  }

  create(input: CreateEventInput): Event {
    const now = input.now_ms ?? Date.now();

    const insert_txn = this.db.transaction(() => {
      const seq = this.next_seq(input.chat_jid);
      this.db
        .query<
          void,
          [
            string,
            number,
            string,
            string | null,
            string | null,
            number,
            number | null,
            string,
            number,
            number,
          ]
        >(
          `INSERT INTO events (
            chat_jid, seq, title, description, location,
            start_at, end_at, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.chat_jid,
          seq,
          input.title,
          input.description ?? null,
          input.location ?? null,
          input.start_at,
          input.end_at ?? null,
          input.created_by,
          now,
          now
        );

      return this.find_by_seq(input.chat_jid, seq)!;
    });

    return insert_txn();
  }

  find_by_seq(chat_jid: string, seq: number): Event | null {
    const row = this.db
      .query<Event, [string, number]>(
        "SELECT * FROM events WHERE chat_jid = ? AND seq = ?"
      )
      .get(chat_jid, seq);
    return row ?? null;
  }

  find_by_id(id: number): Event | null {
    const row = this.db
      .query<Event, [number]>("SELECT * FROM events WHERE id = ?")
      .get(id);
    return row ?? null;
  }

  list_by_chat(
    chat_jid: string,
    include_past: boolean,
    now_ms: number
  ): Event[] {
    if (include_past) {
      return this.db
        .query<Event, [string]>(
          "SELECT * FROM events WHERE chat_jid = ? ORDER BY start_at ASC"
        )
        .all(chat_jid);
    }

    return this.db
      .query<Event, [string, number]>(
        "SELECT * FROM events WHERE chat_jid = ? AND start_at >= ? ORDER BY start_at ASC"
      )
      .all(chat_jid, now_ms);
  }

  update(
    chat_jid: string,
    seq: number,
    input: UpdateEventInput
  ): Event | null {
    const existing = this.find_by_seq(chat_jid, seq);
    if (!existing) {
      return null;
    }

    const now = input.now_ms ?? Date.now();
    this.db
      .query<
        void,
        [
          string,
          string | null,
          string | null,
          number,
          number | null,
          number,
          string,
          number,
        ]
      >(
        `UPDATE events
         SET title = ?,
             description = ?,
             location = ?,
             start_at = ?,
             end_at = ?,
             updated_at = ?
         WHERE chat_jid = ? AND seq = ?`
      )
      .run(
        input.title ?? existing.title,
        input.description !== undefined
          ? input.description
          : existing.description,
        input.location !== undefined ? input.location : existing.location,
        input.start_at ?? existing.start_at,
        input.end_at !== undefined ? input.end_at : existing.end_at,
        now,
        chat_jid,
        seq
      );

    return this.find_by_seq(chat_jid, seq);
  }

  delete(chat_jid: string, seq: number): Event | null {
    const existing = this.find_by_seq(chat_jid, seq);
    if (!existing) {
      return null;
    }

    this.db
      .query<void, [string, number]>(
        "DELETE FROM events WHERE chat_jid = ? AND seq = ?"
      )
      .run(chat_jid, seq);

    return existing;
  }

  find_upcoming_occurrences(
    chat_jid: string,
    from_ms: number,
    to_ms: number
  ): Event[] {
    return this.db
      .query<Event, [string, number, number]>(
        `SELECT * FROM events
         WHERE chat_jid = ? AND start_at >= ? AND start_at <= ?
         ORDER BY start_at ASC`
      )
      .all(chat_jid, from_ms, to_ms);
  }
}
