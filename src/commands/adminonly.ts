import type { CommandContext } from "@/commands/types.ts";
import { UserError } from "@/lib/errors.ts";

export async function adminonly_handler(
  ctx: CommandContext
): Promise<string> {
  const { chat_service, permission_service } = ctx.services;

  if (!ctx.is_group) {
    throw new UserError(
      "Perintah `/adminonly` hanya dapat digunakan di grup WhatsApp."
    );
  }

  const sub = ctx.args_text.trim().toLowerCase();

  // 1. /adminonly status (atau tanpa argumen)
  if (!sub || sub === "status") {
    const settings = chat_service.get_or_create(ctx.chat_jid, "group");
    const is_active = Boolean(settings.admin_only);

    return (
      `🛡️ *Pengaturan Mode Admin-Only*\n\n` +
      `• Status: *${is_active ? "Aktif 🔒" : "Nonaktif 🔓"}*\n` +
      `• Keterangan: ${
        is_active
          ? "Hanya admin grup yang dapat menggunakan perintah bot di grup ini."
          : "Seluruh anggota grup dapat menggunakan perintah bot."
      }\n\n` +
      `_Gunakan \`/adminonly on\` untuk mengaktifkan atau \`/adminonly off\` untuk menonaktifkan._`
    );
  }

  // Verifikasi izin: hanya admin grup atau superadmin
  const allowed = permission_service.can_manage_settings({
    user_jid: ctx.sender_jid,
    is_group: ctx.is_group,
    is_group_admin: ctx.is_admin,
  });
  if (!allowed) {
    throw new UserError(
      "Hanya admin grup atau superadmin yang dapat mengubah pengaturan admin-only."
    );
  }

  // 2. /adminonly on / enable / 1
  if (sub === "on" || sub === "enable" || sub === "1") {
    chat_service.set_admin_only(ctx.chat_jid, true, "group");
    return (
      `🔒 *Mode Admin-Only Diaktifkan!*\n\n` +
      `Mulai sekarang, seluruh perintah bot di grup ini dibatasi hanya untuk admin grup.`
    );
  }

  // 3. /adminonly off / disable / 0
  if (sub === "off" || sub === "disable" || sub === "0") {
    chat_service.set_admin_only(ctx.chat_jid, false, "group");
    return (
      `🔓 *Mode Admin-Only Dinonaktifkan!*\n\n` +
      `Seluruh anggota grup sekarang dapat menggunakan perintah bot kembali.`
    );
  }

  throw new UserError(
    "Argumen tidak valid.\n" +
      "Gunakan: `/adminonly [on|off|status]`\n" +
      "Contoh: `/adminonly on`"
  );
}
