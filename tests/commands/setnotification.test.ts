import { describe, expect, it } from "bun:test";
import { setnotification_handler } from "@/commands/setnotification.ts";
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

function setup_context(overrides: Partial<CommandContext> = {}): CommandContext {
  const clock = new FakeClock();
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
    chat_jid: "group1@g.us",
    sender_jid: "user1@s.whatsapp.net",
    is_group: true,
    is_admin: true,
    command: "setnotification",
    args_text: "",
    pipe_args: [],
    key_value_flags: {},
    services,
    ...overrides,
  };
}

describe("/setnotification Command", () => {
  it("enables notification when executed by admin", async () => {
    const ctx = setup_context({ is_admin: true });
    const reply = await setnotification_handler(ctx);
    expect(reply).toContain("berhasil diaktifkan");

    const settings = ctx.services.chat_service.get_settings("group1@g.us");
    expect(settings?.notify_enabled).toBe(1);

    // Second call is idempotent
    const reply2 = await setnotification_handler(ctx);
    expect(reply2).toContain("sudah aktif");
  });

  it("blocks non-admin from changing settings in a group", async () => {
    const ctx = setup_context({ is_admin: false, is_group: true });
    expect(setnotification_handler(ctx)).rejects.toThrow("Hanya admin grup");
  });

  it("changes mention mode, offsets, and timezone", async () => {
    const ctx = setup_context({ is_admin: true, args_text: "mention visible" });
    const reply_mention = await setnotification_handler(ctx);
    expect(reply_mention).toContain("visible");

    ctx.args_text = "offset 1d, 3h, 30m";
    const reply_offset = await setnotification_handler(ctx);
    expect(reply_offset).toContain("1 hari sebelum");

    ctx.args_text = "tz Asia/Makassar";
    const reply_tz = await setnotification_handler(ctx);
    expect(reply_tz).toContain("Asia/Makassar");

    ctx.args_text = "status";
    const status_reply = await setnotification_handler(ctx);
    expect(status_reply).toContain("Asia/Makassar");
    expect(status_reply).toContain("visible");
  });

  it("disables notification with 'off'", async () => {
    const ctx = setup_context({ is_admin: true, args_text: "off" });
    const reply = await setnotification_handler(ctx);
    expect(reply).toContain("dinonaktifkan");

    const settings = ctx.services.chat_service.get_settings("group1@g.us");
    expect(settings?.notify_enabled).toBe(0);
  });

  it("manages category-specific notification toggles and offsets", async () => {
    const ctx = setup_context({ is_admin: true });

    // 1. Matkul toggle & offsets
    ctx.args_text = "matkul off";
    const reply_matkul_off = await setnotification_handler(ctx);
    expect(reply_matkul_off).toContain("Jadwal Kuliah (Matkul)");
    expect(reply_matkul_off).toContain("dinonaktifkan");

    let settings = ctx.services.chat_service.get_settings("group1@g.us");
    expect(settings?.notify_course).toBe(0);

    ctx.args_text = "matkul offset 1h,30m,0m";
    const reply_matkul_offset = await setnotification_handler(ctx);
    expect(reply_matkul_offset).toContain("1 jam sebelum");
    expect(reply_matkul_offset).toContain("30 menit sebelum");
    expect(reply_matkul_offset).toContain("waktu kejadian tiba (0m)");

    settings = ctx.services.chat_service.get_settings("group1@g.us");
    expect(settings?.course_offsets).toBe("[60,30,0]");

    // 2. Tugas toggle & offsets
    ctx.args_text = "tugas off";
    const reply_tugas_off = await setnotification_handler(ctx);
    expect(reply_tugas_off).toContain("Tugas");
    expect(reply_tugas_off).toContain("dinonaktifkan");

    settings = ctx.services.chat_service.get_settings("group1@g.us");
    expect(settings?.notify_task).toBe(0);

    ctx.args_text = "tugas offset 1d,6h,3h,30m";
    const reply_tugas_offset = await setnotification_handler(ctx);
    expect(reply_tugas_offset).toContain("1 hari sebelum");
    expect(reply_tugas_offset).toContain("6 jam sebelum");
    expect(reply_tugas_offset).toContain("3 jam sebelum");
    expect(reply_tugas_offset).toContain("30 menit sebelum");

    settings = ctx.services.chat_service.get_settings("group1@g.us");
    expect(settings?.task_offsets).toBe("[1440,360,180,30]");

    // 3. Event toggle & offsets
    ctx.args_text = "event off";
    const reply_event_off = await setnotification_handler(ctx);
    expect(reply_event_off).toContain("Agenda (Event)");
    expect(reply_event_off).toContain("dinonaktifkan");

    settings = ctx.services.chat_service.get_settings("group1@g.us");
    expect(settings?.notify_event).toBe(0);

    ctx.args_text = "event offset 2h,15m";
    await setnotification_handler(ctx);
    settings = ctx.services.chat_service.get_settings("group1@g.us");
    expect(settings?.event_offsets).toBe("[120,15]");

    // Re-enable matkul and check status breakdown
    ctx.args_text = "matkul on";
    await setnotification_handler(ctx);

    ctx.args_text = "status";
    const status_reply = await setnotification_handler(ctx);
    expect(status_reply).toContain("Jadwal Kuliah (Matkul)");
    expect(status_reply).toContain("Aktif ✅");
    expect(status_reply).toContain("Nonaktif ❌"); // Tugas and event are off
  });

  it("rejects invalid actions for category subcommands", async () => {
    const ctx = setup_context({ is_admin: true, args_text: "matkul foo" });
    expect(setnotification_handler(ctx)).rejects.toThrow("Aksi untuk kategori *matkul* tidak valid");
  });
});
