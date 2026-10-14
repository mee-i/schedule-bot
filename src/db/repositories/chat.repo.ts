import type { Database } from "bun:sqlite";
import type { ChatSettings, MentionMode } from "@/db/types.ts";

const CHAT_SETTINGS_COLUMNS = `
  chat_jid, chat_type, chat_name, notify_enabled, admin_only,
  mention_mode, timezone, reminder_offsets, notify_course,
  notify_task, notify_event, course_offsets, task_offsets,
  event_offsets, digest_time, set_by, created_at, updated_at
`;

export class ChatRepository {
  constructor(private readonly db: Database) {}

  find_by_jid(chat_jid: string): ChatSettings | null {
    const row = this.db
      .query<ChatSettings, [string]>(
        `SELECT ${CHAT_SETTINGS_COLUMNS} FROM chat_settings WHERE chat_jid = ?`
      )
      .get(chat_jid);
    return row ?? null;
  }

  upsert(input: {
    chat_jid: string;
    chat_type: "group" | "private";
    chat_name?: string | null;
    notify_enabled?: number;
    admin_only?: number;
    mention_mode?: MentionMode;
    timezone?: string;
    reminder_offsets?: string;
    notify_course?: number;
    notify_task?: number;
    notify_event?: number;
    course_offsets?: string;
    task_offsets?: string;
    event_offsets?: string;
    digest_time?: string | null;
    set_by?: string | null;
    now_ms?: number;
  }): ChatSettings {
    const now = input.now_ms ?? Date.now();
    const existing = this.find_by_jid(input.chat_jid);

    if (existing) {
      this.db
        .query<
          void,
          [
            string | null,
            number,
            number,
            string,
            string,
            string,
            number,
            number,
            number,
            string,
            string,
            string,
            string | null,
            string | null,
            number,
            string,
          ]
        >(
          `UPDATE chat_settings
           SET chat_name = COALESCE(?, chat_name),
               notify_enabled = ?,
               admin_only = ?,
               mention_mode = ?,
               timezone = ?,
               reminder_offsets = ?,
               notify_course = ?,
               notify_task = ?,
               notify_event = ?,
               course_offsets = ?,
               task_offsets = ?,
               event_offsets = ?,
               digest_time = ?,
               set_by = COALESCE(?, set_by),
               updated_at = ?
           WHERE chat_jid = ?`
        )
        .run(
          input.chat_name ?? existing.chat_name,
          input.notify_enabled ?? existing.notify_enabled,
          input.admin_only ?? existing.admin_only,
          input.mention_mode ?? existing.mention_mode,
          input.timezone ?? existing.timezone,
          input.reminder_offsets ?? existing.reminder_offsets,
          input.notify_course ?? existing.notify_course ?? 1,
          input.notify_task ?? existing.notify_task ?? 1,
          input.notify_event ?? existing.notify_event ?? 1,
          input.course_offsets ?? existing.course_offsets ?? "[60,30,0]",
          input.task_offsets ?? existing.task_offsets ?? "[1440,360,180,30]",
          input.event_offsets ?? existing.event_offsets ?? "[1440,180,30]",
          input.digest_time !== undefined
            ? input.digest_time
            : existing.digest_time,
          input.set_by ?? existing.set_by,
          now,
          input.chat_jid
        );
      return this.find_by_jid(input.chat_jid)!;
    }

    const course_offsets_val =
      input.course_offsets ??
      (input.reminder_offsets ? input.reminder_offsets : "[60,30,0]");
    const task_offsets_val =
      input.task_offsets ??
      (input.reminder_offsets ? input.reminder_offsets : "[1440,360,180,30]");
    const event_offsets_val =
      input.event_offsets ??
      (input.reminder_offsets ? input.reminder_offsets : "[1440,180,30]");

    this.db
      .query<
        void,
        [
          string,
          string,
          string | null,
          number,
          number,
          string,
          string,
          string,
          number,
          number,
          number,
          string,
          string,
          string,
          string | null,
          string | null,
          number,
          number,
        ]
      >(
        `INSERT INTO chat_settings (
          chat_jid, chat_type, chat_name, notify_enabled, admin_only,
          mention_mode, timezone, reminder_offsets, notify_course,
          notify_task, notify_event, course_offsets, task_offsets,
          event_offsets, digest_time, set_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.chat_jid,
        input.chat_type,
        input.chat_name ?? null,
        input.notify_enabled ?? 0,
        input.admin_only ?? 0,
        input.mention_mode ?? "hidden",
        input.timezone ?? "Asia/Jakarta",
        input.reminder_offsets ?? "[1440,180,30]",
        input.notify_course ?? 1,
        input.notify_task ?? 1,
        input.notify_event ?? 1,
        course_offsets_val,
        task_offsets_val,
        event_offsets_val,
        input.digest_time ?? null,
        input.set_by ?? null,
        now,
        now
      );

    return this.find_by_jid(input.chat_jid)!;
  }

  update(
    chat_jid: string,
    fields: Partial<
      Omit<ChatSettings, "chat_jid" | "chat_type" | "created_at">
    > & { now_ms?: number }
  ): ChatSettings | null {
    const existing = this.find_by_jid(chat_jid);
    if (!existing) {
      return null;
    }

    const now = fields.now_ms ?? Date.now();
    this.db
      .query<
        void,
        [
          string | null,
          number,
          number,
          string,
          string,
          string,
          number,
          number,
          number,
          string,
          string,
          string,
          string | null,
          string | null,
          number,
          string,
        ]
      >(
        `UPDATE chat_settings
         SET chat_name = ?,
             notify_enabled = ?,
             admin_only = ?,
             mention_mode = ?,
             timezone = ?,
             reminder_offsets = ?,
             notify_course = ?,
             notify_task = ?,
             notify_event = ?,
             course_offsets = ?,
             task_offsets = ?,
             event_offsets = ?,
             digest_time = ?,
             set_by = ?,
             updated_at = ?
         WHERE chat_jid = ?`
      )
      .run(
        fields.chat_name !== undefined ? fields.chat_name : existing.chat_name,
        fields.notify_enabled !== undefined
          ? fields.notify_enabled
          : existing.notify_enabled,
        fields.admin_only !== undefined
          ? fields.admin_only
          : existing.admin_only,
        fields.mention_mode !== undefined
          ? fields.mention_mode
          : existing.mention_mode,
        fields.timezone !== undefined ? fields.timezone : existing.timezone,
        fields.reminder_offsets !== undefined
          ? fields.reminder_offsets
          : existing.reminder_offsets,
        fields.notify_course !== undefined
          ? fields.notify_course
          : (existing.notify_course ?? 1),
        fields.notify_task !== undefined
          ? fields.notify_task
          : (existing.notify_task ?? 1),
        fields.notify_event !== undefined
          ? fields.notify_event
          : (existing.notify_event ?? 1),
        fields.course_offsets !== undefined
          ? fields.course_offsets
          : (existing.course_offsets ?? "[60,30,0]"),
        fields.task_offsets !== undefined
          ? fields.task_offsets
          : (existing.task_offsets ?? "[1440,360,180,30]"),
        fields.event_offsets !== undefined
          ? fields.event_offsets
          : (existing.event_offsets ?? "[1440,180,30]"),
        fields.digest_time !== undefined
          ? fields.digest_time
          : existing.digest_time,
        fields.set_by !== undefined ? fields.set_by : existing.set_by,
        now,
        chat_jid
      );

    return this.find_by_jid(chat_jid);
  }

  list_active_notifications(): ChatSettings[] {
    return this.db
      .query<ChatSettings, []>(
        `SELECT ${CHAT_SETTINGS_COLUMNS} FROM chat_settings WHERE notify_enabled = 1`
      )
      .all();
  }
}
