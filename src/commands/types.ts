import type { WASocket } from "@whiskeysockets/baileys";
import type { ServiceContainer } from "@/services/container.ts";

export interface CommandContext {
  chat_jid: string;
  sender_jid: string;
  is_group: boolean;
  is_admin: boolean;
  command: string;
  args_text: string;
  pipe_args: string[];
  key_value_flags: Record<string, string>;
  services: ServiceContainer;
  sock?: WASocket;
}

export type CommandHandler = (
  ctx: CommandContext
) => Promise<string | null> | string | null;

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  handler: CommandHandler;
}
