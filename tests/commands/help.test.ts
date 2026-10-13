import { describe, expect, it } from "bun:test";
import { help_handler } from "@/commands/help.ts";
import type { CommandContext } from "@/commands/types.ts";
import { FakeClock } from "@/lib/clock.ts";
import { create_database } from "@/db/client.ts";
import { run_migrations } from "@/db/migrate.ts";
import { ChatRepository } from "@/db/repositories/chat.repo.ts";
import { CourseRepository } from "@/db/repositories/course.repo.ts";
import { EventRepository } from "@/db/repositories/event.repo.ts";
import { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import { TaskRepository } from "@/db/repositories/task.repo.ts";
import { ChatService } from "@/services/chat.service.ts";
import { CourseService } from "@/services/course.service.ts";
import { EventService } from "@/services/event.service.ts";
import { PermissionService } from "@/services/permission.service.ts";
import { TaskService } from "@/services/task.service.ts";
import type { ServiceContainer } from "@/services/container.ts";

function create_mock_context(
  command: string,
  args_text: string = ""
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
    chat_jid: "chat@g.us",
    sender_jid: "user@s.whatsapp.net",
    is_group: true,
    is_admin: false,
    command,
    args_text,
    pipe_args: [],
    key_value_flags: {},
    services,
  };
}

describe("Help & FAQ Command Handlers", () => {
  it("renders main help menu with /faq and /penggunaan mentioned", async () => {
    const ctx = create_mock_context("help", "");
    const reply = await help_handler(ctx);

    expect(reply).toContain("Daftar Perintah Bot Pengingat");
    expect(reply).toContain("/faq");
    expect(reply).toContain("/penggunaan");
  });

  it("renders specific command guides", async () => {
    const ctx_event = create_mock_context("help", "event");
    const reply_event = await help_handler(ctx_event);
    expect(reply_event).toContain("Panduan /event");

    const ctx_notif = create_mock_context("help", "setnotification");
    const reply_notif = await help_handler(ctx_notif);
    expect(reply_notif).toContain("Panduan /setnotification");
  });

  it("renders tutorial and FAQ via /faq, /penggunaan, and /help faq", async () => {
    const ctx_faq = create_mock_context("faq", "");
    const reply_faq = await help_handler(ctx_faq);
    expect(reply_faq).toContain("PANDUAN & TUTORIAL PENGGUNAAN BOT");
    expect(reply_faq).toContain("Mengaktifkan Notifikasi di Chat/Grup");
    expect(reply_faq).toContain("FAQ (Pertanyaan Umum)");

    const ctx_penggunaan = create_mock_context("penggunaan", "");
    const reply_penggunaan = await help_handler(ctx_penggunaan);
    expect(reply_penggunaan).toContain("PANDUAN & TUTORIAL PENGGUNAAN BOT");

    const ctx_help_faq = create_mock_context("help", "faq");
    const reply_help_faq = await help_handler(ctx_help_faq);
    expect(reply_help_faq).toContain("PANDUAN & TUTORIAL PENGGUNAAN BOT");
  });
});
