import type { CommandContext } from "@/commands/types.ts";

export function get_tutorial_and_faq_text(): string {
  return (
    `📖 *PANDUAN & TUTORIAL PENGGUNAAN BOT*\n\n` +
    `*1. Mengaktifkan Notifikasi di Chat/Grup*\n` +
    `• Ketik \`/setnotification\` untuk mengaktifkan bot di chat ini.\n` +
    `• Pengingat otomatis dikirim pada *H-1 hari*, *H-3 jam*, dan *H-30 menit*.\n` +
    `• Ingin diingatkan pas jam acara (H-0)? Jalankan:\n` +
    `  \`/setnotification offset 1d,3h,30m,0m\`\n` +
    `• Atur gaya tag anggota grup:\n` +
    `  - \`/setnotification mention hidden\` (Default: semua anggota tetap dapat notifikasi tag, tetapi tampilan pesan tetap bersih tanpa teks @)\n` +
    `  - \`/setnotification mention visible\` (Ada teks @semua di pesan)\n` +
    `  - \`/setnotification mention none\` (Pesan biasa tanpa tag)\n` +
    `• Uji coba simulasi notifikasi & tag (30 detik):\n` +
    `  \`/testnotif\` atau \`/setnotification test\`\n\n` +
    `*2. Menambah Agenda / Event*\n` +
    `• Format: \`/event add <judul> | <waktu> | [lokasi] | [deskripsi]\`\n` +
    `• Contoh: \`/event add Rapat Organisasi | besok 19:30 | Ruang A | Bahas LPJ\`\n` +
    `• Contoh lain: \`/event add Seminar AI | 25/10 09:00 | Aula | Wajib hadir\`\n\n` +
    `*3. Menambah Jadwal Kuliah Mingguan*\n` +
    `• Format: \`/matkul add <nama> | <hari> | <mulai-selesai> | [ruang] | [dosen]\`\n` +
    `• Contoh: \`/matkul add Algoritma | Senin | 08:00-10:30 | Lab 2 | Pak Budi\`\n` +
    `• Jadwal ini otomatis diingatkan setiap minggu.\n\n` +
    `*4. Menambah Tugas & Deadline*\n` +
    `• Format: \`/tugas add <judul> | <deadline> | [no matkul] | [deskripsi]\`\n` +
    `• Contoh: \`/tugas add Makalah Bab 1 | lusa 23:59 | 1 | Format PDF\`\n` +
    `• Cek tugas: \`/tugas list\`\n` +
    `• Tandai selesai: \`/tugas done 1\`\n\n` +
    `*5. Format Waktu Fleksibel yang Didukung*\n` +
    `• \`hari ini 20:00\`\n` +
    `• \`besok 08:30\`\n` +
    `• \`lusa 14:00\`\n` +
    `• \`senin 10:00\` (hari terdekat ke depan)\n` +
    `• \`15/10 13:00\` atau \`15/10/2026 13:00\`\n\n` +
    `*6. FAQ (Pertanyaan Umum)*\n` +
    `• *Q: Apakah bot bisa tag semua anggota grup?*\n` +
    `  A: Ya! Gunakan \`/setnotification mention hidden\` (rekomendasi) atau \`visible\`.\n` +
    `• *Q: Siapa yang berhak edit/hapus jadwal atau ubah pengaturan?*\n` +
    `  A: Pengaturan notifikasi hanya bisa diubah Admin Grup. Jadwal kegiatan bisa diedit/dihapus oleh pembuatnya atau Admin Grup.\n` +
    `• *Q: Cara cek pengaturan yang sedang aktif?*\n` +
    `  A: Ketik \`/setnotification status\`.`
  );
}

export async function help_handler(ctx: CommandContext): Promise<string> {
  const cmd = ctx.command.toLowerCase();
  const target = ctx.args_text.trim().toLowerCase();

  // Jika dipanggil via /faq, /penggunaan, /tutorial atau /help faq dsb.
  if (
    cmd === "faq" ||
    cmd === "penggunaan" ||
    cmd === "tutorial" ||
    target === "faq" ||
    target === "penggunaan" ||
    target === "tutorial"
  ) {
    return get_tutorial_and_faq_text();
  }

  if (target === "setnotification") {
    return (
      `🔔 *Panduan /setnotification*\n\n` +
      `Digunakan untuk mengatur notifikasi pengingat di chat ini.\n\n` +
      `• \`/setnotification\` : Mengaktifkan notifikasi di chat ini\n` +
      `• \`/setnotification off\` : Menonaktifkan notifikasi\n` +
      `• \`/setnotification status\` : Melihat konfigurasi saat ini\n` +
      `• \`/setnotification mention <hidden|visible|none>\` : Mengatur gaya mention\n` +
      `• \`/setnotification offset 1d,3h,30m\` : Mengatur jarak waktu pengingat\n` +
      `• \`/setnotification tz Asia/Jakarta\` : Mengubah zona waktu chat\n` +
      `• \`/setnotification test\` : Uji coba simulasi pengingat dalam 30 detik`
    );
  }

  if (target === "testnotif" || target === "testnotification") {
    return (
      `⏱️ *Panduan /testnotif*\n\n` +
      `Digunakan untuk menguji coba pengiriman pesan pengingat dan mention/tag ke chat ini.\n\n` +
      `• \`/testnotif\` : Menjadwalkan pengiriman pesan pengingat simulasi dalam 30 detik\n` +
      `• \`/testnotif [detik]\` : Uji coba dengan durasi penundaan kustom (contoh: \`/testnotif 10\`)\n\n` +
      `_Catatan: Di grup, hanya admin grup atau superadmin yang dapat menjalankan perintah ini._`
    );
  }

  if (target === "event") {
    return (
      `📅 *Panduan /event*\n\n` +
      `Kelola agenda atau acara mendatang.\n\n` +
      `• \`/event add <judul> | <waktu> | [lokasi] | [deskripsi]\`\n` +
      `• \`/event list [all]\`\n` +
      `• \`/event detail <no>\`\n` +
      `• \`/event edit <no> waktu=... lokasi=...\`\n` +
      `• \`/event delete <no>\``
    );
  }

  if (target === "matkul") {
    return (
      `📚 *Panduan /matkul*\n\n` +
      `Kelola jadwal mata kuliah mingguan.\n\n` +
      `• \`/matkul add <nama> | <hari> | <mulai-selesai> | [ruang] | [dosen]\`\n` +
      `• \`/matkul list\`\n` +
      `• \`/matkul detail <no>\`\n` +
      `• \`/matkul edit <no> nama=... ruang=...\`\n` +
      `• \`/matkul delete <no>\``
    );
  }

  if (target === "tugas") {
    return (
      `📝 *Panduan /tugas*\n\n` +
      `Kelola tugas dan deadline.\n\n` +
      `• \`/tugas add <judul> | <deadline> | [no matkul] | [deskripsi]\`\n` +
      `• \`/tugas list [all|done]\`\n` +
      `• \`/tugas detail <no>\`\n` +
      `• \`/tugas edit <no> deadline=... judul=...\`\n` +
      `• \`/tugas done <no>\`\n` +
      `• \`/tugas undone <no>\`\n` +
      `• \`/tugas delete <no>\``
    );
  }

  if (target === "adminonly") {
    return (
      `🛡️ *Panduan /adminonly*\n\n` +
      `Digunakan untuk membatasi penggunaan bot di grup hanya untuk admin grup.\n\n` +
      `• \`/adminonly\` atau \`/adminonly status\` : Cek status mode admin-only saat ini\n` +
      `• \`/adminonly on\` : Mengaktifkan mode admin-only (hanya admin yang dapat memanggil bot)\n` +
      `• \`/adminonly off\` : Menonaktifkan mode admin-only (semua anggota dapat menggunakan bot)\n\n` +
      `_Catatan: Hanya dapat diatur oleh admin grup atau superadmin di grup WhatsApp._`
    );
  }

  return (
    `🤖 *Daftar Perintah Bot Pengingat*\n\n` +
    `• \`/ping\` : Cek status bot\n` +
    `• \`/help [perintah]\` : Menampilkan bantuan perintah spesifik\n` +
    `• \`/faq\` atau \`/penggunaan\` : Tutorial lengkap & cara pakai bot\n` +
    `• \`/setnotification\` : Pengaturan notifikasi chat & mention\n` +
    `• \`/adminonly\` : Kunci akses bot khusus admin grup\n` +
    `• \`/testnotif\` : Uji coba notifikasi & mention (30 detik)\n` +
    `• \`/event\` : Pengingat agenda dan acara\n` +
    `• \`/matkul\` : Jadwal kuliah berulang mingguan\n` +
    `• \`/tugas\` : Catatan tugas dan deadline\n\n` +
    `_Ketik \`/help <perintah>\` untuk petunjuk lengkap (contoh: \`/help event\` atau \`/help faq\`)._`
  );
}
