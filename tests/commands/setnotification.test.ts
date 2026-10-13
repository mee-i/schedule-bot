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
});
