import type { CommandContext } from "@/commands/types.ts";
import { adminonly_handler } from "@/commands/adminonly.ts";
import { testnotif_handler } from "@/commands/testnotif.ts";
import type { MentionMode } from "@/db/types.ts";
import { UserError } from "@/lib/errors.ts";
import {
  format_offset_minutes,
  parse_offsets_string,
} from "@/parsing/offsets.ts";

export async function setnotification_handler(
  ctx: CommandContext
): Promise<string> {
  const chat_type = ctx.is_group ? "group" : "private";
  const { chat_service, permission_service } = ctx.services;

  const args = ctx.args_text.trim();
  const sub = args ? args.split(/\s+/)[0]?.toLowerCase() : "";

  function assert_can_manage(): void {
    const allowed = permission_service.can_manage_settings({
      user_jid: ctx.sender_jid,
      is_group: ctx.is_group,
      is_group_admin: ctx.is_admin,
    });
    if (!allowed) {
      throw new UserError(
        "Hanya admin grup atau superadmin yang dapat mengubah pengaturan notifikasi."
      );
    }
  }

  // 1. /setnotification status
  if (sub === "status") {
    const settings = chat_service.get_or_create(ctx.chat_jid, chat_type);
    let offsets_display = "Default";
    try {
      const offsets: number[] = JSON.parse(settings.reminder_offsets);
      offsets_display = offsets.map(format_offset_minutes).join(", ");
    } catch {
      offsets_display = settings.reminder_offsets;
    }

    return (
      `⚙️ *Pengaturan Notifikasi Chat*\n\n` +
      `• Status: ${settings.notify_enabled ? "Aktif 🔔" : "Nonaktif 🔕"}\n` +
      `• Tipe Chat: ${settings.chat_type === "group" ? "Grup" : "Pribadi"}\n` +
      `• Mode Admin-Only: *${Boolean(settings.admin_only) ? "Aktif 🔒" : "Nonaktif 🔓"}*\n` +
      `• Mode Mention: *${settings.mention_mode}*\n` +
      `• Zona Waktu: *${settings.timezone}*\n` +
      `• Offset Pengingat: ${offsets_display}`
    );
  }

  // 2. /setnotification off
  if (sub === "off") {
    assert_can_manage();
    chat_service.set_notification(ctx.chat_jid, chat_type, false, ctx.sender_jid);
    return "Notifikasi pengingat dinonaktifkan untuk chat ini. 🔕";
  }

  // 3. /setnotification mention <hidden|visible|none>
  if (sub === "mention") {
    assert_can_manage();
    const mode = args.split(/\s+/)[1]?.toLowerCase();
    if (mode !== "hidden" && mode !== "visible" && mode !== "none") {
      throw new UserError(
        "Mode mention tidak valid. Pilihan: `hidden`, `visible`, atau `none`."
      );
    }
    chat_service.set_mention_mode(ctx.chat_jid, mode as MentionMode, chat_type);
    return `Gaya mention berhasil diubah menjadi: *${mode}*.`;
  }

  // 4. /setnotification offset <1d,3h,30m>
  if (sub === "offset") {
    assert_can_manage();
    const offset_str = args.slice(args.indexOf("offset") + 6).trim();
    if (!offset_str) {
      throw new UserError(
        "Harap sertakan daftar offset. Contoh: `/setnotification offset 1d,3h,30m`."
      );
    }
    const offsets = parse_offsets_string(offset_str);
    chat_service.set_offsets(ctx.chat_jid, offsets, chat_type);
    const formatted = offsets.map(format_offset_minutes).join(", ");
    return `Waktu pengingat berhasil diperbarui:\n${formatted}`;
  }

  // 5. /setnotification tz <timezone>
  if (sub === "tz" || sub === "timezone") {
    assert_can_manage();
    const tz = args.split(/\s+/)[1]?.trim();
    if (!tz) {
      throw new UserError(
        "Harap sertakan zona waktu. Contoh: `/setnotification tz Asia/Jakarta`."
      );
    }
    chat_service.set_timezone(ctx.chat_jid, tz, chat_type);
    return `Zona waktu berhasil diubah menjadi: *${tz}*.`;
  }

  // 6. /setnotification test -> Jalankan simulasi notifikasi 30 detik
  if (sub === "test") {
    return testnotif_handler(ctx);
  }

  // 7. /setnotification adminonly [on|off]
  if (sub === "adminonly") {
    const next_args = args.slice(args.indexOf("adminonly") + 9).trim();
    return adminonly_handler({
      ...ctx,
      args_text: next_args,
    });
  }

  // 8. /setnotification (tanpa argumen) -> Aktifkan
  if (!sub) {
    assert_can_manage();
    const result = chat_service.set_notification(
      ctx.chat_jid,
      chat_type,
      true,
      ctx.sender_jid
    );
    if (result.was_already_enabled) {
      return "Notifikasi pengingat sudah aktif di chat ini. 🔔";
    }
    return (
      `Notifikasi pengingat berhasil diaktifkan untuk chat ini! 🔔\n\n` +
      `Gunakan \`/setnotification status\` untuk melihat detail pengaturan.`
    );
  }

  throw new UserError(
    `Perintah \`/setnotification ${sub}\` tidak dikenali.\n` +
      `Pilihan:\n` +
      `• \`/setnotification\` (aktifkan)\n` +
      `• \`/setnotification off\` (matikan)\n` +
      `• \`/setnotification status\`\n` +
      `• \`/setnotification mention <hidden|visible|none>\`\n` +
      `• \`/setnotification offset <1d,3h,30m>\`\n` +
      `• \`/setnotification tz <Asia/Jakarta>\`\n` +
      `• \`/setnotification test\` (uji coba notifikasi)`
  );
}
