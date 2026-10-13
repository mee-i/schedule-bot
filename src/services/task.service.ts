import type { CourseRepository } from "@/db/repositories/course.repo.ts";
import type { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import type { TaskRepository } from "@/db/repositories/task.repo.ts";
import type { Task, TaskWithCourse } from "@/db/types.ts";
import type { Clock } from "@/lib/clock.ts";
import { UserError } from "@/lib/errors.ts";
import type { ChatService } from "@/services/chat.service.ts";

export class TaskService {
  constructor(
    private readonly task_repo: TaskRepository,
    private readonly course_repo: CourseRepository,
    private readonly reminder_repo: ReminderLogRepository,
    private readonly chat_service: ChatService,
    private readonly clock: Clock
  ) {}

  create(params: {
    chat_jid: string;
    chat_type: "group" | "private";
    title: string;
    due_at: number;
    course_seq?: number | null;
    description?: string | null;
    created_by: string;
  }): Task {
    const now = this.clock.now();
    if (params.due_at < now) {
      throw new UserError("Deadline tugas tidak boleh di masa lalu.");
    }

    this.chat_service.get_or_create(params.chat_jid, params.chat_type);

    let course_id: number | null = null;
    if (params.course_seq !== undefined && params.course_seq !== null) {
      const course = this.course_repo.find_by_seq(
        params.chat_jid,
        params.course_seq
      );
      if (!course) {
        throw new UserError(
          `Mata kuliah #${params.course_seq} tidak ditemukan.`
        );
      }
      course_id = course.id;
    }

    return this.task_repo.create({
      chat_jid: params.chat_jid,
      course_id,
      title: params.title,
      due_at: params.due_at,
      description: params.description,
      created_by: params.created_by,
      now_ms: now,
    });
  }

  get_by_seq(chat_jid: string, seq: number): TaskWithCourse {
    const task = this.task_repo.find_by_seq(chat_jid, seq);
    if (!task) {
      throw new UserError(`Tugas #${seq} tidak ditemukan.`);
    }
    return task;
  }

  list(
    chat_jid: string,
    filter: "open" | "done" | "all" = "open"
  ): TaskWithCourse[] {
    return this.task_repo.list_by_chat(chat_jid, filter);
  }

  update(params: {
    chat_jid: string;
    seq: number;
    title?: string;
    due_at?: number;
    course_seq?: number | null;
    description?: string | null;
  }): Task {
    const existing = this.get_by_seq(params.chat_jid, params.seq);
    const now = this.clock.now();

    if (params.due_at !== undefined && params.due_at < now) {
      throw new UserError("Deadline tugas tidak boleh di masa lalu.");
    }

    let course_id = existing.course_id;
    if (params.course_seq !== undefined) {
      if (params.course_seq === null) {
        course_id = null;
      } else {
        const course = this.course_repo.find_by_seq(
          params.chat_jid,
          params.course_seq
        );
        if (!course) {
          throw new UserError(
            `Mata kuliah #${params.course_seq} tidak ditemukan.`
          );
        }
        course_id = course.id;
      }
    }

    const updated = this.task_repo.update(params.chat_jid, params.seq, {
      course_id,
      title: params.title,
      due_at: params.due_at,
      description: params.description,
      now_ms: now,
    });

    if (!updated) {
      throw new UserError(`Tugas #${params.seq} tidak ditemukan.`);
    }

    if (params.due_at !== undefined && params.due_at !== existing.due_at) {
      this.reminder_repo.delete_by_source("task", existing.id);
    }

    return updated;
  }

  mark_status(
    chat_jid: string,
    seq: number,
    status: "open" | "done",
    user_jid: string
  ): Task {
    const existing = this.get_by_seq(chat_jid, seq);
    const now = this.clock.now();

    const updated = this.task_repo.mark_status(
      chat_jid,
      seq,
      status,
      user_jid,
      now
    );

    if (!updated) {
      throw new UserError(`Tugas #${seq} tidak ditemukan.`);
    }

    if (status === "done") {
      this.reminder_repo.delete_by_source("task", existing.id);
    }

    return updated;
  }

  delete(chat_jid: string, seq: number): Task {
    const existing = this.get_by_seq(chat_jid, seq);
    const deleted = this.task_repo.delete(chat_jid, seq);
    if (!deleted) {
      throw new UserError(`Tugas #${seq} tidak ditemukan.`);
    }

    this.reminder_repo.delete_by_source("task", existing.id);
    return deleted;
  }
}
