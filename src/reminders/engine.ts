import type { CourseRepository } from "@/db/repositories/course.repo.ts";
import type { EventRepository } from "@/db/repositories/event.repo.ts";
import type { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import type { TaskRepository } from "@/db/repositories/task.repo.ts";
import type { ChatSettings } from "@/db/types.ts";
import type { Clock } from "@/lib/clock.ts";
import {
  expand_course_occurrences,
  expand_event_occurrences,
  expand_task_occurrences,
  type ReminderOccurrence,
} from "@/reminders/occurrences.ts";

export interface DueReminder {
  occurrence: ReminderOccurrence;
  offset_minutes: number;
  chat_settings: ChatSettings;
}

export class ReminderEngine {
  constructor(
    private readonly event_repo: EventRepository,
    private readonly course_repo: CourseRepository,
    private readonly task_repo: TaskRepository,
    private readonly reminder_repo: ReminderLogRepository,
    private readonly clock: Clock,
    private readonly grace_minutes: number = 15
  ) {}

  find_due_reminders_for_chat(chat_settings: ChatSettings): DueReminder[] {
    if (!chat_settings.notify_enabled) {
      return [];
    }

    const now_ms = this.clock.now();
    const grace_ms = this.grace_minutes * 60_000;
    const from_ms = now_ms - grace_ms;
    const due_reminders: DueReminder[] = [];

    const parse_offsets = (
      raw: string | undefined,
      legacy_raw: string | undefined,
      fallback: number[]
    ): number[] => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {
          // ignore
        }
      }
      if (legacy_raw) {
        try {
          const parsed = JSON.parse(legacy_raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {
          // ignore
        }
      }
      return fallback;
    };

    const evaluate_triggers = (
      occurrences: ReminderOccurrence[],
      offsets: number[]
    ): void => {
      for (const occ of occurrences) {
        for (const offset of offsets) {
          const trigger_time = occ.occurrence_at - offset * 60_000;

          const is_due =
            trigger_time <= now_ms && trigger_time > now_ms - grace_ms;

          if (!is_due) {
            continue;
          }

          const already_sent = this.reminder_repo.is_already_logged(
            occ.source_type,
            occ.source_id,
            occ.occurrence_at,
            offset
          );

          if (!already_sent) {
            due_reminders.push({
              occurrence: occ,
              offset_minutes: offset,
              chat_settings,
            });
          }
        }
      }
    };

    // 1. Matkul (Course)
    const course_enabled =
      chat_settings.notify_course !== undefined
        ? Boolean(chat_settings.notify_course)
        : true;
    if (course_enabled) {
      const course_offsets = parse_offsets(
        chat_settings.course_offsets,
        chat_settings.reminder_offsets,
        [60, 30, 0]
      );
      if (course_offsets.length > 0) {
        const max_offset = Math.max(...course_offsets);
        const to_ms = now_ms + max_offset * 60_000;
        const courses = this.course_repo.list_active_by_chat(
          chat_settings.chat_jid
        );
        const course_occ = expand_course_occurrences(
          courses,
          chat_settings.timezone,
          from_ms,
          to_ms
        );
        evaluate_triggers(course_occ, course_offsets);
      }
    }

    // 2. Tugas (Task)
    const task_enabled =
      chat_settings.notify_task !== undefined
        ? Boolean(chat_settings.notify_task)
        : true;
    if (task_enabled) {
      const task_offsets = parse_offsets(
        chat_settings.task_offsets,
        chat_settings.reminder_offsets,
        [1440, 360, 180, 30]
      );
      if (task_offsets.length > 0) {
        const max_offset = Math.max(...task_offsets);
        const to_ms = now_ms + max_offset * 60_000;
        const tasks = this.task_repo.find_open_occurrences(
          chat_settings.chat_jid,
          from_ms,
          to_ms
        );
        const task_occ = expand_task_occurrences(tasks, from_ms, to_ms);
        evaluate_triggers(task_occ, task_offsets);
      }
    }

    // 3. Agenda / Event
    const event_enabled =
      chat_settings.notify_event !== undefined
        ? Boolean(chat_settings.notify_event)
        : true;
    if (event_enabled) {
      const event_offsets = parse_offsets(
        chat_settings.event_offsets,
        chat_settings.reminder_offsets,
        [1440, 180, 30]
      );
      if (event_offsets.length > 0) {
        const max_offset = Math.max(...event_offsets);
        const to_ms = now_ms + max_offset * 60_000;
        const events = this.event_repo.find_upcoming_occurrences(
          chat_settings.chat_jid,
          from_ms,
          to_ms
        );
        const event_occ = expand_event_occurrences(events, from_ms, to_ms);
        evaluate_triggers(event_occ, event_offsets);
      }
    }

    return due_reminders;
  }
}
