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

    let offsets: number[] = [1440, 180, 30];
    try {
      offsets = JSON.parse(chat_settings.reminder_offsets);
    } catch {
      offsets = [1440, 180, 30];
    }

    if (offsets.length === 0) {
      return [];
    }

    const now_ms = this.clock.now();
    const grace_ms = this.grace_minutes * 60_000;
    const max_offset = Math.max(...offsets);

    const from_ms = now_ms - grace_ms;
    const to_ms = now_ms + max_offset * 60_000;

    // 1. Fetch items
    const events = this.event_repo.find_upcoming_occurrences(
      chat_settings.chat_jid,
      from_ms,
      to_ms
    );
    const tasks = this.task_repo.find_open_occurrences(
      chat_settings.chat_jid,
      from_ms,
      to_ms
    );
    const courses = this.course_repo.list_active_by_chat(
      chat_settings.chat_jid
    );

    // 2. Expand occurrences
    const event_occ = expand_event_occurrences(events, from_ms, to_ms);
    const task_occ = expand_task_occurrences(tasks, from_ms, to_ms);
    const course_occ = expand_course_occurrences(
      courses,
      chat_settings.timezone,
      from_ms,
      to_ms
    );

    const all_occurrences: ReminderOccurrence[] = [
      ...event_occ,
      ...task_occ,
      ...course_occ,
    ];

    const due_reminders: DueReminder[] = [];

    // 3. Evaluate triggers
    for (const occ of all_occurrences) {
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

    return due_reminders;
  }
}
