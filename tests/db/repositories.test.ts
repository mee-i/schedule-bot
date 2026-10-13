import { beforeEach, describe, expect, it } from "bun:test";
import { create_database } from "@/db/client.ts";
import { run_migrations } from "@/db/migrate.ts";
import { ChatRepository } from "@/db/repositories/chat.repo.ts";
import { CourseRepository } from "@/db/repositories/course.repo.ts";
import { EventRepository } from "@/db/repositories/event.repo.ts";
import { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import { TaskRepository } from "@/db/repositories/task.repo.ts";

describe("Database Repositories", () => {
  let db: ReturnType<typeof create_database>;
  let chat_repo: ChatRepository;
  let event_repo: EventRepository;
  let course_repo: CourseRepository;
  let task_repo: TaskRepository;
  let reminder_repo: ReminderLogRepository;

  beforeEach(() => {
    db = create_database(":memory:");
    run_migrations(db);
    chat_repo = new ChatRepository(db);
    event_repo = new EventRepository(db);
    course_repo = new CourseRepository(db);
    task_repo = new TaskRepository(db);
    reminder_repo = new ReminderLogRepository(db);
  });

  it("chat_repo upsert and find_by_jid", () => {
    const chat = chat_repo.upsert({
      chat_jid: "123@g.us",
      chat_type: "group",
      chat_name: "Test Group",
      notify_enabled: 1,
    });

    expect(chat.chat_jid).toBe("123@g.us");
    expect(chat.notify_enabled).toBe(1);
    expect(chat.timezone).toBe("Asia/Jakarta");

    const found = chat_repo.find_by_jid("123@g.us");
    expect(found).not.toBeNull();
    expect(found?.chat_name).toBe("Test Group");

    const active = chat_repo.list_active_notifications();
    expect(active.length).toBe(1);
  });

  it("event_repo manages sequential per-chat seq independently", () => {
    chat_repo.upsert({ chat_jid: "groupA@g.us", chat_type: "group" });
    chat_repo.upsert({ chat_jid: "groupB@g.us", chat_type: "group" });

    const event_a1 = event_repo.create({
      chat_jid: "groupA@g.us",
      title: "Event A1",
      start_at: 1_000_000,
      created_by: "user1@s.whatsapp.net",
    });
    const event_a2 = event_repo.create({
      chat_jid: "groupA@g.us",
      title: "Event A2",
      start_at: 2_000_000,
      created_by: "user1@s.whatsapp.net",
    });
    const event_b1 = event_repo.create({
      chat_jid: "groupB@g.us",
      title: "Event B1",
      start_at: 1_500_000,
      created_by: "user2@s.whatsapp.net",
    });

    expect(event_a1.seq).toBe(1);
    expect(event_a2.seq).toBe(2);
    expect(event_b1.seq).toBe(1);

    const list_a = event_repo.list_by_chat("groupA@g.us", true, 0);
    expect(list_a.length).toBe(2);

    const updated = event_repo.update("groupA@g.us", 1, {
      title: "Updated Event A1",
    });
    expect(updated?.title).toBe("Updated Event A1");

    const deleted = event_repo.delete("groupA@g.us", 1);
    expect(deleted?.title).toBe("Updated Event A1");
    expect(event_repo.find_by_seq("groupA@g.us", 1)).toBeNull();
  });

  it("course_repo and task_repo with foreign key cascade/set null", () => {
    chat_repo.upsert({ chat_jid: "group@g.us", chat_type: "group" });

    const course = course_repo.create({
      chat_jid: "group@g.us",
      name: "Algoritma",
      day_of_week: 1,
      start_time: "08:00",
      created_by: "user@s.whatsapp.net",
    });
    expect(course.seq).toBe(1);

    const task = task_repo.create({
      chat_jid: "group@g.us",
      course_id: course.id,
      title: "Tugas 1",
      due_at: 1_800_000,
      created_by: "user@s.whatsapp.net",
    });
    expect(task.seq).toBe(1);
    expect(task.status).toBe("open");

    const task_with_course = task_repo.find_by_seq("group@g.us", 1);
    expect(task_with_course?.course_name).toBe("Algoritma");

    task_repo.mark_status(
      "group@g.us",
      1,
      "done",
      "user@s.whatsapp.net",
      Date.now()
    );
    const completed_task = task_repo.find_by_seq("group@g.us", 1);
    expect(completed_task?.status).toBe("done");

    // Deleting course sets task.course_id to null
    course_repo.delete("group@g.us", 1);
    const task_after_course_delete = task_repo.find_by_seq("group@g.us", 1);
    expect(task_after_course_delete?.course_id).toBeNull();
  });

  it("reminder_log idempotency and deletion", () => {
    const chat_jid = "chat@g.us";
    const logged_before = reminder_repo.is_already_logged("event", 10, 5000, 30);
    expect(logged_before).toBe(false);

    reminder_repo.record({
      chat_jid,
      source_type: "event",
      source_id: 10,
      occurrence_at: 5000,
      offset_minutes: 30,
      status: "sent",
    });

    const logged_after = reminder_repo.is_already_logged("event", 10, 5000, 30);
    expect(logged_after).toBe(true);

    // Recording duplicate fails unique constraint
    expect(() => {
      reminder_repo.record({
        chat_jid,
        source_type: "event",
        source_id: 10,
        occurrence_at: 5000,
        offset_minutes: 30,
        status: "sent",
      });
    }).toThrow();

    reminder_repo.delete_by_source("event", 10);
    expect(reminder_repo.is_already_logged("event", 10, 5000, 30)).toBe(false);
  });
});
