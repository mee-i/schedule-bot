import type { Course, Event, TaskWithCourse } from "@/db/types.ts";
import { format_datetime, format_day_of_week } from "@/parsing/datetime.ts";

export function format_event_list(
  events: Event[],
  timezone: string,
  is_all: boolean
): string {
  if (events.length === 0) {
    return is_all
      ? "Belum ada agenda/event yang tercatat."
      : "Tidak ada event mendatang. Tambah baru dengan:\n`/event add <judul> | <waktu> | [lokasi] | [deskripsi]`";
  }

  const header = is_all
    ? "📅 *Daftar Semua Event/Agenda*"
    : "📅 *Daftar Event Mendatang*";
  const items = events
    .map((e) => {
      const time_str = format_datetime(e.start_at, timezone);
      const loc_str = e.location ? ` • 📍 ${e.location}` : "";
      return `*#${e.seq}* ${e.title}\n   🕒 ${time_str}${loc_str}`;
    })
    .join("\n\n");

  return `${header}\n\n${items}\n\n_Ketik \`/event detail <no>\` untuk detail lengkap._`;
}

export function format_course_list(courses: Course[]): string {
  if (courses.length === 0) {
    return (
      "Belum ada mata kuliah yang tercatat.\n" +
      "Tambah jadwal kuliah dengan:\n" +
      "`/matkul add <nama> | <hari> | <mulai-selesai> | [ruang] | [dosen]`"
    );
  }

  const items = courses
    .map((c) => {
      const day_str = format_day_of_week(c.day_of_week);
      const time_str = c.end_time
        ? `${c.start_time}-${c.end_time}`
        : c.start_time;
      const room_str = c.room ? ` • Ruang: ${c.room}` : "";
      return `*#${c.seq}* ${c.name}\n   🗓️ ${day_str}, ${time_str}${room_str}`;
    })
    .join("\n\n");

  return `📚 *Jadwal Mata Kuliah*\n\n${items}\n\n_Ketik \`/matkul detail <no>\` untuk info lengkap._`;
}

export function format_task_list(
  tasks: TaskWithCourse[],
  timezone: string,
  filter: "open" | "done" | "all",
  now_ms: number
): string {
  if (tasks.length === 0) {
    if (filter === "done") {
      return "Belum ada tugas yang selesai.";
    }
    return (
      "Tidak ada tugas yang sedang aktif. 🎉\n" +
      "Tambah tugas baru dengan:\n" +
      "`/tugas add <judul> | <deadline> | [no matkul] | [deskripsi]`"
    );
  }

  const title =
    filter === "done"
      ? "📝 *Daftar Tugas Selesai*"
      : filter === "all"
        ? "📝 *Daftar Semua Tugas*"
        : "📝 *Daftar Tugas Aktif*";

  const items = tasks
    .map((t) => {
      const is_done = t.status === "done";
      const is_overdue = !is_done && t.due_at < now_ms;
      const status_badge = is_done
        ? "✅ Selesai"
        : is_overdue
          ? "⚠️ Terlambat"
          : "⏳ Open";

      const deadline_str = format_datetime(t.due_at, timezone);
      const course_str = t.course_name ? ` • 📚 ${t.course_name}` : "";

      return `*#${t.seq}* ${t.title} [${status_badge}]\n   📅 ${deadline_str}${course_str}`;
    })
    .join("\n\n");

  return `${title}\n\n${items}\n\n_Ketik \`/tugas done <no>\` untuk menandai tugas selesai._`;
}
