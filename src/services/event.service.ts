import type { EventRepository } from "@/db/repositories/event.repo.ts";
import type { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import type { Event } from "@/db/types.ts";
import type { Clock } from "@/lib/clock.ts";
import { UserError } from "@/lib/errors.ts";
import type { ChatService } from "@/services/chat.service.ts";

export class EventService {
  constructor(
    private readonly event_repo: EventRepository,
    private readonly reminder_repo: ReminderLogRepository,
    private readonly chat_service: ChatService,
    private readonly clock: Clock
  ) {}

  create(params: {
    chat_jid: string;
    chat_type: "group" | "private";
    title: string;
    start_at: number;
    end_at?: number | null;
    location?: string | null;
    description?: string | null;
    created_by: string;
  }): Event {
    const now = this.clock.now();
    if (params.start_at < now) {
      throw new UserError("Waktu event tidak boleh di masa lalu.");
    }

    this.chat_service.get_or_create(params.chat_jid, params.chat_type);

    return this.event_repo.create({
      chat_jid: params.chat_jid,
      title: params.title,
      start_at: params.start_at,
      end_at: params.end_at,
      location: params.location,
      description: params.description,
      created_by: params.created_by,
      now_ms: now,
    });
  }

  get_by_seq(chat_jid: string, seq: number): Event {
    const event = this.event_repo.find_by_seq(chat_jid, seq);
    if (!event) {
      throw new UserError(`Event #${seq} tidak ditemukan.`);
    }
    return event;
  }

  list(chat_jid: string, include_all: boolean = false): Event[] {
    const now = this.clock.now();
    return this.event_repo.list_by_chat(chat_jid, include_all, now);
  }

  update(params: {
    chat_jid: string;
    seq: number;
    title?: string;
    start_at?: number;
    end_at?: number | null;
    location?: string | null;
    description?: string | null;
  }): Event {
    const existing = this.get_by_seq(params.chat_jid, params.seq);
    const now = this.clock.now();

    if (params.start_at !== undefined && params.start_at < now) {
      throw new UserError("Waktu event tidak boleh di masa lalu.");
    }

    const updated = this.event_repo.update(params.chat_jid, params.seq, {
      title: params.title,
      start_at: params.start_at,
      end_at: params.end_at,
      location: params.location,
      description: params.description,
      now_ms: now,
    });

    if (!updated) {
      throw new UserError(`Event #${params.seq} tidak ditemukan.`);
    }

    // Edge case from spec: if event time changed, clear reminder_log so reminders re-fire
    if (params.start_at !== undefined && params.start_at !== existing.start_at) {
      this.reminder_repo.delete_by_source("event", existing.id);
    }

    return updated;
  }

  delete(chat_jid: string, seq: number): Event {
    const existing = this.get_by_seq(chat_jid, seq);
    const deleted = this.event_repo.delete(chat_jid, seq);
    if (!deleted) {
      throw new UserError(`Event #${seq} tidak ditemukan.`);
    }

    this.reminder_repo.delete_by_source("event", existing.id);
    return deleted;
  }
}
