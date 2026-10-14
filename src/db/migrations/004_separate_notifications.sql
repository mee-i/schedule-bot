-- Separate notification toggles and offsets for course, task, and event
ALTER TABLE chat_settings ADD COLUMN notify_course INTEGER NOT NULL DEFAULT 1;
ALTER TABLE chat_settings ADD COLUMN notify_task INTEGER NOT NULL DEFAULT 1;
ALTER TABLE chat_settings ADD COLUMN notify_event INTEGER NOT NULL DEFAULT 1;

ALTER TABLE chat_settings ADD COLUMN course_offsets TEXT NOT NULL DEFAULT '[60,30,0]';
ALTER TABLE chat_settings ADD COLUMN task_offsets TEXT NOT NULL DEFAULT '[1440,360,180,30]';
ALTER TABLE chat_settings ADD COLUMN event_offsets TEXT NOT NULL DEFAULT '[1440,180,30]';
