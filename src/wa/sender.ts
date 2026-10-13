import type { AnyMessageContent, WASocket } from "@whiskeysockets/baileys";
import { env } from "@/config/env.ts";
import { chat_logger, logger } from "@/lib/logger.ts";
import { group_cache } from "@/wa/group-cache.ts";

interface OutboundTask {
  sock: WASocket;
  jid: string;
  content: AnyMessageContent;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export class MessageSender {
  private queue: OutboundTask[] = [];
  private is_processing = false;
  private readonly delay_ms: number;

  constructor(delay_ms: number = env.SEND_DELAY_MS) {
    this.delay_ms = delay_ms;
  }

  async send(
    sock: WASocket,
    jid: string,
    content: AnyMessageContent
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({ sock, jid, content, resolve, reject });
      this.process_queue();
    });
  }

  async send_text(
    sock: WASocket,
    jid: string,
    text: string,
    mentions: string[] = []
  ): Promise<unknown> {
    return this.send(sock, jid, {
      text,
      mentions: mentions.length > 0 ? mentions : undefined,
    });
  }

  private async process_queue(): Promise<void> {
    if (this.is_processing || this.queue.length === 0) {
      return;
    }

    this.is_processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) {
        break;
      }

      try {
        const result = await task.sock.sendMessage(task.jid, task.content);
        if ("text" in task.content && typeof task.content.text === "string") {
          const is_group = task.jid.endsWith("@g.us");
          const group_name = is_group
            ? group_cache.get_cached(task.jid)?.subject
            : undefined;

          chat_logger.outgoing({
            is_group,
            chat_jid: task.jid,
            group_name,
            text: task.content.text,
          });
        }
        task.resolve(result);
      } catch (error) {
        logger.error({
          event: "message_send_failed",
          jid: task.jid,
          error: error instanceof Error ? error.message : String(error),
        });
        task.reject(error);
      }

      if (this.queue.length > 0 && this.delay_ms > 0) {
        await new Promise((res) => setTimeout(res, this.delay_ms));
      }
    }

    this.is_processing = false;
  }
}

export const message_sender = new MessageSender();
