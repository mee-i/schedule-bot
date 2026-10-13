import fs from "node:fs";
import path from "node:path";
import { adminonly_handler } from "@/commands/adminonly.ts";
import { event_handler } from "@/commands/event.ts";
import { help_handler } from "@/commands/help.ts";
import { matkul_handler } from "@/commands/matkul.ts";
import { ping_handler } from "@/commands/ping.ts";
import { CommandRouter } from "@/commands/router.ts";
import { setnotification_handler } from "@/commands/setnotification.ts";
import { testnotif_handler } from "@/commands/testnotif.ts";
import { tugas_handler } from "@/commands/tugas.ts";
import { env } from "@/config/env.ts";
import { close_database, get_database } from "@/db/client.ts";
import { run_migrations } from "@/db/migrate.ts";
import { ChatRepository } from "@/db/repositories/chat.repo.ts";
import { CourseRepository } from "@/db/repositories/course.repo.ts";
import { EventRepository } from "@/db/repositories/event.repo.ts";
import { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import { TaskRepository } from "@/db/repositories/task.repo.ts";
import { SystemClock } from "@/lib/clock.ts";
import { logger } from "@/lib/logger.ts";
import { ReminderEngine } from "@/reminders/engine.ts";
import { ReminderScheduler } from "@/reminders/scheduler.ts";
import { ChatService } from "@/services/chat.service.ts";
import type { ServiceContainer } from "@/services/container.ts";
import { CourseService } from "@/services/course.service.ts";
import { EventService } from "@/services/event.service.ts";
import { PermissionService } from "@/services/permission.service.ts";
import { TaskService } from "@/services/task.service.ts";
import { register_message_handlers } from "@/wa/events.ts";
import { WhatsAppConnection } from "@/wa/socket.ts";
import { TerminalCLI } from "@/cli/console.ts";

function acquire_process_lock(data_dir: string): () => void {
  const lock_file = path.join(data_dir, "bot.lock");

  if (!fs.existsSync(data_dir)) {
    fs.mkdirSync(data_dir, { recursive: true });
  }

  if (fs.existsSync(lock_file)) {
    const existing_pid = fs.readFileSync(lock_file, "utf-8").trim();
    logger.warn({
      event: "existing_lock_found",
      pid: existing_pid,
      lock_file,
    });
  }

  fs.writeFileSync(lock_file, String(process.pid), "utf-8");

  return () => {
    try {
      if (fs.existsSync(lock_file)) {
        fs.unlinkSync(lock_file);
      }
    } catch (err) {
      logger.error({ event: "lock_release_failed", error: String(err) });
    }
  };
}

async function bootstrap(): Promise<void> {
  logger.info({ event: "bot_starting", version: "1.0.0", env: env.NODE_ENV });

  // 1. Single-instance lock
  const release_lock = acquire_process_lock(env.DATA_DIR);

  // 2. Database & migrations
  const db = get_database();
  run_migrations(db);

  // 3. Repositories
  const chat_repo = new ChatRepository(db);
  const event_repo = new EventRepository(db);
  const course_repo = new CourseRepository(db);
  const task_repo = new TaskRepository(db);
  const reminder_repo = new ReminderLogRepository(db);

  // 4. Services
  const clock = new SystemClock();
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

  // 5. Command Router
  const router = new CommandRouter(services);
  router.register("ping", ping_handler);
  router.register("help", help_handler);
  router.register("faq", help_handler);
  router.register("penggunaan", help_handler);
  router.register("tutorial", help_handler);
  router.register("setnotification", setnotification_handler);
  router.register("adminonly", adminonly_handler);
  router.register("testnotif", testnotif_handler);
  router.register("testnotification", testnotif_handler);
  router.register("event", event_handler);
  router.register("matkul", matkul_handler);
  router.register("tugas", tugas_handler);

  // 6. Reminder Engine & Scheduler
  const reminder_engine = new ReminderEngine(
    event_repo,
    course_repo,
    task_repo,
    reminder_repo,
    clock,
    env.REMINDER_GRACE_MINUTES
  );

  let wa_conn: WhatsAppConnection | null = null;

  const scheduler = new ReminderScheduler({
    engine: reminder_engine,
    chat_repo,
    reminder_repo,
    get_socket: () => wa_conn?.get_socket() ?? null,
  });

  // 7. WhatsApp Connection
  const on_message_upsert = register_message_handlers(router);
  wa_conn = new WhatsAppConnection({ on_message_upsert });

  // 8. Graceful Shutdown
  let cli: TerminalCLI | null = null;
  const shutdown = (signal: string) => {
    logger.info({ event: "shutting_down", signal });
    cli?.stop();
    scheduler.stop();
    wa_conn?.stop();
    close_database();
    release_lock();
    logger.info("Shutdown completed cleanly.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await wa_conn.start();
  scheduler.start();

  // 9. Interactive Terminal CLI
  cli = new TerminalCLI({
    wa_conn,
    scheduler,
    db,
    shutdown,
  });
  cli.start();

  logger.info("Bot bootstrap complete. Waiting for WhatsApp events...");
}

bootstrap().catch((error) => {
  logger.fatal({
    event: "bootstrap_fatal_error",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
