import type { CommandContext } from "@/commands/types.ts";
import { format_task_list } from "@/formatters/lists.ts";
import { UserError } from "@/lib/errors.ts";
import { format_datetime, parse_datetime_input } from "@/parsing/datetime.ts";

export async function tugas_handler(ctx: CommandContext): Promise<string> {
  const { task_service, chat_service, permission_service, clock } =
    ctx.services;
  const chat_type = ctx.is_group ? "group" : "private";
  const settings = chat_service.get_or_create(ctx.chat_jid, chat_type);
  const timezone = settings.timezone;

  const raw_args = ctx.args_text.trim();
  const sub = raw_args ? raw_args.split(/\s+/)[0]?.toLowerCase() : "list";

  // 1. /tugas add <judul> | <deadline> | [matkul no] | [deskripsi]
  if (sub === "add") {
    const add_payload = raw_args.slice(3).trim();
    const parts = add_payload.split("|").map((p) => p.trim());

    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new UserError(
        "Format penambahan tugas tidak lengkap.\n" +
          "Gunakan: `/tugas add <judul> | <deadline> | [matkul no] | [deskripsi]`\n" +
          "Contoh: `/tugas add Laporan Praktikum | jumat 23:59 | 1 | Bab 1-3`"
      );
    }

    const title = parts[0];
    const deadline_str = parts[1];
    const course_seq_raw = parts[2];
    const description = parts[3] || null;

    let course_seq: number | null = null;
    if (course_seq_raw) {
      const parsed = parseInt(course_seq_raw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        course_seq = parsed;
      }
    }

    const due_at = parse_datetime_input(deadline_str, timezone, clock.nowDate());

    const created = task_service.create({
      chat_jid: ctx.chat_jid,
      chat_type,
      title,
      due_at,
      course_seq,
      description,
      created_by: ctx.sender_jid,
    });

    const formatted_deadline = format_datetime(created.due_at, timezone);

    return (
      `✅ *Tugas #${created.seq} Berhasil Ditambahkan!*\n\n` +
      `📝 Judul: *${created.title}*\n` +
      `📅 Deadline: ${formatted_deadline}\n` +
      (description ? `📄 Keterangan: ${description}\n` : "")
    );
  }

  // 2. /tugas list [all|done]
  if (sub === "list") {
    const is_all = raw_args.toLowerCase().includes("all");
    const is_done = raw_args.toLowerCase().includes("done");
    const filter = is_all ? "all" : is_done ? "done" : "open";

    const tasks = task_service.list(ctx.chat_jid, filter);
    return format_task_list(tasks, timezone, filter, clock.now());
  }

  // 3. /tugas detail <no>
  if (sub === "detail") {
    const seq_str = raw_args.split(/\s+/)[1];
    const seq = parseInt(seq_str ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor tugas yang valid. Contoh: `/tugas detail 1`."
      );
    }

    const task = task_service.get_by_seq(ctx.chat_jid, seq);
    const deadline_str = format_datetime(task.due_at, timezone);
    const status_str = task.status === "done" ? "✅ Selesai" : "⏳ Open";

    return (
      `📝 *Detail Tugas #${task.seq}*\n\n` +
      `📌 Judul: *${task.title}*\n` +
      `📚 Matkul: ${task.course_name ? `#${task.course_seq} ${task.course_name}` : "-"}\n` +
      `📅 Deadline: ${deadline_str}\n` +
      `⚡ Status: ${status_str}\n` +
      `📄 Keterangan: ${task.description ?? "-"}\n` +
      `👤 Dibuat oleh: @${task.created_by.split("@")[0]}`
    );
  }

  // 4. /tugas done <no>
  if (sub === "done" || sub === "selesai") {
    const seq_str = raw_args.split(/\s+/)[1];
    const seq = parseInt(seq_str ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor tugas yang valid. Contoh: `/tugas done 1`."
      );
    }

    const task = task_service.get_by_seq(ctx.chat_jid, seq);

    const allowed = permission_service.can_modify_item({
      user_jid: ctx.sender_jid,
      item_created_by: task.created_by,
      is_group_admin: ctx.is_admin,
    });
    if (!allowed) {
      throw new UserError(
        "Hanya pembuat tugas atau admin yang dapat mengubah status tugas ini."
      );
    }

    task_service.mark_status(ctx.chat_jid, seq, "done", ctx.sender_jid);
    return `🎉 Tugas #${seq} (*${task.title}*) ditandai sebagai *SELESAI*!`;
  }

  // 5. /tugas undone <no>
  if (sub === "undone") {
    const seq_str = raw_args.split(/\s+/)[1];
    const seq = parseInt(seq_str ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor tugas yang valid. Contoh: `/tugas undone 1`."
      );
    }

    const task = task_service.get_by_seq(ctx.chat_jid, seq);

    const allowed = permission_service.can_modify_item({
      user_jid: ctx.sender_jid,
      item_created_by: task.created_by,
      is_group_admin: ctx.is_admin,
    });
    if (!allowed) {
      throw new UserError(
        "Hanya pembuat tugas atau admin yang dapat mengubah status tugas ini."
      );
    }

    task_service.mark_status(ctx.chat_jid, seq, "open", ctx.sender_jid);
    return `⏳ Tugas #${seq} (*${task.title}*) dikembalikan ke status *OPEN*.`;
  }

  // 6. /tugas edit <no> <field>=<nilai> ...
  if (sub === "edit") {
    const edit_parts = raw_args.slice(4).trim().split(/\s+/);
    const seq = parseInt(edit_parts[0] ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor tugas yang valid. Contoh: `/tugas edit 1 deadline=besok 23:59`."
      );
    }

    const task = task_service.get_by_seq(ctx.chat_jid, seq);

    const allowed = permission_service.can_modify_item({
      user_jid: ctx.sender_jid,
      item_created_by: task.created_by,
      is_group_admin: ctx.is_admin,
    });
    if (!allowed) {
      throw new UserError(
        "Hanya pembuat tugas atau admin yang dapat mengubah tugas ini."
      );
    }

    const flag_string = raw_args.slice(raw_args.indexOf(String(seq)) + String(seq).length).trim();
    if (!flag_string) {
      throw new UserError(
        "Harap sertakan field yang ingin diubah. Contoh: `/tugas edit 1 deadline=besok 23:59 matkul=2`."
      );
    }

    const updates: {
      title?: string;
      due_at?: number;
      course_seq?: number | null;
      description?: string;
    } = {};

    const matches = flag_string.matchAll(/([a-zA-Z_]+)=([^=]+)(?=\s+[a-zA-Z_]+=|$)/g);
    for (const match of matches) {
      const field = match[1]?.toLowerCase();
      const val = match[2]?.trim();
      if (!field || !val) continue;

      if (field === "judul" || field === "title") {
        updates.title = val;
      } else if (field === "deadline" || field === "waktu" || field === "due") {
        updates.due_at = parse_datetime_input(val, timezone, clock.nowDate());
      } else if (field === "matkul" || field === "course") {
        updates.course_seq = val === "none" || val === "null" ? null : parseInt(val, 10);
      } else if (field === "deskripsi" || field === "desc") {
        updates.description = val;
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new UserError(
        "Tidak ada field yang dikenali untuk diubah.\n" +
          "Field yang didukung: `judul`, `deadline`, `matkul`, `deskripsi`."
      );
    }

    const updated = task_service.update({
      chat_jid: ctx.chat_jid,
      seq,
      ...updates,
    });

    return `✅ Tugas #${seq} berhasil diperbarui: *${updated.title}*.`;
  }

  // 7. /tugas delete <no>
  if (sub === "delete" || sub === "hapus") {
    const seq_str = raw_args.split(/\s+/)[1];
    const seq = parseInt(seq_str ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor tugas yang valid. Contoh: `/tugas delete 1`."
      );
    }

    const task = task_service.get_by_seq(ctx.chat_jid, seq);

    const allowed = permission_service.can_modify_item({
      user_jid: ctx.sender_jid,
      item_created_by: task.created_by,
      is_group_admin: ctx.is_admin,
    });
    if (!allowed) {
      throw new UserError(
        "Hanya pembuat tugas atau admin yang dapat menghapus tugas ini."
      );
    }

    task_service.delete(ctx.chat_jid, seq);
    return `🗑️ Tugas #${seq} (*${task.title}*) berhasil dihapus.`;
  }

  throw new UserError(
    `Subcommand \`/tugas ${sub}\` tidak dikenali.\n` +
      `Pilihan:\n` +
      `• \`/tugas add <judul> | <deadline> | [no matkul] | [deskripsi]\`\n` +
      `• \`/tugas list [all|done]\`\n` +
      `• \`/tugas detail <no>\`\n` +
      `• \`/tugas edit <no> field=nilai\`\n` +
      `• \`/tugas done <no>\`\n` +
      `• \`/tugas undone <no>\`\n` +
      `• \`/tugas delete <no>\``
  );
}
