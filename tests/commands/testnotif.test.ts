import { describe, expect, it } from "bun:test";
import { setnotification_handler } from "@/commands/setnotification.ts";
import { testnotif_handler } from "@/commands/testnotif.ts";
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

function setup_context(
  overrides: Partial<CommandContext> = {}
): CommandContext {
  const clock = new FakeClock();
  const db = create_database(":memory:");
  run_migrations(db);

  const chat_repo = new ChatRepository(db);
  const event_repo = new EventRepository(db);
  const course_repo = new CourseRepository(db);
  const task_repo = new TaskRepository(db);
  const reminder_repo = new ReminderLogRepository(db);

  const chat_service = new ChatService(chat_repo, clock);
  const event_service = new EventService(
    event_repo,
    reminder_repo,
    chat_service,
    clock
  );
  const course_service = new CourseService(
    course_repo,
    reminder_repo,
    chat_service,
    clock
  );
  const task_service = new TaskService(
    task_repo,
    course_repo,
    reminder_repo,
    chat_service,
    clock
  );
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
    command: "testnotif",
    args_text: "",
    pipe_args: [],
    key_value_flags: {},
    services,
    ...overrides,
  };
}

describe("/testnotif Command", () => {
  it("starts 30-second notification test when executed by group admin", async () => {
    const ctx = setup_context({ is_admin: true, is_group: true });
    const reply = await testnotif_handler(ctx);

    expect(reply).toContain("Uji coba notifikasi dimulai");
    expect(reply).toContain("30 detik");
    expect(reply).toContain("Semua anggota grup");
  });

  it("supports custom delay when passed as argument", async () => {
    const ctx = setup_context({
      is_admin: true,
      is_group: true,
      args_text: "15",
    });
    const reply = await testnotif_handler(ctx);

    expect(reply).toContain("15 detik");
  });

  it("works in private chat without requiring group admin status", async () => {
    const ctx = setup_context({
      chat_jid: "user1@s.whatsapp.net",
      is_admin: false,
      is_group: false,
    });
    const reply = await testnotif_handler(ctx);

    expect(reply).toContain("Uji coba notifikasi dimulai");
    expect(reply).toContain("Chat pribadi");
  });

  it("rejects non-admin in group chat with UserError", async () => {
    const ctx = setup_context({
      is_admin: false,
      is_group: true,
    });

    expect(testnotif_handler(ctx)).rejects.toThrow(
      "Hanya admin grup atau superadmin"
    );
  });

  it("is accessible via /setnotification test delegation", async () => {
    const ctx = setup_context({
      is_admin: true,
      is_group: true,
      command: "setnotification",
      args_text: "test",
    });
    const reply = await setnotification_handler(ctx);

    expect(reply).toContain("Uji coba notifikasi dimulai");
    expect(reply).toContain("30 detik");
  });
});
