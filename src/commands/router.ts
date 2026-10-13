import type { WASocket } from "@whiskeysockets/baileys";
import { env } from "@/config/env.ts";
import { UserError } from "@/lib/errors.ts";
import { logger } from "@/lib/logger.ts";
import {
  extract_command_and_args,
  parse_key_value_flags,
  split_pipe_args,
} from "@/parsing/args.ts";
import type { CommandContext, CommandHandler } from "@/commands/types.ts";
import type { ServiceContainer } from "@/services/container.ts";

export class CommandRouter {
  private readonly handlers = new Map<string, CommandHandler>();

  constructor(private readonly services: ServiceContainer) {}

  register(command: string, handler: CommandHandler): void {
    this.handlers.set(command.toLowerCase(), handler);
  }

  has(command: string): boolean {
    return this.handlers.has(command.toLowerCase());
  }

  async dispatch(params: {
    raw_text: string;
    chat_jid: string;
    sender_jid: string;
    is_group: boolean;
    is_admin?: boolean;
    sock?: WASocket;
  }): Promise<string | null> {
    const extracted = extract_command_and_args(
      params.raw_text,
      env.COMMAND_PREFIX
    );
    if (!extracted) {
      return null;
    }

    const handler = this.handlers.get(extracted.command);
    if (!handler) {
      return null;
    }

    const pipe_args = split_pipe_args(extracted.args_text);
    const { flags: key_value_flags } = parse_key_value_flags(
      extracted.args_text
    );

    const is_admin =
      params.is_admin ??
      (!params.is_group ||
        this.services.permission_service.is_super_admin(params.sender_jid));

    // Periksa apakah chat grup dalam mode admin-only
    if (params.is_group) {
      const settings = this.services.chat_service.get_settings(params.chat_jid);
      if (settings && Boolean(settings.admin_only)) {
        const can_use = this.services.permission_service.can_use_bot({
          user_jid: params.sender_jid,
          is_group: true,
          is_group_admin: is_admin,
          admin_only: true,
        });

        if (!can_use) {
          return "⚠️ Perintah bot di grup ini dibatasi hanya untuk admin grup.";
        }
      }
    }

    const ctx: CommandContext = {
      chat_jid: params.chat_jid,
      sender_jid: params.sender_jid,
      is_group: params.is_group,
      is_admin,
      command: extracted.command,
      args_text: extracted.args_text,
      pipe_args,
      key_value_flags,
      services: this.services,
      sock: params.sock,
    };

    try {
      return await handler(ctx);
    } catch (error) {
      if (error instanceof UserError) {
        return `⚠️ ${error.message}`;
      }

      logger.error({
        event: "command_execution_error",
        command: extracted.command,
        chat_jid: params.chat_jid,
        sender_jid: params.sender_jid,
        error: error instanceof Error ? error.message : String(error),
      });

      return "Terjadi kesalahan sistem saat memproses perintah Anda. Silakan coba lagi nanti.";
    }
  }
}
