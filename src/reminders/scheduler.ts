import type { WASocket } from "@whiskeysockets/baileys";
import type { ChatRepository } from "@/db/repositories/chat.repo.ts";
import type { ReminderLogRepository } from "@/db/repositories/reminder-log.repo.ts";
import { logger } from "@/lib/logger.ts";
import type { ReminderEngine } from "@/reminders/engine.ts";
import { format_reminder_message } from "@/reminders/format.ts";
import { group_cache } from "@/wa/group-cache.ts";
import { message_sender } from "@/wa/sender.ts";

export interface ReminderSchedulerDeps {
  engine: ReminderEngine;
  chat_repo: ChatRepository;
  reminder_repo: ReminderLogRepository;
  get_socket: () => WASocket | null;
}

export class ReminderScheduler {
  private timer_id: ReturnType<typeof setInterval> | null = null;
  private align_timeout_id: ReturnType<typeof setTimeout> | null = null;
  private is_ticking = false;

  constructor(private readonly deps: ReminderSchedulerDeps) {}

  start(): void {
    if (this.timer_id || this.align_timeout_id) {
      return;
    }

    // Align to the top of the next minute
    const now = Date.now();
    const delay_until_next_minute = 60_000 - (now % 60_000);

    logger.info({
      event: "scheduler_aligning",
      delay_ms: delay_until_next_minute,
    });

    this.align_timeout_id = setTimeout(() => {
      this.align_timeout_id = null;
      this.tick();
      this.timer_id = setInterval(() => this.tick(), 60_000);
    }, delay_until_next_minute);
  }

  stop(): void {
    if (this.align_timeout_id) {
      clearTimeout(this.align_timeout_id);
      this.align_timeout_id = null;
    }
    if (this.timer_id) {
      clearInterval(this.timer_id);
      this.timer_id = null;
    }
    logger.info("Reminder scheduler stopped.");
  }

  async tick(): Promise<void> {
    if (this.is_ticking) {
      return;
    }

    this.is_ticking = true;
    const sock = this.deps.get_socket();

    if (!sock) {
      this.is_ticking = false;
      return;
    }

    try {
      const active_chats = this.deps.chat_repo.list_active_notifications();

      for (const chat of active_chats) {
        const due_reminders = this.deps.engine.find_due_reminders_for_chat(chat);

        for (const due of due_reminders) {
          const occ = due.occurrence;
          const formatted = format_reminder_message(
            occ,
            due.offset_minutes,
            chat.timezone,
            chat.mention_mode
          );

          let mentions: string[] = [];

          if (chat.mention_mode !== "none") {
            if (chat.chat_type === "group") {
              const metadata = await group_cache.get_group_metadata(
                sock,
                chat.chat_jid
              );
              if (metadata) {
                const bot_jid = sock.user?.id ? sock.user.id.split(":")[0] : "";
                mentions = metadata.participants
                  .map((p) => p.id)
                  .filter((id) => !bot_jid || !id.includes(bot_jid));
              }
            } else {
              mentions = [chat.chat_jid];
            }
          }

          try {
            await message_sender.send_text(
              sock,
              chat.chat_jid,
              formatted.text,
              mentions
            );

            this.deps.reminder_repo.record({
              chat_jid: chat.chat_jid,
              source_type: occ.source_type,
              source_id: occ.source_id,
              occurrence_at: occ.occurrence_at,
              offset_minutes: due.offset_minutes,
              status: "sent",
            });

            logger.info({
              event: "reminder_sent",
              chat_jid: chat.chat_jid,
              source_type: occ.source_type,
              source_id: occ.source_id,
              offset: due.offset_minutes,
            });
          } catch (error) {
            const error_msg =
              error instanceof Error ? error.message : String(error);

            this.deps.reminder_repo.record({
              chat_jid: chat.chat_jid,
              source_type: occ.source_type,
              source_id: occ.source_id,
              occurrence_at: occ.occurrence_at,
              offset_minutes: due.offset_minutes,
              status: "failed",
              error: error_msg,
            });

            logger.error({
              event: "reminder_send_error",
              chat_jid: chat.chat_jid,
              source_type: occ.source_type,
              source_id: occ.source_id,
              error: error_msg,
            });

            // Edge case from spec: if bot was kicked from group, disable notifications
            if (
              error_msg.includes("not-authorized") ||
              error_msg.includes("Forbidden") ||
              error_msg.includes("item-not-found")
            ) {
              logger.warn({
                event: "disabling_notification_on_forbidden_chat",
                chat_jid: chat.chat_jid,
              });
              this.deps.chat_repo.update(chat.chat_jid, { notify_enabled: 0 });
            }
          }
        }
      }
    } catch (err) {
      logger.error({
        event: "scheduler_tick_error",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.is_ticking = false;
    }
  }
}
