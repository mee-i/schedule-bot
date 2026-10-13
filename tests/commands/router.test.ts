import { describe, expect, it } from "bun:test";
import { CommandRouter } from "@/commands/router.ts";
import { UserError } from "@/lib/errors.ts";
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

function create_test_container(): ServiceContainer {
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

  return {
    clock,
    chat_service,
    event_service,
    course_service,
    task_service,
    permission_service,
  };
}

describe("CommandRouter", () => {
  it("dispatches registered command", async () => {
    const services = create_test_container();
    const router = new CommandRouter(services);

    router.register("ping", async () => "Pong! Bot aktif 🏓");

    const reply = await router.dispatch({
      raw_text: "/ping",
      chat_jid: "chat@g.us",
      sender_jid: "user@s.whatsapp.net",
      is_group: true,
    });

    expect(reply).toBe("Pong! Bot aktif 🏓");
  });

  it("handles UserError gracefully without leaking stack trace", async () => {
    const services = create_test_container();
    const router = new CommandRouter(services);

    router.register("test_error", async () => {
      throw new UserError("Parameter waktu tidak valid.");
    });

    const reply = await router.dispatch({
      raw_text: "/test_error",
      chat_jid: "chat@g.us",
      sender_jid: "user@s.whatsapp.net",
      is_group: true,
    });

    expect(reply).toBe("⚠️ Parameter waktu tidak valid.");
  });

  it("ignores non-commands", async () => {
    const services = create_test_container();
    const router = new CommandRouter(services);

    const reply = await router.dispatch({
      raw_text: "Halo halo",
      chat_jid: "chat@g.us",
      sender_jid: "user@s.whatsapp.net",
      is_group: true,
    });

    expect(reply).toBeNull();
  });
});
