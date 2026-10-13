import type { ChatRepository } from "@/db/repositories/chat.repo.ts";
import type { ChatSettings, MentionMode } from "@/db/types.ts";
import type { Clock } from "@/lib/clock.ts";
import { UserError } from "@/lib/errors.ts";
import { DateTime } from "luxon";

export class ChatService {
  constructor(
    private readonly chat_repo: ChatRepository,
    private readonly clock: Clock
  ) {}

  get_or_create(
    chat_jid: string,
    chat_type: "group" | "private",
    chat_name?: string | null
  ): ChatSettings {
    const existing = this.chat_repo.find_by_jid(chat_jid);
    if (existing) {
      return existing;
    }

    return this.chat_repo.upsert({
      chat_jid,
      chat_type,
      chat_name: chat_name ?? null,
      notify_enabled: 0,
      now_ms: this.clock.now(),
    });
  }

  get_settings(chat_jid: string): ChatSettings | null {
    return this.chat_repo.find_by_jid(chat_jid);
  }

  set_notification(
    chat_jid: string,
    chat_type: "group" | "private",
    enabled: boolean,
    user_jid: string
  ): { settings: ChatSettings; was_already_enabled: boolean } {
    const existing = this.get_or_create(chat_jid, chat_type);
    const was_already_enabled = Boolean(existing.notify_enabled) === enabled;

    const updated = this.chat_repo.upsert({
      chat_jid,
      chat_type,
      notify_enabled: enabled ? 1 : 0,
      set_by: user_jid,
      now_ms: this.clock.now(),
    });

    return { settings: updated, was_already_enabled };
  }

  set_mention_mode(
    chat_jid: string,
    mode: MentionMode,
    chat_type: "group" | "private" = "group"
  ): ChatSettings {
    this.get_or_create(chat_jid, chat_type);
    const updated = this.chat_repo.update(chat_jid, {
      mention_mode: mode,
      now_ms: this.clock.now(),
    });
    if (!updated) {
      throw new UserError("Pengaturan chat belum ditemukan.");
    }
    return updated;
  }

  set_offsets(
    chat_jid: string,
    offsets: number[],
    chat_type: "group" | "private" = "group"
  ): ChatSettings {
    this.get_or_create(chat_jid, chat_type);
    const json_str = JSON.stringify(offsets);
    const updated = this.chat_repo.update(chat_jid, {
      reminder_offsets: json_str,
      now_ms: this.clock.now(),
    });
    if (!updated) {
      throw new UserError("Pengaturan chat belum ditemukan.");
    }
    return updated;
  }

  set_timezone(
    chat_jid: string,
    timezone: string,
    chat_type: "group" | "private" = "group"
  ): ChatSettings {
    const dt = DateTime.now().setZone(timezone);
    if (!dt.isValid) {
      throw new UserError(`Zona waktu "${timezone}" tidak valid.`);
    }

    this.get_or_create(chat_jid, chat_type);
    const updated = this.chat_repo.update(chat_jid, {
      timezone,
      now_ms: this.clock.now(),
    });
    if (!updated) {
      throw new UserError("Pengaturan chat belum ditemukan.");
    }
    return updated;
  }

  set_admin_only(
    chat_jid: string,
    enabled: boolean,
    chat_type: "group" | "private" = "group"
  ): ChatSettings {
    this.get_or_create(chat_jid, chat_type);
    const updated = this.chat_repo.update(chat_jid, {
      admin_only: enabled ? 1 : 0,
      now_ms: this.clock.now(),
    });
    if (!updated) {
      throw new UserError("Pengaturan chat belum ditemukan.");
    }
    return updated;
  }

  list_active(): ChatSettings[] {
    return this.chat_repo.list_active_notifications();
  }
}
