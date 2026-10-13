import type { CommandContext } from "@/commands/types.ts";
import { format_event_list } from "@/formatters/lists.ts";
import { UserError } from "@/lib/errors.ts";
import { format_datetime, parse_datetime_input } from "@/parsing/datetime.ts";

export async function event_handler(ctx: CommandContext): Promise<string> {
  const { event_service, chat_service, permission_service, clock } =
    ctx.services;
  const chat_type = ctx.is_group ? "group" : "private";
  const settings = chat_service.get_or_create(ctx.chat_jid, chat_type);
  const timezone = settings.timezone;

  const raw_args = ctx.args_text.trim();
  const sub = raw_args ? raw_args.split(/\s+/)[0]?.toLowerCase() : "list";

  // 1. /event add <judul> | <waktu> | [lokasi] | [deskripsi]
  if (sub === "add") {
    // The text after "add" is pipe-delimited
    const add_payload = raw_args.slice(3).trim();
    const parts = add_payload.split("|").map((p) => p.trim());

    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new UserError(
        "Format penambahan event tidak lengkap.\n" +
          "Gunakan: `/event add <judul> | <waktu> | [lokasi] | [deskripsi]`\n" +
          "Contoh: `/event add Rapat Himpunan | besok 19:00 | Aula Barat | Bahas proker`"
      );
    }

    const title = parts[0];
    const time_str = parts[1];
    const location = parts[2] || null;
    const description = parts[3] || null;

    const start_at = parse_datetime_input(time_str, timezone, clock.nowDate());

    const created = event_service.create({
      chat_jid: ctx.chat_jid,
      chat_type,
      title,
      start_at,
      location,
      description,
      created_by: ctx.sender_jid,
    });

    const formatted_time = format_datetime(created.start_at, timezone);
    return (
      `✅ *Event #${created.seq} Berhasil Ditambahkan!*\n\n` +
      `📌 Judul: *${created.title}*\n` +
      `🕒 Waktu: ${formatted_time}\n` +
      (created.location ? `📍 Lokasi: ${created.location}\n` : "") +
      (created.description ? `📝 Keterangan: ${created.description}\n` : "")
    );
  }

  // 2. /event list [all]
  if (sub === "list") {
    const is_all = raw_args.toLowerCase().includes("all");
    const events = event_service.list(ctx.chat_jid, is_all);
    return format_event_list(events, timezone, is_all);
  }

  // 3. /event detail <no>
  if (sub === "detail") {
    const seq_str = raw_args.split(/\s+/)[1];
    const seq = parseInt(seq_str ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor event yang valid. Contoh: `/event detail 1`."
      );
    }

    const event = event_service.get_by_seq(ctx.chat_jid, seq);
    const formatted_time = format_datetime(event.start_at, timezone);

    return (
      `📅 *Detail Event #${event.seq}*\n\n` +
      `📌 Judul: *${event.title}*\n` +
      `🕒 Waktu: ${formatted_time}\n` +
      `📍 Lokasi: ${event.location ?? "-"}\n` +
      `📝 Deskripsi: ${event.description ?? "-"}\n` +
      `👤 Dibuat oleh: @${event.created_by.split("@")[0]}`
    );
  }

  // 4. /event edit <no> <field>=<nilai> ...
  if (sub === "edit") {
    const edit_parts = raw_args.slice(4).trim().split(/\s+/);
    const seq = parseInt(edit_parts[0] ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor event yang valid. Contoh: `/event edit 1 lokasi=Lab 3`."
      );
    }

    const event = event_service.get_by_seq(ctx.chat_jid, seq);

    const allowed = permission_service.can_modify_item({
      user_jid: ctx.sender_jid,
      item_created_by: event.created_by,
      is_group_admin: ctx.is_admin,
    });
    if (!allowed) {
      throw new UserError(
        "Hanya pembuat event atau admin yang dapat mengubah event ini."
      );
    }

    // Parse flags from the remainder
    const flag_string = raw_args.slice(raw_args.indexOf(String(seq)) + String(seq).length).trim();
    if (!flag_string) {
      throw new UserError(
        "Harap sertakan field yang ingin diubah. Contoh: `/event edit 1 waktu=besok 10:00 lokasi=Lab 3`."
      );
    }

    const updates: {
      title?: string;
      start_at?: number;
      location?: string;
      description?: string;
    } = {};

    // Match patterns like: judul=..., waktu=..., lokasi=..., deskripsi=...
    const matches = flag_string.matchAll(/([a-zA-Z_]+)=([^=]+)(?=\s+[a-zA-Z_]+=|$)/g);
    for (const match of matches) {
      const field = match[1]?.toLowerCase();
      const val = match[2]?.trim();
      if (!field || !val) continue;

      if (field === "judul" || field === "title") {
        updates.title = val;
      } else if (field === "waktu" || field === "time") {
        updates.start_at = parse_datetime_input(val, timezone, clock.nowDate());
      } else if (field === "lokasi" || field === "location") {
        updates.location = val;
      } else if (field === "deskripsi" || field === "desc") {
        updates.description = val;
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new UserError(
        "Tidak ada field yang dikenali untuk diubah.\n" +
          "Field yang didukung: `judul`, `waktu`, `lokasi`, `deskripsi`."
      );
    }

    const updated = event_service.update({
      chat_jid: ctx.chat_jid,
      seq,
      ...updates,
    });

    return `✅ Event #${seq} berhasil diperbarui: *${updated.title}*.`;
  }

  // 5. /event delete <no>
  if (sub === "delete" || sub === "hapus") {
    const seq_str = raw_args.split(/\s+/)[1];
    const seq = parseInt(seq_str ?? "", 10);
    if (isNaN(seq) || seq <= 0) {
      throw new UserError(
        "Harap masukkan nomor event yang valid. Contoh: `/event delete 1`."
      );
    }

    const event = event_service.get_by_seq(ctx.chat_jid, seq);

    const allowed = permission_service.can_modify_item({
      user_jid: ctx.sender_jid,
      item_created_by: event.created_by,
      is_group_admin: ctx.is_admin,
    });
    if (!allowed) {
      throw new UserError(
        "Hanya pembuat event atau admin yang dapat menghapus event ini."
      );
    }

    event_service.delete(ctx.chat_jid, seq);
    return `🗑️ Event #${seq} (*${event.title}*) berhasil dihapus.`;
  }

  throw new UserError(
    `Subcommand \`/event ${sub}\` tidak dikenali.\n` +
      `Pilihan:\n` +
      `• \`/event add <judul> | <waktu> | [lokasi] | [deskripsi]\`\n` +
      `• \`/event list [all]\`\n` +
      `• \`/event detail <no>\`\n` +
      `• \`/event edit <no> field=nilai\`\n` +
      `• \`/event delete <no>\``
  );
}
