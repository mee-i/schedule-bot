import type { MentionMode } from "@/db/types.ts";
import { format_datetime } from "@/parsing/datetime.ts";
import type { ReminderOccurrence } from "@/reminders/occurrences.ts";

export interface FormattedReminder {
  text: string;
  mention_mode: MentionMode;
}

export function format_offset_countdown(offset_minutes: number): string {
  if (offset_minutes === 0) {
    return "Waktu telah tiba!";
  }
  if (offset_minutes % 1440 === 0) {
    const days = offset_minutes / 1440;
    return `${days} hari lagi`;
  }
  if (offset_minutes % 60 === 0) {
    const hours = offset_minutes / 60;
    return `${hours} jam lagi`;
  }
  return `${offset_minutes} menit lagi`;
}

export function format_reminder_message(
  occurrence: ReminderOccurrence,
  offset_minutes: number,
  timezone: string,
  mention_mode: MentionMode
): FormattedReminder {
  let header = "⏰ *Pengingat Agenda*";
  if (occurrence.source_type === "task") {
    header = "⏰ *Pengingat Tugas*";
  } else if (occurrence.source_type === "course") {
    header = "⏰ *Pengingat Kuliah*";
  }

  const time_str = format_datetime(occurrence.occurrence_at, timezone);
  const countdown_str = format_offset_countdown(offset_minutes);

  const lines = [
    header,
    `*${occurrence.title}*`,
    `📅 ${time_str}`,
    `⏳ ${countdown_str}`,
  ];

  if (occurrence.course_name) {
    lines.push(`📚 Matkul: ${occurrence.course_name}`);
  }
  if (occurrence.location) {
    lines.push(`📍 Lokasi: ${occurrence.location}`);
  }
  if (occurrence.description) {
    lines.push(`📝 Info: ${occurrence.description}`);
  }

  if (mention_mode === "visible") {
    lines.push("\n@semua");
  }

  return {
    text: lines.join("\n"),
    mention_mode,
  };
}
