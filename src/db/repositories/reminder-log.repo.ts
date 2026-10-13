import type { Database } from "bun:sqlite";
import type {
  ReminderLog,
  ReminderLogStatus,
  SourceType,
} from "@/db/types.ts";

export interface CreateReminderLogInput {
  chat_jid: string;
  source_type: SourceType;
  source_id: number;
  occurrence_at: number;
  offset_minutes: number;
  status: ReminderLogStatus;
  error?: string | null;
  sent_at?: number;
}

export class ReminderLogRepository {
  constructor(private readonly db: Database) {}

  is_already_logged(
    source_type: SourceType,
    source_id: number,
    occurrence_at: number,
    offset_minutes: number
  ): boolean {
    const row = this.db
      .query<
        { count: number },
        [string, number, number, number]
      >(
        `SELECT COUNT(*) AS count
         FROM reminder_log
         WHERE source_type = ?
           AND source_id = ?
           AND occurrence_at = ?
           AND offset_minutes = ?`
      )
      .get(source_type, source_id, occurrence_at, offset_minutes);

    return (row?.count ?? 0) > 0;
  }

  record(input: CreateReminderLogInput): ReminderLog {
    const sent_at = input.sent_at ?? Date.now();

    this.db
      .query<
        void,
        [
          string,
          string,
          number,
          number,
          number,
          string,
          string | null,
          number,
        ]
      >(
        `INSERT INTO reminder_log (
          chat_jid, source_type, source_id, occurrence_at,
          offset_minutes, status, error, sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.chat_jid,
        input.source_type,
        input.source_id,
        input.occurrence_at,
        input.offset_minutes,
        input.status,
        input.error ?? null,
        sent_at
      );

    const row = this.db
      .query<ReminderLog, [string, number, number, number]>(
        `SELECT * FROM reminder_log
         WHERE source_type = ?
           AND source_id = ?
           AND occurrence_at = ?
           AND offset_minutes = ?`
      )
      .get(
        input.source_type,
        input.source_id,
        input.occurrence_at,
        input.offset_minutes
      );

    return row!;
  }

  delete_by_source(source_type: SourceType, source_id: number): number {
    const result = this.db
      .query<void, [string, number]>(
        "DELETE FROM reminder_log WHERE source_type = ? AND source_id = ?"
      )
      .run(source_type, source_id);

    return result.changes;
  }
}
