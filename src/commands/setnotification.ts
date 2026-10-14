import type { CommandContext } from "@/commands/types.ts";
import { adminonly_handler } from "@/commands/adminonly.ts";
import { testnotif_handler } from "@/commands/testnotif.ts";
import type { MentionMode, NotificationCategory } from "@/db/types.ts";
import { UserError } from "@/lib/errors.ts";
import {
  format_offset_minutes,
  parse_offsets_string,
} from "@/parsing/offsets.ts";

const CATEGORY_MAP: Record<
  string,
  { key: NotificationCategory; label: string; default_offsets: number[] }
> = {
  matkul: {
    key: "course",
    label: "Jadwal Kuliah (Matkul)",
    default_offsets: [60, 30, 0],
  },
  course: {
    key: "course",
    label: "Jadwal Kuliah (Matkul)",
    default_offsets: [60, 30, 0],
  },
  tugas: {
    key: "task",
    label: "Tugas",
    default_offsets: [1440, 360, 180, 30],
  },
  task: {
    key: "task",
    label: "Tugas",
    default_offsets: [1440, 360, 180, 30],
  },
  event: {
    key: "event",
    label: "Agenda (Event)",
    default_offsets: [1440, 180, 30],
  },
};

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

    const format_cat_offsets = (
      raw: string | undefined,
      fallback: number[]
    ): string => {
      let offsets = fallback;
      try {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            offsets = parsed;
          }
        }
      } catch {
        // fallback
      }
      return offsets.map(format_offset_minutes).join(", ");
    };

    const course_active = Boolean(settings.notify_course ?? 1);
    const task_active = Boolean(settings.notify_task ?? 1);
    const event_active = Boolean(settings.notify_event ?? 1);

    return (
      `⚙️ *Pengaturan Notifikasi Chat*\n\n` +
      `• Master Status: ${settings.notify_enabled ? "Aktif 🔔" : "Nonaktif 🔕"}\n` +
      `• Tipe Chat: ${settings.chat_type === "group" ? "Grup" : "Pribadi"}\n` +
      `• Mode Admin-Only: *${Boolean(settings.admin_only) ? "Aktif 🔒" : "Nonaktif 🔓"}*\n` +
      `• Mode Mention: *${settings.mention_mode}*\n` +
      `• Zona Waktu: *${settings.timezone}*\n\n` +
      `📚 *Jadwal Kuliah (Matkul)*:\n` +
      `  • Notifikasi: ${course_active ? "Aktif ✅" : "Nonaktif ❌"}\n` +
      `  • Offset: ${format_cat_offsets(settings.course_offsets, [60, 30, 0])}\n\n` +
      `📝 *Tugas (Deadline)*:\n` +
      `  • Notifikasi: ${task_active ? "Aktif ✅" : "Nonaktif ❌"}\n` +
      `  • Offset: ${format_cat_offsets(settings.task_offsets, [1440, 360, 180, 30])}\n\n` +
      `📌 *Agenda (Event)*:\n` +
      `  • Notifikasi: ${event_active ? "Aktif ✅" : "Nonaktif ❌"}\n` +
      `  • Offset: ${format_cat_offsets(settings.event_offsets, [1440, 180, 30])}`
    );
  }

  // 2. /setnotification off
  if (sub === "off") {
    assert_can_manage();
    chat_service.set_notification(ctx.chat_jid, chat_type, false, ctx.sender_jid);
    return "Notifikasi pengingat dinonaktifkan untuk chat ini. 🔕";
  }

  // 3. /setnotification <matkul|tugas|event> ...
  const cat = CATEGORY_MAP[sub];
  if (cat) {
    assert_can_manage();
    const parts = args.split(/\s+/);
    const action = parts[1]?.toLowerCase();

    if (action === "on") {
      const existing = chat_service.get_or_create(ctx.chat_jid, chat_type);
      if (!existing.notify_enabled) {
        chat_service.set_notification(
          ctx.chat_jid,
          chat_type,
          true,
          ctx.sender_jid
        );
      }
      chat_service.set_category_notification(
        ctx.chat_jid,
        cat.key,
        true,
        chat_type
      );
      return `Notifikasi pengingat untuk *${cat.label}* berhasil *diaktifkan* 🔔`;
    }

    if (action === "off") {
      chat_service.set_category_notification(
        ctx.chat_jid,
        cat.key,
        false,
        chat_type
      );
      return `Notifikasi pengingat untuk *${cat.label}* berhasil *dinonaktifkan* 🔕`;
    }

    if (action === "offset") {
      const offset_idx = args.indexOf("offset");
      const offset_str = args.slice(offset_idx + 6).trim();
      if (!offset_str) {
        throw new UserError(
          `Harap sertakan daftar offset. Contoh: \`/setnotification ${sub} offset 1h,30m,0m\`.`
        );
      }
      const offsets = parse_offsets_string(offset_str);
      chat_service.set_category_offsets(
        ctx.chat_jid,
        cat.key,
        offsets,
        chat_type
      );
      const formatted = offsets.map(format_offset_minutes).join(", ");
      return `Waktu pengingat untuk *${cat.label}* berhasil diperbarui:\n${formatted}`;
    }

    throw new UserError(
      `Aksi untuk kategori *${sub}* tidak valid.\n` +
        `Pilihan:\n` +
        `• \`/setnotification ${sub} on\`\n` +
        `• \`/setnotification ${sub} off\`\n` +
        `• \`/setnotification ${sub} offset <daftar offset>\``
    );
  }

  // 4. /setnotification mention <hidden|visible|none>
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

  // 5. /setnotification offset <1d,3h,30m> (Global / legacy)
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

  // 6. /setnotification tz <timezone>
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

  // 7. /setnotification test -> Jalankan simulasi notifikasi 30 detik
  if (sub === "test") {
    return testnotif_handler(ctx);
  }

  // 8. /setnotification adminonly [on|off]
  if (sub === "adminonly") {
    const next_args = args.slice(args.indexOf("adminonly") + 9).trim();
    return adminonly_handler({
      ...ctx,
      args_text: next_args,
    });
  }

  // 9. /setnotification (tanpa argumen) -> Aktifkan master
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
      `• \`/setnotification\` (aktifkan master)\n` +
      `• \`/setnotification off\` (matikan master)\n` +
      `• \`/setnotification status\`\n` +
      `• \`/setnotification <matkul|tugas|event> <on|off>\`\n` +
      `• \`/setnotification <matkul|tugas|event> offset <daftar offset>\`\n` +
      `• \`/setnotification mention <hidden|visible|none>\`\n` +
      `• \`/setnotification offset <1d,3h,30m>\` (semua kategori)\n` +
      `• \`/setnotification tz <Asia/Jakarta>\`\n` +
      `• \`/setnotification test\` (uji coba notifikasi)`
  );
}
