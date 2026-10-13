import type { CommandContext } from "@/commands/types.ts";
import { UserError } from "@/lib/errors.ts";
import { logger } from "@/lib/logger.ts";
import { format_datetime } from "@/parsing/datetime.ts";
import { group_cache } from "@/wa/group-cache.ts";
import { message_sender } from "@/wa/sender.ts";

export async function testnotif_handler(
  ctx: CommandContext
): Promise<string> {
  const { chat_service, permission_service, clock } = ctx.services;
  const chat_type = ctx.is_group ? "group" : "private";

  // Verifikasi izin: hanya admin grup atau superadmin jika di grup
  const allowed = permission_service.can_manage_settings({
    user_jid: ctx.sender_jid,
    is_group: ctx.is_group,
    is_group_admin: ctx.is_admin,
  });
  if (!allowed) {
    throw new UserError(
      "Hanya admin grup atau superadmin yang dapat menjalankan uji coba notifikasi."
    );
  }

  const settings = chat_service.get_or_create(ctx.chat_jid, chat_type);
  const sock = ctx.sock;

  const parsed_delay = Number.parseInt(ctx.args_text.trim(), 10);
  const delay_seconds =
    !Number.isNaN(parsed_delay) && parsed_delay > 0 ? parsed_delay : 30;

  // Jadwalkan pengiriman simulasi reminder 30 detik kemudian
  const timer = setTimeout(async () => {
    if (!sock) {
      logger.warn({
        event: "testnotif_aborted_no_socket",
        chat_jid: ctx.chat_jid,
      });
      return;
    }

    try {
      const now_ms = clock.now();
      const time_str = format_datetime(now_ms, settings.timezone);

      const lines = [
        "⏰ *Pengingat Uji Coba (Test Notification)*",
        "*Simulasi Pengingat Jadwal & Tag*",
        `📅 ${time_str}`,
        "⏳ Waktu kuliah telah tiba!",
        `📍 Lokasi: ${ctx.is_group ? "Grup WhatsApp" : "Chat Pribadi"}`,
        `📝 Info: Ini adalah pesan simulasi pengingat ${delay_seconds} detik.`,
      ];

      if (settings.mention_mode === "visible") {
        lines.push("\n@semua");
      }

      let mentions: string[] = [];

      if (settings.mention_mode !== "none") {
        if (ctx.is_group) {
          const metadata = await group_cache.get_group_metadata(
            sock,
            ctx.chat_jid
          );
          if (metadata) {
            const bot_jid = sock.user?.id ? sock.user.id.split(":")[0] : "";
            mentions = metadata.participants
              .map((p) => p.id)
              .filter((id) => !bot_jid || !id.includes(bot_jid));
          }
        } else {
          mentions = [ctx.chat_jid];
        }
      }

      await message_sender.send_text(
        sock,
        ctx.chat_jid,
        lines.join("\n"),
        mentions
      );

      logger.info({
        event: "testnotif_dispatched",
        chat_jid: ctx.chat_jid,
        mention_mode: settings.mention_mode,
        mentions_count: mentions.length,
      });
    } catch (err) {
      logger.error({
        event: "testnotif_dispatch_failed",
        chat_jid: ctx.chat_jid,
        error: String(err),
      });
    }
  }, delay_seconds * 1000);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return (
    `⏱️ *Uji coba notifikasi dimulai!*\n\n` +
    `Bot akan mengirimkan pesan pengingat simulasi dalam *${delay_seconds} detik*.\n` +
    `• Mode Tag: *${settings.mention_mode}*\n` +
    `• Target: ${ctx.is_group ? "Semua anggota grup" : "Chat pribadi"}\n\n` +
    `_Pastikan notifikasi bot tidak dibisukan (mute) untuk melihat hasil tag._`
  );
}
