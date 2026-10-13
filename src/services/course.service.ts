import type { CourseRepository } from "@/db/repositories/course.repo.ts";
import type { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import type { Course } from "@/db/types.ts";
import type { Clock } from "@/lib/clock.ts";
import { UserError } from "@/lib/errors.ts";
import type { ChatService } from "@/services/chat.service.ts";

export class CourseService {
  constructor(
    private readonly course_repo: CourseRepository,
    private readonly reminder_repo: ReminderLogRepository,
    private readonly chat_service: ChatService,
    private readonly clock: Clock
  ) {}

  create(params: {
    chat_jid: string;
    chat_type: "group" | "private";
    name: string;
    day_of_week: number;
    start_time: string;
    end_time?: string | null;
    room?: string | null;
    lecturer?: string | null;
    created_by: string;
  }): Course {
    this.chat_service.get_or_create(params.chat_jid, params.chat_type);

    return this.course_repo.create({
      chat_jid: params.chat_jid,
      name: params.name,
      day_of_week: params.day_of_week,
      start_time: params.start_time,
      end_time: params.end_time,
      room: params.room,
      lecturer: params.lecturer,
      created_by: params.created_by,
      now_ms: this.clock.now(),
    });
  }

  get_by_seq(chat_jid: string, seq: number): Course {
    const course = this.course_repo.find_by_seq(chat_jid, seq);
    if (!course) {
      throw new UserError(`Mata kuliah #${seq} tidak ditemukan.`);
    }
    return course;
  }

  list(chat_jid: string): Course[] {
    return this.course_repo.list_by_chat(chat_jid);
  }

  list_active(chat_jid: string): Course[] {
    return this.course_repo.list_active_by_chat(chat_jid);
  }

  update(params: {
    chat_jid: string;
    seq: number;
    name?: string;
    day_of_week?: number;
    start_time?: string;
    end_time?: string | null;
    room?: string | null;
    lecturer?: string | null;
    active?: number;
  }): Course {
    const existing = this.get_by_seq(params.chat_jid, params.seq);

    const updated = this.course_repo.update(params.chat_jid, params.seq, {
      name: params.name,
      day_of_week: params.day_of_week,
      start_time: params.start_time,
      end_time: params.end_time,
      room: params.room,
      lecturer: params.lecturer,
      active: params.active,
      now_ms: this.clock.now(),
    });

    if (!updated) {
      throw new UserError(`Mata kuliah #${params.seq} tidak ditemukan.`);
    }

    if (
      params.day_of_week !== undefined ||
      params.start_time !== undefined ||
      params.active === 0
    ) {
      this.reminder_repo.delete_by_source("course", existing.id);
    }

    return updated;
  }

  delete(chat_jid: string, seq: number): Course {
    const existing = this.get_by_seq(chat_jid, seq);
    const deleted = this.course_repo.delete(chat_jid, seq);
    if (!deleted) {
      throw new UserError(`Mata kuliah #${seq} tidak ditemukan.`);
    }

    this.reminder_repo.delete_by_source("course", existing.id);
    return deleted;
  }
}
