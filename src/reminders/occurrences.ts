import { DateTime } from "luxon";
import type { Course, Event, SourceType, TaskWithCourse } from "@/db/types.ts";

export interface ReminderOccurrence {
  source_type: SourceType;
  source_id: number;
  source_seq: number;
  chat_jid: string;
  title: string;
  occurrence_at: number; // epoch ms UTC
  location?: string | null;
  course_name?: string | null;
  description?: string | null;
}

export function expand_event_occurrences(
  events: Event[],
  from_ms: number,
  to_ms: number
): ReminderOccurrence[] {
  const occurrences: ReminderOccurrence[] = [];

  for (const event of events) {
    if (event.start_at >= from_ms && event.start_at <= to_ms) {
      occurrences.push({
        source_type: "event",
        source_id: event.id,
        source_seq: event.seq,
        chat_jid: event.chat_jid,
        title: event.title,
        occurrence_at: event.start_at,
        location: event.location,
        description: event.description,
      });
    }
  }

  return occurrences;
}

export function expand_task_occurrences(
  tasks: TaskWithCourse[],
  from_ms: number,
  to_ms: number
): ReminderOccurrence[] {
  const occurrences: ReminderOccurrence[] = [];

  for (const task of tasks) {
    if (task.status === "open" && task.due_at >= from_ms && task.due_at <= to_ms) {
      occurrences.push({
        source_type: "task",
        source_id: task.id,
        source_seq: task.seq,
        chat_jid: task.chat_jid,
        title: task.title,
        occurrence_at: task.due_at,
        course_name: task.course_name,
        description: task.description,
      });
    }
  }

  return occurrences;
}

export function expand_course_occurrences(
  courses: Course[],
  timezone: string,
  from_ms: number,
  to_ms: number
): ReminderOccurrence[] {
  const occurrences: ReminderOccurrence[] = [];
  const from_dt = DateTime.fromMillis(from_ms).setZone(timezone);
  const to_dt = DateTime.fromMillis(to_ms).setZone(timezone);

  for (const course of courses) {
    if (!course.active) {
      continue;
    }

    const [hour_str, min_str] = course.start_time.split(":");
    const hour = parseInt(hour_str ?? "0", 10);
    const minute = parseInt(min_str ?? "0", 10);

    // Check occurrences across days from from_dt to to_dt
    let curr = from_dt.startOf("day");
    const end = to_dt.endOf("day");

    while (curr.toMillis() <= end.toMillis()) {
      if (curr.weekday === course.day_of_week) {
        const occurrence_dt = curr.set({
          hour,
          minute,
          second: 0,
          millisecond: 0,
        });
        const occurrence_ms = occurrence_dt.toMillis();

        if (occurrence_ms >= from_ms && occurrence_ms <= to_ms) {
          occurrences.push({
            source_type: "course",
            source_id: course.id,
            source_seq: course.seq,
            chat_jid: course.chat_jid,
            title: course.name,
            occurrence_at: occurrence_ms,
            location: course.room ? `Ruang ${course.room}` : null,
            description: course.lecturer ? `Dosen: ${course.lecturer}` : null,
          });
        }
      }
      curr = curr.plus({ days: 1 });
    }
  }

  return occurrences;
}
