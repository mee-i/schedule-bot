import type { Database } from "bun:sqlite";
import type { Task, TaskStatus, TaskWithCourse } from "@/db/types.ts";

export interface CreateTaskInput {
  chat_jid: string;
  course_id?: number | null;
  title: string;
  description?: string | null;
  due_at: number;
  created_by: string;
  now_ms?: number;
}

export interface UpdateTaskInput {
  course_id?: number | null;
  title?: string;
  description?: string | null;
  due_at?: number;
  status?: TaskStatus;
  now_ms?: number;
}

export class TaskRepository {
  constructor(private readonly db: Database) {}

  next_seq(chat_jid: string): number {
    const row = this.db
      .query<{ next: number }, [string]>(
        "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM tasks WHERE chat_jid = ?"
      )
      .get(chat_jid);
    return row?.next ?? 1;
  }

  create(input: CreateTaskInput): Task {
    const now = input.now_ms ?? Date.now();

    const insert_txn = this.db.transaction(() => {
      const seq = this.next_seq(input.chat_jid);
      this.db
        .query<
          void,
          [
            string,
            number,
            number | null,
            string,
            string | null,
            number,
            string,
            number,
            number,
          ]
        >(
          `INSERT INTO tasks (
            chat_jid, seq, course_id, title, description,
            due_at, status, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
        )
        .run(
          input.chat_jid,
          seq,
          input.course_id ?? null,
          input.title,
          input.description ?? null,
          input.due_at,
          input.created_by,
          now,
          now
        );

      return this.find_raw_by_seq(input.chat_jid, seq)!;
    });

    return insert_txn();
  }

  find_raw_by_seq(chat_jid: string, seq: number): Task | null {
    const row = this.db
      .query<Task, [string, number]>(
        "SELECT * FROM tasks WHERE chat_jid = ? AND seq = ?"
      )
      .get(chat_jid, seq);
    return row ?? null;
  }

  find_by_seq(chat_jid: string, seq: number): TaskWithCourse | null {
    const row = this.db
      .query<
        Task & { course_name: string | null; course_seq: number | null },
        [string, number]
      >(
        `SELECT t.*, c.name AS course_name, c.seq AS course_seq
         FROM tasks t
         LEFT JOIN courses c ON t.course_id = c.id
         WHERE t.chat_jid = ? AND t.seq = ?`
      )
      .get(chat_jid, seq);
    return row ?? null;
  }

  find_by_id(id: number): Task | null {
    const row = this.db
      .query<Task, [number]>("SELECT * FROM tasks WHERE id = ?")
      .get(id);
    return row ?? null;
  }

  list_by_chat(
    chat_jid: string,
    filter: "open" | "done" | "all" = "open"
  ): TaskWithCourse[] {
    if (filter === "all") {
      return this.db
        .query<
          Task & { course_name: string | null; course_seq: number | null },
          [string]
        >(
          `SELECT t.*, c.name AS course_name, c.seq AS course_seq
           FROM tasks t
           LEFT JOIN courses c ON t.course_id = c.id
           WHERE t.chat_jid = ?
           ORDER BY t.due_at ASC`
        )
        .all(chat_jid);
    }

    return this.db
      .query<
        Task & { course_name: string | null; course_seq: number | null },
        [string, string]
      >(
        `SELECT t.*, c.name AS course_name, c.seq AS course_seq
         FROM tasks t
         LEFT JOIN courses c ON t.course_id = c.id
         WHERE t.chat_jid = ? AND t.status = ?
         ORDER BY t.due_at ASC`
      )
      .all(chat_jid, filter);
  }

  update(
    chat_jid: string,
    seq: number,
    input: UpdateTaskInput
  ): Task | null {
    const existing = this.find_raw_by_seq(chat_jid, seq);
    if (!existing) {
      return null;
    }

    const now = input.now_ms ?? Date.now();
    this.db
      .query<
        void,
        [
          number | null,
          string,
          string | null,
          number,
          string,
          number,
          string,
          number,
        ]
      >(
        `UPDATE tasks
         SET course_id = ?,
             title = ?,
             description = ?,
             due_at = ?,
             status = ?,
             updated_at = ?
         WHERE chat_jid = ? AND seq = ?`
      )
      .run(
        input.course_id !== undefined ? input.course_id : existing.course_id,
        input.title ?? existing.title,
        input.description !== undefined
          ? input.description
          : existing.description,
        input.due_at ?? existing.due_at,
        input.status ?? existing.status,
        now,
        chat_jid,
        seq
      );

    return this.find_raw_by_seq(chat_jid, seq);
  }

  mark_status(
    chat_jid: string,
    seq: number,
    status: TaskStatus,
    user_jid: string,
    now_ms: number
  ): Task | null {
    const existing = this.find_raw_by_seq(chat_jid, seq);
    if (!existing) {
      return null;
    }

    const done_by = status === "done" ? user_jid : null;
    const done_at = status === "done" ? now_ms : null;

    this.db
      .query<void, [string, string | null, number | null, number, string, number]>(
        `UPDATE tasks
         SET status = ?,
             done_by = ?,
             done_at = ?,
             updated_at = ?
         WHERE chat_jid = ? AND seq = ?`
      )
      .run(status, done_by, done_at, now_ms, chat_jid, seq);

    return this.find_raw_by_seq(chat_jid, seq);
  }

  delete(chat_jid: string, seq: number): Task | null {
    const existing = this.find_raw_by_seq(chat_jid, seq);
    if (!existing) {
      return null;
    }

    this.db
      .query<void, [string, number]>(
        "DELETE FROM tasks WHERE chat_jid = ? AND seq = ?"
      )
      .run(chat_jid, seq);

    return existing;
  }

  find_open_occurrences(
    chat_jid: string,
    from_ms: number,
    to_ms: number
  ): TaskWithCourse[] {
    return this.db
      .query<
        Task & { course_name: string | null; course_seq: number | null },
        [string, number, number]
      >(
        `SELECT t.*, c.name AS course_name, c.seq AS course_seq
         FROM tasks t
         LEFT JOIN courses c ON t.course_id = c.id
         WHERE t.chat_jid = ? AND t.status = 'open' AND t.due_at >= ? AND t.due_at <= ?
         ORDER BY t.due_at ASC`
      )
      .all(chat_jid, from_ms, to_ms);
  }
}
