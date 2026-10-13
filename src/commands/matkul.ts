import type { CommandContext } from "@/commands/types.ts";
import { format_course_list } from "@/formatters/lists.ts";
import { UserError } from "@/lib/errors.ts";
import {
  format_day_of_week,
  parse_day_of_week,
  parse_time_range,
} from "@/parsing/datetime.ts";

export async function matkul_handler(ctx: CommandContext): Promise<string> {
  const { course_service, permission_service } = ctx.services;
  const chat_type = ctx.is_group ? "group" : "private";

  const raw_args = ctx.args_text.trim();
  const sub = raw_args ? raw_args.split(/\s+/)[0]?.toLowerCase() : "list";

  // 1. /matkul add <nama> | <hari> | <mulai>-<selesai> | [ruang] | [dosen]
  if (sub === "add") {
    const add_payload = raw_args.slice(3).trim();
    const parts = add_payload.split("|").map((p) => p.trim());

    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new UserError(
        "Format penambahan mata kuliah tidak lengkap.\n" +
          "Gunakan: `/matkul add <nama> | <hari> | <mulai-selesai> | [ruang] | [dosen]`\n" +
          "Contoh: `/matkul add Basis Data | senin | 08:00-10:30 | Lab 2 | Pak Budi`"
      );
    }

    const name = parts[0];
    const day_of_week = parse_day_of_week(parts[1]);
    const { start_time, end_time } = parse_time_range(parts[2]);
    const room = parts[3] || null;
    const lecturer = parts[4] || null;

    const created = course_service.create({
      chat_jid: ctx.chat_jid,
      chat_type,
      name,
      day_of_week,
      start_time,
      end_time,
      room,
      lecturer,
      created_by: ctx.sender_jid,
    });

    const day_str = format_day_of_week(created.day_of_week);
    const time_str = created.end_time
      ? `${created.start_time} - ${created.end_time}`
      : created.start_time;

    return (
      `✅ *Mata Kuliah #${created.seq} Berhasil Ditambahkan!*\n\n` +
      `📚 Nama: *${created.name}*\n` +
      `🗓️ Jadwal: ${day_str}, ${time_str}\n` +
      (created.room ? `📍 Ruang: ${created.room}\n` : "") +
      (created.lecturer ? `👨‍🏫 Dosen: ${created.lecturer}\n` : "")
    );
  }

  // 2. /matkul list
  if (sub === "list") {
    const courses = course_service.list(ctx.chat_jid);
    return format_course_list(courses);
  }

  // 3. /matkul detail <no>
  if (sub === "detail") {
    const seq_str = raw_args.split(/\s+/)[1];
    const seq = parseInt(seq_str ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor mata kuliah yang valid. Contoh: `/matkul detail 1`."
      );
    }

    const course = course_service.get_by_seq(ctx.chat_jid, seq);
    const day_str = format_day_of_week(course.day_of_week);
    const time_str = course.end_time
      ? `${course.start_time} - ${course.end_time}`
      : course.start_time;

    return (
      `📚 *Detail Mata Kuliah #${course.seq}*\n\n` +
      `📖 Nama: *${course.name}*\n` +
      `🗓️ Hari: ${day_str}\n` +
      `🕒 Jam: ${time_str}\n` +
      `📍 Ruangan: ${course.room ?? "-"}\n` +
      `👨‍🏫 Dosen: ${course.lecturer ?? "-"}\n` +
      `⚡ Status: ${course.active ? "Aktif" : "Nonaktif"}\n` +
      `👤 Ditambahkan oleh: @${course.created_by.split("@")[0]}`
    );
  }

  // 4. /matkul edit <no> <field>=<nilai> ...
  if (sub === "edit") {
    const edit_parts = raw_args.slice(4).trim().split(/\s+/);
    const seq = parseInt(edit_parts[0] ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor mata kuliah yang valid. Contoh: `/matkul edit 1 ruang=Lab 3`."
      );
    }

    const course = course_service.get_by_seq(ctx.chat_jid, seq);

    const allowed = permission_service.can_modify_item({
      user_jid: ctx.sender_jid,
      item_created_by: course.created_by,
      is_group_admin: ctx.is_admin,
    });
    if (!allowed) {
      throw new UserError(
        "Hanya pembuat mata kuliah atau admin yang dapat mengubah item ini."
      );
    }

    const flag_string = raw_args.slice(raw_args.indexOf(String(seq)) + String(seq).length).trim();
    if (!flag_string) {
      throw new UserError(
        "Harap sertakan field yang ingin diubah. Contoh: `/matkul edit 1 jam=09:00-11:00 ruang=Lab 3`."
      );
    }

    const updates: {
      name?: string;
      day_of_week?: number;
      start_time?: string;
      end_time?: string | null;
      room?: string | null;
      lecturer?: string | null;
    } = {};

    const matches = flag_string.matchAll(/([a-zA-Z_]+)=([^=]+)(?=\s+[a-zA-Z_]+=|$)/g);
    for (const match of matches) {
      const field = match[1]?.toLowerCase();
      const val = match[2]?.trim();
      if (!field || !val) continue;

      if (field === "nama" || field === "name") {
        updates.name = val;
      } else if (field === "hari" || field === "day") {
        updates.day_of_week = parse_day_of_week(val);
      } else if (field === "jam" || field === "time") {
        const { start_time, end_time } = parse_time_range(val);
        updates.start_time = start_time;
        updates.end_time = end_time;
      } else if (field === "ruang" || field === "room") {
        updates.room = val;
      } else if (field === "dosen" || field === "lecturer") {
        updates.lecturer = val;
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new UserError(
        "Tidak ada field yang dikenali untuk diubah.\n" +
          "Field yang didukung: `nama`, `hari`, `jam`, `ruang`, `dosen`."
      );
    }

    const updated = course_service.update({
      chat_jid: ctx.chat_jid,
      seq,
      ...updates,
    });

    return `✅ Mata Kuliah #${seq} berhasil diperbarui: *${updated.name}*.`;
  }

  // 5. /matkul delete <no>
  if (sub === "delete" || sub === "hapus") {
    const seq_str = raw_args.split(/\s+/)[1];
    const seq = parseInt(seq_str ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor mata kuliah yang valid. Contoh: `/matkul delete 1`."
      );
    }

    const course = course_service.get_by_seq(ctx.chat_jid, seq);

    const allowed = permission_service.can_modify_item({
      user_jid: ctx.sender_jid,
      item_created_by: course.created_by,
      is_group_admin: ctx.is_admin,
    });
    if (!allowed) {
      throw new UserError(
        "Hanya pembuat mata kuliah atau admin yang dapat menghapus item ini."
      );
    }

    course_service.delete(ctx.chat_jid, seq);
    return `🗑️ Mata Kuliah #${seq} (*${course.name}*) berhasil dihapus.`;
  }

  throw new UserError(
    `Subcommand \`/matkul ${sub}\` tidak dikenali.\n` +
      `Pilihan:\n` +
      `• \`/matkul add <nama> | <hari> | <mulai-selesai> | [ruang] | [dosen]\`\n` +
      `• \`/matkul list\`\n` +
      `• \`/matkul detail <no>\`\n` +
      `• \`/matkul edit <no> field=nilai\`\n` +
      `• \`/matkul delete <no>\``
  );
}
