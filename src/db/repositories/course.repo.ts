import type { Database } from "bun:sqlite";
import type { Course } from "@/db/types.ts";

export interface CreateCourseInput {
  chat_jid: string;
  name: string;
  day_of_week: number; // 1 = Monday .. 7 = Sunday
  start_time: string; // HH:mm
  end_time?: string | null;
  room?: string | null;
  lecturer?: string | null;
  active?: number;
  created_by: string;
  now_ms?: number;
}

export interface UpdateCourseInput {
  name?: string;
  day_of_week?: number;
  start_time?: string;
  end_time?: string | null;
  room?: string | null;
  lecturer?: string | null;
  active?: number;
  now_ms?: number;
}

export class CourseRepository {
  constructor(private readonly db: Database) {}

  next_seq(chat_jid: string): number {
    const row = this.db
      .query<{ next: number }, [string]>(
        "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM courses WHERE chat_jid = ?"
      )
      .get(chat_jid);
    return row?.next ?? 1;
  }

  create(input: CreateCourseInput): Course {
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
            number,
            string,
            string | null,
            string | null,
            string | null,
            number,
            string,
            number,
            number,
          ]
        >(
          `INSERT INTO courses (
            chat_jid, seq, name, day_of_week, start_time,
            end_time, room, lecturer, active, created_by,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.chat_jid,
          seq,
          input.name,
          input.day_of_week,
          input.start_time,
          input.end_time ?? null,
          input.room ?? null,
          input.lecturer ?? null,
          input.active ?? 1,
          input.created_by,
          now,
          now
        );

      return this.find_by_seq(input.chat_jid, seq)!;
    });

    return insert_txn();
  }

  find_by_seq(chat_jid: string, seq: number): Course | null {
    const row = this.db
      .query<Course, [string, number]>(
        "SELECT * FROM courses WHERE chat_jid = ? AND seq = ?"
      )
      .get(chat_jid, seq);
    return row ?? null;
  }

  find_by_id(id: number): Course | null {
    const row = this.db
      .query<Course, [number]>("SELECT * FROM courses WHERE id = ?")
      .get(id);
    return row ?? null;
  }

  list_by_chat(chat_jid: string): Course[] {
    return this.db
      .query<Course, [string]>(
        `SELECT * FROM courses
         WHERE chat_jid = ?
         ORDER BY day_of_week ASC, start_time ASC`
      )
      .all(chat_jid);
  }

  list_active_by_chat(chat_jid: string): Course[] {
    return this.db
      .query<Course, [string]>(
        `SELECT * FROM courses
         WHERE chat_jid = ? AND active = 1
         ORDER BY day_of_week ASC, start_time ASC`
      )
      .all(chat_jid);
  }

  update(
    chat_jid: string,
    seq: number,
    input: UpdateCourseInput
  ): Course | null {
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
          number,
          string,
          string | null,
          string | null,
          string | null,
          number,
          number,
          string,
          number,
        ]
      >(
        `UPDATE courses
         SET name = ?,
             day_of_week = ?,
             start_time = ?,
             end_time = ?,
             room = ?,
             lecturer = ?,
             active = ?,
             updated_at = ?
         WHERE chat_jid = ? AND seq = ?`
      )
      .run(
        input.name ?? existing.name,
        input.day_of_week ?? existing.day_of_week,
        input.start_time ?? existing.start_time,
        input.end_time !== undefined ? input.end_time : existing.end_time,
        input.room !== undefined ? input.room : existing.room,
        input.lecturer !== undefined ? input.lecturer : existing.lecturer,
        input.active !== undefined ? input.active : existing.active,
        now,
        chat_jid,
        seq
      );

    return this.find_by_seq(chat_jid, seq);
  }

  delete(chat_jid: string, seq: number): Course | null {
    const existing = this.find_by_seq(chat_jid, seq);
    if (!existing) {
      return null;
    }

    this.db
      .query<void, [string, number]>(
        "DELETE FROM courses WHERE chat_jid = ? AND seq = ?"
      )
      .run(chat_jid, seq);

    return existing;
  }
}
