import { describe, expect, it } from "bun:test";
import { adminonly_handler } from "@/commands/adminonly.ts";
import { CommandRouter } from "@/commands/router.ts";
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
import { UserError } from "@/lib/errors.ts";
import { ChatService } from "@/services/chat.service.ts";
import type { ServiceContainer } from "@/services/container.ts";
import { CourseService } from "@/services/course.service.ts";
import { EventService } from "@/services/event.service.ts";
import { PermissionService } from "@/services/permission.service.ts";
import { TaskService } from "@/services/task.service.ts";

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

  return {
    clock,
    chat_service,
    event_service,
    course_service,
    task_service,
    permission_service,
  };
}

describe("AdminOnly Command & Router Guard", () => {
  it("rejects non-group usage", async () => {
    const services = create_test_container();
    const ctx: CommandContext = {
      chat_jid: "user@s.whatsapp.net",
      sender_jid: "user@s.whatsapp.net",
      is_group: false,
      is_admin: true,
      command: "adminonly",
      args_text: "on",
      pipe_args: ["on"],
      key_value_flags: {},
      services,
    };

    expect(adminonly_handler(ctx)).rejects.toThrow(
      "Perintah `/adminonly` hanya dapat digunakan di grup WhatsApp."
    );
  });

  it("checks default status as nonaktif", async () => {
    const services = create_test_container();
    const ctx: CommandContext = {
      chat_jid: "120363@g.us",
      sender_jid: "user@s.whatsapp.net",
      is_group: true,
      is_admin: false,
      command: "adminonly",
      args_text: "status",
      pipe_args: ["status"],
      key_value_flags: {},
      services,
    };

    const res = await adminonly_handler(ctx);
    expect(res).toContain("Nonaktif 🔓");
  });

  it("prevents non-admin from changing admin-only mode", async () => {
    const services = create_test_container();
    const ctx: CommandContext = {
      chat_jid: "120363@g.us",
      sender_jid: "member@s.whatsapp.net",
      is_group: true,
      is_admin: false,
      command: "adminonly",
      args_text: "on",
      pipe_args: ["on"],
      key_value_flags: {},
      services,
    };

    expect(adminonly_handler(ctx)).rejects.toThrow(
      "Hanya admin grup atau superadmin yang dapat mengubah pengaturan admin-only."
    );
  });

  it("allows group admin to enable and disable admin-only mode", async () => {
    const services = create_test_container();
    const ctx_on: CommandContext = {
      chat_jid: "120363@g.us",
      sender_jid: "admin@s.whatsapp.net",
      is_group: true,
      is_admin: true,
      command: "adminonly",
      args_text: "on",
      pipe_args: ["on"],
      key_value_flags: {},
      services,
    };

    const res_on = await adminonly_handler(ctx_on);
    expect(res_on).toContain("Mode Admin-Only Diaktifkan");

    const settings_after_on = services.chat_service.get_settings("120363@g.us");
    expect(settings_after_on?.admin_only).toBe(1);

    const ctx_off: CommandContext = {
      ...ctx_on,
      args_text: "off",
      pipe_args: ["off"],
    };

    const res_off = await adminonly_handler(ctx_off);
    expect(res_off).toContain("Mode Admin-Only Dinonaktifkan");

    const settings_after_off = services.chat_service.get_settings("120363@g.us");
    expect(settings_after_off?.admin_only).toBe(0);
  });

  it("enforces admin-only restriction in CommandRouter", async () => {
    const services = create_test_container();
    const router = new CommandRouter(services);

    router.register("ping", async () => "Pong! Bot aktif 🏓");
    router.register("adminonly", adminonly_handler);

    const group_jid = "120363@g.us";
    const member_jid = "member@s.whatsapp.net";
    const admin_jid = "admin@s.whatsapp.net";

    // 1. Awalnya non-admin bisa pakai /ping
    const reply_initial = await router.dispatch({
      raw_text: "/ping",
      chat_jid: group_jid,
      sender_jid: member_jid,
      is_group: true,
      is_admin: false,
    });
    expect(reply_initial).toBe("Pong! Bot aktif 🏓");

    // 2. Admin mengaktifkan mode admin-only
    const reply_enable = await router.dispatch({
      raw_text: "/adminonly on",
      chat_jid: group_jid,
      sender_jid: admin_jid,
      is_group: true,
      is_admin: true,
    });
    expect(reply_enable).toContain("Mode Admin-Only Diaktifkan");

    // 3. Sekarang non-admin ditolak saat memanggil /ping
    const reply_blocked = await router.dispatch({
      raw_text: "/ping",
      chat_jid: group_jid,
      sender_jid: member_jid,
      is_group: true,
      is_admin: false,
    });
    expect(reply_blocked).toContain("dibatasi hanya untuk admin grup");

    // 4. Admin tetap bisa menggunakan /ping
    const reply_admin = await router.dispatch({
      raw_text: "/ping",
      chat_jid: group_jid,
      sender_jid: admin_jid,
      is_group: true,
      is_admin: true,
    });
    expect(reply_admin).toBe("Pong! Bot aktif 🏓");

    // 5. Admin menonaktifkan mode admin-only
    await router.dispatch({
      raw_text: "/adminonly off",
      chat_jid: group_jid,
      sender_jid: admin_jid,
      is_group: true,
      is_admin: true,
    });

    // 6. Non-admin kembali bisa menggunakan /ping
    const reply_unblocked = await router.dispatch({
      raw_text: "/ping",
      chat_jid: group_jid,
      sender_jid: member_jid,
      is_group: true,
      is_admin: false,
    });
    expect(reply_unblocked).toBe("Pong! Bot aktif 🏓");
  });

  it("supports /setnotification adminonly alias", async () => {
    const services = create_test_container();
    const ctx: CommandContext = {
      chat_jid: "120363@g.us",
      sender_jid: "admin@s.whatsapp.net",
      is_group: true,
      is_admin: true,
      command: "setnotification",
      args_text: "adminonly on",
      pipe_args: ["adminonly on"],
      key_value_flags: {},
      services,
    };

    const res = await setnotification_handler(ctx);
    expect(res).toContain("Mode Admin-Only Diaktifkan");

    const settings = services.chat_service.get_settings("120363@g.us");
    expect(settings?.admin_only).toBe(1);
  });
});
