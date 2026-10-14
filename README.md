# WhatsApp Reminder Bot (ScheduleBot)

Bot WhatsApp pengingat otomatis untuk **event / agenda**, **jadwal kuliah mingguan (matkul)**, dan **tugas / deadline**.

Dibangun menggunakan **Bun**, **TypeScript (strict)**, **`@whiskeysockets/baileys`**, dan **`bun:sqlite`**.

---

## Fitur Utama

- 🔔 **Pengingat Otomatis Berbasis Offset**: Kirim notifikasi pengingat sebelum jadwal tiba (contoh: H-1, 3 jam, dan 30 menit sebelum).
- 👥 **Mention Anggota**: Mendukung mode mention `hidden` (semua anggota dapat notifikasi tanpa spam tag nomor di teks), `visible` (tag `@semua`), dan `none`.
- 📅 **Manajemen Event**: CRUD agenda kegiatan satu kali dengan lokasi dan keterangan.
- 📚 **Jadwal Kuliah (Matkul)**: Jadwal kuliah mingguan berulang otomatis per hari dan jam lokal.
- 📝 **Pelacakan Tugas**: Catatan tugas dan deadline dengan integrasi mata kuliah, status open/done, dan penanda terlambat.
- 🛡️ **Sistem Hak Akses (Permissions)**: Hanya pembuat item atau admin grup yang dapat mengedit/menghapus item.
- ⚡ **Zero-Build & High Performance**: Berjalan langsung di atas Bun tanpa build step dengan SQLite mode WAL sinkron.

---

## Kebutuhan Sistem

- [Bun](https://bun.sh/) v1.4 atau lebih baru.
- Nomor WhatsApp aktif khusus untuk bot (disarankan bukan nomor pribadi).

---

## Cara Instalasi & Menjalankan

### 1. Clone & Pasang Dependensi

```bash
bun install
```

### 2. Konfigurasi Environment

Salin template `.env.example` ke `.env`:

```bash
cp .env.example .env
```

Sesuaikan variabel di `.env`:
- `ADMIN_JIDS`: Nomor WhatsApp superadmin (contoh: `6281234567890@s.whatsapp.net`).
- `DEFAULT_TIMEZONE`: Zona waktu default (default: `Asia/Jakarta`).
- `PAIRING_PHONE`: (Opsional) Nomor telepon bot jika ingin login menggunakan kode pairing alih-alih QR terminal.

### 3. Menjalankan Bot & Login

Jalankan bot:
```bash
# Mode pengembangan
bun run dev

# Atau mode produksi
bun run start
```

Saat pertama kali dijalankan dan belum terhubung ke WhatsApp, Anda dapat memilih metode autentikasi:
- **Scan QR Code (Pilihan 1 / Default)**: Arahkan kamera WhatsApp (*Perangkat Tertaut > Tautkan Perangkat*) ke QR code di terminal.
- **Pairing Code (Pilihan 2)**: Masukkan nomor telepon WhatsApp Anda saat diminta, atau jalankan langsung dengan perintah:
  ```bash
  bun run start --pairing
  ```
  Bot akan menampilkan 8 digit kode pairing untuk dimasukkan di WhatsApp (*Perangkat Tertaut > Tautkan dengan nomor telepon saja*).
  *(Anda juga dapat mengisinya otomatis via variabel `PAIRING_PHONE=628xxxx` di file `.env`)*.

### 4. Interactive Terminal CLI Console

Saat bot sedang berjalan di terminal, Anda dapat mengetikkan perintah langsung di prompt `schedulebot>`:
- `status` : Melihat status koneksi WhatsApp, nomor bot, scheduler, dan uptime.
- `stats` : Melihat ringkasan data database (jumlah chat, event, matkul, tugas).
- `clear-auth` / `logout` : Memutuskan sesi WhatsApp dan menghapus folder session `data/auth`.
- `clear` : Membersihkan layar terminal.
- `exit` / `quit` : Menghentikan bot secara aman (*graceful shutdown*).
- `help` : Menampilkan daftar bantuan perintah terminal.

---

## Menjalankan Pengujian & Cek Kualitas

Pengecekan tipe data TypeScript:
```bash
bun run typecheck
```

Menjalankan seluruh unit & integration test:
```bash
bun test
```

Pengecekan linting kode:
```bash
bun run lint
```

Format kode:
```bash
bun run format
```

---

## Deployment Menggunakan Docker

Bangun image Docker:
```bash
docker build -t wa-reminder-bot .
```

Jalankan container dengan persistent volume untuk folder data:
```bash
docker run -d \
  --name wa-reminder-bot \
  --restart unless-stopped \
  -v $(pwd)/data:/app/data \
  -e ADMIN_JIDS="6281234567890@s.whatsapp.net" \
  wa-reminder-bot
```

Lihat log untuk scan QR code saat inisialisasi:
```bash
docker logs -f wa-reminder-bot
```

---

## Deployment Menggunakan PM2

Aplikasi ini siap dijalankan sebagai background daemon di VPS / server menggunakan **PM2** dengan runtime Bun.

> **Penting**: Gunakan mode `fork` dan `1 instance` (jangan gunakan mode cluster) untuk mencegah konflik sesi WhatsApp dan duplikasi pemicu pengingat.

1. **Jalankan bot dengan PM2:**
   ```bash
   bun run pm2:start
   # atau: pm2 start ecosystem.config.cjs
   ```
2. **Cek status & log:**
   ```bash
   pm2 status
   bun run pm2:logs
   ```
3. **Restart / Stop:**
   ```bash
   bun run pm2:restart
   bun run pm2:stop
   ```

---

## Daftar Perintah (Command Reference)

Prefix default: `/`

### 1. Pengaturan Notifikasi
| Perintah | Deskripsi |
|---|---|
| `/setnotification` | Mengaktifkan pengingat di chat saat ini |
| `/setnotification off` | Menonaktifkan pengingat di chat saat ini |
| `/setnotification status` | Melihat status dan konfigurasi saat ini |
| `/setnotification mention <hidden\|visible\|none>` | Mengatur gaya mention |
| `/setnotification offset 1d,3h,30m` | Mengatur offset waktu pengingat sebelum jadwal |
| `/setnotification tz Asia/Jakarta` | Mengubah zona waktu chat |

### 2. Agenda & Event
| Perintah | Deskripsi |
|---|---|
| `/event add <judul> \| <waktu> \| [lokasi] \| [deskripsi]` | Menambah agenda baru |
| `/event list [all]` | Menampilkan daftar event mendatang (atau semua) |
| `/event detail <no>` | Menampilkan detail lengkap event |
| `/event edit <no> field=nilai` | Mengedit event (`judul`, `waktu`, `lokasi`, `deskripsi`) |
| `/event delete <no>` | Menghapus event |

Contoh:
```
/event add Rapat Himpunan | besok 19:00 | Aula Barat | Bahas proker
/event edit 1 lokasi=Lab 3
```

### 3. Jadwal Kuliah (Matkul)
| Perintah | Deskripsi |
|---|---|
| `/matkul add <nama> \| <hari> \| <mulai-selesai> \| [ruang] \| [dosen]` | Menambah jadwal kuliah |
| `/matkul list` | Menampilkan jadwal kuliah mingguan |
| `/matkul detail <no>` | Menampilkan detail mata kuliah |
| `/matkul edit <no> field=nilai` | Mengedit matkul (`nama`, `hari`, `jam`, `ruang`, `dosen`) |
| `/matkul delete <no>` | Menghapus mata kuliah |

Contoh:
```
/matkul add Basis Data | senin | 08:00-10:30 | Lab 2 | Pak Budi
/matkul edit 1 ruang=Lab 4
```

### 4. Tugas & Deadline
| Perintah | Deskripsi |
|---|---|
| `/tugas add <judul> \| <deadline> \| [no matkul] \| [deskripsi]` | Menambah tugas baru |
| `/tugas list [all\|done]` | Menampilkan daftar tugas aktif / selesai |
| `/tugas detail <no>` | Menampilkan detail tugas |
| `/tugas edit <no> field=nilai` | Mengedit tugas (`judul`, `deadline`, `matkul`, `deskripsi`) |
| `/tugas done <no>` | Menandai tugas telah selesai |
| `/tugas undone <no>` | Mengembalikan status tugas ke open |
| `/tugas delete <no>` | Menghapus tugas |

Contoh:
```
/tugas add Laporan Praktikum | jumat 23:59 | 1 | Bab 1-3
/tugas done 1
```

### 5. Umum
| Perintah | Deskripsi |
|---|---|
| `/ping` | Cek status keaktifan bot |
| `/help [perintah]` | Menampilkan panduan bantuan umum atau per perintah |
| `/faq` atau `/penggunaan` | Tutorial lengkap, format waktu, dan cara pakai bot |