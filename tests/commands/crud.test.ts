import { describe, expect, it } from "bun:test";
import { event_handler } from "@/commands/event.ts";
import { matkul_handler } from "@/commands/matkul.ts";
import { tugas_handler } from "@/commands/tugas.ts";
import type { CommandContext } from "@/commands/types.ts";
import { create_database } from "@/db/client.ts";
import { run_migrations } from "@/db/migrate.ts";
import { ChatRepository } from "@/db/repositories/chat.repo.ts";
import { CourseRepository } from "@/db/repositories/course.repo.ts";
import { EventRepository } from "@/db/repositories/event.repo.ts";
import { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import { TaskRepository } from "@/db/repositories/task.repo.ts";
import { FakeClock } from "@/lib/clock.ts";
import { ChatService } from "@/services/chat.service.ts";
import type { ServiceContainer } from "@/services/container.ts";
import { CourseService } from "@/services/course.service.ts";
import { EventService } from "@/services/event.service.ts";
import { PermissionService } from "@/services/permission.service.ts";
import { TaskService } from "@/services/task.service.ts";

function create_context(overrides: Partial<CommandContext> = {}): CommandContext {
  const clock = new FakeClock(1_700_000_000_000); // fixed time
  const db = create_database(":memory:");
  run_migrations(db);

  const chat_repo = new ChatRepository(db);
  const event_repo = new EventRepository(db);
  const course_repo = new CourseRepository(db);
  const task_repo = new TaskRepository(db);
  const reminder_repo = new ReminderLogRepository(db);

  const chat_service = new ChatService(chat_repo, clock);
  const event_service = new EventService(event_repo, reminder_repo, chat_service, clock);
  const course_service = new CourseService(course_repo, reminder_repo, chat_service, clock);
  const task_service = new TaskService(task_repo, course_repo, reminder_repo, chat_service, clock);
  const permission_service = new PermissionService();

  const services: ServiceContainer = {
    clock,
    chat_service,
    event_service,
    course_service,
    task_service,
    permission_service,
  };

  return {
    chat_jid: "groupA@g.us",
    sender_jid: "creator@s.whatsapp.net",
    is_group: true,
    is_admin: false,
    command: "",
    args_text: "",
    pipe_args: [],
    key_value_flags: {},
    services,
    ...overrides,
  };
}

describe("CRUD Command Handlers", () => {
  it("/event full lifecycle: add, list, detail, edit, delete", async () => {
    const ctx = create_context();

    // 1. Add
    ctx.args_text = "add Rapat Himpunan | besok 19:00 | Aula Barat | Bahas proker";
    const add_reply = await event_handler(ctx);
    expect(add_reply).toContain("Berhasil Ditambahkan");
    expect(add_reply).toContain("Rapat Himpunan");

    // 2. List
    ctx.args_text = "list";
    const list_reply = await event_handler(ctx);
    expect(list_reply).toContain("*#1* Rapat Himpunan");

    // 3. Detail
    ctx.args_text = "detail 1";
    const detail_reply = await event_handler(ctx);
    expect(detail_reply).toContain("Aula Barat");

    // 4. Edit unauthorized by stranger
    const stranger_ctx = {
      ...ctx,
      sender_jid: "stranger@s.whatsapp.net",
      is_admin: false,
      args_text: "edit 1 lokasi=Lab 3",
    };
    expect(event_handler(stranger_ctx)).rejects.toThrow("Hanya pembuat event atau admin");

    // 5. Edit authorized by creator
    ctx.args_text = "edit 1 lokasi=Lab 3";
    const edit_reply = await event_handler(ctx);
    expect(edit_reply).toContain("berhasil diperbarui");

    // 6. Delete
    ctx.args_text = "delete 1";
    const delete_reply = await event_handler(ctx);
    expect(delete_reply).toContain("berhasil dihapus");
  });

  it("/matkul full lifecycle: add, list, detail, delete", async () => {
    const ctx = create_context();

    ctx.args_text = "add Basis Data | senin | 08:00-10:30 | Lab 2 | Pak Budi";
    const add_reply = await matkul_handler(ctx);
    expect(add_reply).toContain("Mata Kuliah #1 Berhasil Ditambahkan");

    ctx.args_text = "list";
    const list_reply = await matkul_handler(ctx);
    expect(list_reply).toContain("Basis Data");
    expect(list_reply).toContain("Senin, 08:00-10:30");

    ctx.args_text = "detail 1";
    const detail_reply = await matkul_handler(ctx);
    expect(detail_reply).toContain("Pak Budi");

    ctx.args_text = "delete 1";
    const del_reply = await matkul_handler(ctx);
    expect(del_reply).toContain("berhasil dihapus");
  });

  it("/tugas lifecycle: add with course, list, done, undone, delete", async () => {
    const ctx = create_context();

    // Add course first
    ctx.args_text = "add Basis Data | senin | 08:00-10:30 | Lab 2 | Pak Budi";
    await matkul_handler(ctx);

    // Add task linked to course #1
    ctx.args_text = "add Laporan Praktikum | besok 23:59 | 1 | Bab 1-3";
    const add_reply = await tugas_handler(ctx);
    expect(add_reply).toContain("Tugas #1 Berhasil Ditambahkan");

    // List active
    ctx.args_text = "list";
    const list_reply = await tugas_handler(ctx);
    expect(list_reply).toContain("Laporan Praktikum");
    expect(list_reply).toContain("Basis Data");

    // Mark done
    ctx.args_text = "done 1";
    const done_reply = await tugas_handler(ctx);
    expect(done_reply).toContain("SELESAI");

    // List done
    ctx.args_text = "list done";
    const list_done_reply = await tugas_handler(ctx);
    expect(list_done_reply).toContain("Laporan Praktikum");

    // Undone
    ctx.args_text = "undone 1";
    const undone_reply = await tugas_handler(ctx);
    expect(undone_reply).toContain("OPEN");

    // Delete
    ctx.args_text = "delete 1";
    const del_reply = await tugas_handler(ctx);
    expect(del_reply).toContain("berhasil dihapus");
  });
});
