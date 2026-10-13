export type ChatType = "group" | "private";
export type MentionMode = "hidden" | "visible" | "none";
export type TaskStatus = "open" | "done";
export type SourceType = "event" | "course" | "task";
export type ReminderLogStatus = "sent" | "failed";

export interface ChatSettings {
  chat_jid: string;
  chat_type: ChatType;
  chat_name: string | null;
  notify_enabled: number; // 0 or 1
  admin_only: number; // 0 or 1
  mention_mode: MentionMode;
  timezone: string;
  reminder_offsets: string; // JSON array of numbers: e.g. "[1440,180,30]"
  digest_time: string | null;
  set_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface Course {
  id: number;
  chat_jid: string;
  seq: number;
  name: string;
  day_of_week: number; // 1 = Monday .. 7 = Sunday
  start_time: string; // HH:mm
  end_time: string | null;
  room: string | null;
  lecturer: string | null;
  active: number; // 0 or 1
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface Event {
  id: number;
  chat_jid: string;
  seq: number;
  title: string;
  description: string | null;
  location: string | null;
  start_at: number; // epoch ms UTC
  end_at: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface Task {
  id: number;
  chat_jid: string;
  seq: number;
  course_id: number | null;
  title: string;
  description: string | null;
  due_at: number; // epoch ms UTC
  status: TaskStatus;
  done_by: string | null;
  done_at: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface TaskWithCourse extends Task {
  course_name?: string | null;
  course_seq?: number | null;
}

export interface ReminderLog {
  id: number;
  chat_jid: string;
  source_type: SourceType;
  source_id: number;
  occurrence_at: number;
  offset_minutes: number;
  status: ReminderLogStatus;
  error: string | null;
  sent_at: number;
}
