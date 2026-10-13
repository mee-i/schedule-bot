import type { CommandContext } from "@/commands/types.ts";

export async function ping_handler(_ctx: CommandContext): Promise<string> {
  return "Pong! Bot aktif 🏓";
}
