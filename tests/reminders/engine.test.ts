import { describe, expect, it } from "bun:test";
import { create_database } from "@/db/client.ts";
import { run_migrations } from "@/db/migrate.ts";
import { ChatRepository } from "@/db/repositories/chat.repo.ts";
import { CourseRepository } from "@/db/repositories/course.repo.ts";
import { EventRepository } from "@/db/repositories/event.repo.ts";
import { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import { TaskRepository } from "@/db/repositories/task.repo.ts";
import { FakeClock } from "@/lib/clock.ts";
import { ReminderEngine } from "@/reminders/engine.ts";
import {
  expand_course_occurrences,
  expand_event_occurrences,
  expand_task_occurrences,
} from "@/reminders/occurrences.ts";

describe("Reminder Engine & Occurrences", () => {
  it("expands event and task occurrences within window", () => {
    const from_ms = 1_000_000;
    const to_ms = 2_000_000;

    const events = [
      {
        id: 1,
        chat_jid: "chat@g.us",
        seq: 1,
        title: "Event in window",
        start_at: 1_500_000,
        end_at: null,
        location: null,
        description: null,
        created_by: "u@s.whatsapp.net",
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 2,
        chat_jid: "chat@g.us",
        seq: 2,
        title: "Event outside window",
        start_at: 3_000_000,
        end_at: null,
        location: null,
        description: null,
        created_by: "u@s.whatsapp.net",
        created_at: 0,
        updated_at: 0,
      },
    ];

    const occ = expand_event_occurrences(events, from_ms, to_ms);
    expect(occ.length).toBe(1);
    expect(occ[0]?.title).toBe("Event in window");
  });

  it("expands weekly recurring courses in local timezone", () => {
    // 2026-10-12 is Monday (weekday 1)
    // from 2026-10-12 00:00 to 2026-10-14 23:59
    const from_ms = 1791763200000; // Monday 00:00 WIB
    const to_ms = from_ms + 3 * 24 * 60 * 60 * 1000;

    const courses = [
      {
        id: 1,
        chat_jid: "chat@g.us",
        seq: 1,
        name: "Senin Class",
        day_of_week: 1,
        start_time: "08:00",
        end_time: "10:00",
        room: "Lab 1",
        lecturer: "Pak Budi",
        active: 1,
        created_by: "u@s.whatsapp.net",
        created_at: 0,
        updated_at: 0,
      },
    ];

    const occ = expand_course_occurrences(courses, "Asia/Jakarta", from_ms, to_ms);
    expect(occ.length).toBe(1);
    expect(occ[0]?.title).toBe("Senin Class");
  });

  it("engine evaluates due reminders against offsets and grace period", () => {
    const clock = new FakeClock(1_000_000);
    const db = create_database(":memory:");
    run_migrations(db);

    const chat_repo = new ChatRepository(db);
    const event_repo = new EventRepository(db);
    const course_repo = new CourseRepository(db);
    const task_repo = new TaskRepository(db);
    const reminder_repo = new ReminderLogRepository(db);

    const chat = chat_repo.upsert({
      chat_jid: "chat@g.us",
      chat_type: "group",
      notify_enabled: 1,
      reminder_offsets: "[30, 0]", // 30m and 0m
    });

    // Event starts at now + 30 minutes (1_000_000 + 1_800_000 = 2_800_000)
    const event = event_repo.create({
      chat_jid: "chat@g.us",
      title: "Rapat",
      start_at: 2_800_000,
      created_by: "user@s.whatsapp.net",
      now_ms: clock.now(),
    });

    const engine = new ReminderEngine(
      event_repo,
      course_repo,
      task_repo,
      reminder_repo,
      clock,
      15 // 15 minutes grace
    );

    // At now = 1_000_000, trigger for offset 30 is 2_800_000 - 1_800_000 = 1_000_000 (EXACTLY NOW)
    const due1 = engine.find_due_reminders_for_chat(chat);
    expect(due1.length).toBe(1);
    expect(due1[0]?.offset_minutes).toBe(30);

    // Record it as sent in reminder_log
    reminder_repo.record({
      chat_jid: "chat@g.us",
      source_type: "event",
      source_id: event.id,
      occurrence_at: event.start_at,
      offset_minutes: 30,
      status: "sent",
    });

    // Check again at same timestamp -> should be 0 due reminders (idempotency!)
    const due_after_log = engine.find_due_reminders_for_chat(chat);
    expect(due_after_log.length).toBe(0);

    // Advance clock past grace period (e.g. 20 minutes)
    // A missed reminder with offset 0 whose trigger was 20 mins ago should be skipped
    clock.advance_by_minutes(50); // now is 2_800_000 + 1_200_000 = 4_000_000
    // Trigger for offset 0 was at 2_800_000, which is 20 mins ago (> 15 mins grace)
    const due_expired = engine.find_due_reminders_for_chat(chat);
    expect(due_expired.length).toBe(0);
  });

  it("evaluates category reminders independently based on individual toggles and offsets", () => {
    const clock = new FakeClock(1_000_000);
    const db = create_database(":memory:");
    run_migrations(db);

    const chat_repo = new ChatRepository(db);
    const event_repo = new EventRepository(db);
    const course_repo = new CourseRepository(db);
    const task_repo = new TaskRepository(db);
    const reminder_repo = new ReminderLogRepository(db);

    // Chat with course active ([60, 30, 0]), task active ([360, 30]), event inactive (notify_event: 0)
    const chat = chat_repo.upsert({
      chat_jid: "chat@g.us",
      chat_type: "group",
      notify_enabled: 1,
      notify_course: 1,
      course_offsets: "[60, 30, 0]",
      notify_task: 1,
      task_offsets: "[360, 30]",
      notify_event: 0,
      event_offsets: "[1440, 180, 30]",
    });

    // 1. Task due at now + 360 mins (6 hours)
    // trigger_time = 1_000_000 + 360 * 60_000 - 360 * 60_000 = 1_000_000 (NOW)
    const due_at_task = clock.now() + 360 * 60_000;
    task_repo.create({
      chat_jid: "chat@g.us",
      title: "Tugas Fisika",
      due_at: due_at_task,
      created_by: "user@s.whatsapp.net",
      now_ms: clock.now(),
    });

    // 2. Event due at now + 180 mins (3 hours)
    // Even though it's due, notify_event is 0 so it should NOT be triggered
    event_repo.create({
      chat_jid: "chat@g.us",
      title: "Seminar",
      start_at: clock.now() + 180 * 60_000,
      created_by: "user@s.whatsapp.net",
      now_ms: clock.now(),
    });

    const engine = new ReminderEngine(
      event_repo,
      course_repo,
      task_repo,
      reminder_repo,
      clock,
      15
    );

    const due_list = engine.find_due_reminders_for_chat(chat);
    expect(due_list.length).toBe(1);
    expect(due_list[0]?.occurrence.source_type).toBe("task");
    expect(due_list[0]?.offset_minutes).toBe(360);

    // Disable task notification as well
    const updated_chat = chat_repo.update("chat@g.us", { notify_task: 0 })!;
    const due_list_none = engine.find_due_reminders_for_chat(updated_chat);
    expect(due_list_none.length).toBe(0);
  });
});
