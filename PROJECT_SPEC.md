# WhatsApp Reminder Bot — Project Spec

Dokumen ini adalah acuan utama untuk AI agents yang akan membangun bot. Baca seluruhnya sebelum menulis kode. Kalau ada keputusan yang belum tercantum, pilih opsi paling sederhana, lalu catat di `docs/DECISIONS.md`.

---

## 1. Tujuan

Bot WhatsApp pengingat **event**, **mata kuliah** (jadwal kuliah mingguan), dan **tugas** (deadline).

- Dikelola lewat command chat (CRUD).
- `/setnotification` dipakai di sebuah chat untuk menjadikan chat itu tujuan notifikasi.
  - **Grup**: bot mention (tag) semua anggota grup.
  - **Chat pribadi**: bot mention orang tersebut.
- Pengingat dikirim otomatis sebelum waktu mulai/deadline, sesuai offset yang bisa diatur.

**Non-goals (versi 1):** web dashboard, multi-bahasa, integrasi Google Calendar, pembayaran, AI/LLM di dalam bot.

---

## 2. Tech Stack

| Bagian | Pilihan | Catatan |
|---|---|---|
| Runtime & package manager | **Bun** | wajib; jangan pakai npm/yarn/pnpm, commit `bun.lock` |
| Bahasa | **TypeScript (strict)** | Bun menjalankan `.ts` langsung, tanpa build step |
| WhatsApp | `@whiskeysockets/baileys` | multi-device, tanpa browser |
| Database | SQLite via **`bun:sqlite`** (bawaan Bun) | mode WAL, akses sinkron. **Jangan** pakai `better-sqlite3` |
| Waktu/zona | `luxon` | zona default `Asia/Jakarta` |
| Validasi | `zod` | validasi hasil parser command & env |
| Scheduler | tick tiap 1 menit (`setInterval`) | polling DB, bukan satu timer per reminder |
| Logging | `pino` | |
| Test | **`bun test`** (`bun:test`) | tanpa vitest/jest |
| Typecheck | `tsc --noEmit` | hanya untuk pengecekan tipe |
| Lint/format | ESLint + Prettier | |
| Proses | Docker (`oven/bun`) atau `pm2` | tahap deploy |

> Baileys adalah API tidak resmi. Pakai **nomor khusus bot**, jangan nomor utama, dan jangan spam.

### 2.1 Konvensi Bun & TypeScript

- **Install & jalankan** semuanya lewat Bun: `bun install`, `bun run <script>`, `bun test`. Commit `bun.lock`. Jangan ada `package-lock.json`, `yarn.lock`, atau `pnpm-lock.yaml`.
- **Tanpa build step.** `bun src/index.ts` langsung jalan. `tsc` hanya dipakai untuk `--noEmit` (cek tipe).
- Dev dependencies minimum: `typescript`, `@types/bun`, `eslint`, `prettier`.
- **Environment**: Bun membaca `.env` otomatis, jadi **tanpa `dotenv`**. Baca lewat `Bun.env` / `process.env` di `config/env.ts`, lalu validasi dengan zod.
- **SQLite**: pakai `import { Database } from "bun:sqlite"`.
  - Buka: `new Database(path, { create: true })`, lalu `db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")`.
  - Query: `db.query(sql).get() / .all() / .run()` (prepared statement di-cache otomatis).
  - Transaksi: `db.transaction(() => { ... })`.
  - Test: `new Database(":memory:")`.
- **Test**: `import { describe, it, expect, mock } from "bun:test"`. File test `*.test.ts` di folder `tests/`. Untuk waktu, tetap pakai `Clock` palsu (bukan `setSystemTime`), supaya logika tidak bergantung ke global.
- **Shutdown rapi**: tangani `SIGINT`/`SIGTERM`: hentikan scheduler, tutup socket Baileys, lalu `db.close()`.

`package.json` (scripts):

```json
{
  "name": "wa-reminder-bot",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "types": ["bun"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "tests"]
}
```

Gunakan `import type { ... }` untuk import tipe (karena `verbatimModuleSyntax`).

---

## 3. Arsitektur

```
WhatsApp <-> [Transport: Baileys socket]
                    |
              messages.upsert
                    v
             [Command Router] --> [Parser (zod)] --> [Handlers]
                                                        |
                                                        v
                                    [Services: event / course / task / chat]
                                                        |
                                                        v
                                          [Repositories (SQL)] --> SQLite

[Scheduler tick 1 menit] --> [ReminderEngine] --> [Services] --> [Sender] --> Baileys
```

Aturan lapisan (jangan dilanggar):

1. **Transport** (`src/wa/`) satu-satunya tempat yang boleh import Baileys.
2. **Handlers** tipis: terima context, panggil service, kembalikan teks balasan.
3. **Services** berisi logika bisnis dan tidak tahu soal WhatsApp.
4. **Repositories** satu-satunya tempat SQL.
5. **Waktu** selalu lewat interface `Clock` (bisa di-mock di test). Jangan panggil `Date.now()` langsung di logika bisnis.

---

## 4. Struktur Folder

```
wa-reminder-bot/
├─ src/
│  ├─ index.ts                 # bootstrap: env, db, migrate, socket, scheduler
│  ├─ config/
│  │  └─ env.ts                # baca & validasi .env (zod)
│  ├─ wa/
│  │  ├─ socket.ts             # buat socket, auth state, reconnect
│  │  ├─ events.ts             # listener messages.upsert, connection.update
│  │  ├─ message-utils.ts      # ekstrak teks, sender, isGroup, quoted
│  │  ├─ group-cache.ts        # cache groupMetadata (TTL), daftar peserta
│  │  └─ sender.ts             # sendText, sendWithMentions, antrean + delay
│  ├─ commands/
│  │  ├─ router.ts             # prefix "/", cari command, cek permission
│  │  ├─ types.ts              # CommandContext, CommandHandler
│  │  ├─ help.ts
│  │  ├─ setnotification.ts
│  │  ├─ event.ts
│  │  ├─ matkul.ts
│  │  └─ tugas.ts
│  ├─ parsing/
│  │  ├─ args.ts               # split "a | b | c", flag --kunci=nilai
│  │  ├─ datetime.ts           # "besok 19:00", "12-10-2026 08:00", "senin"
│  │  └─ offsets.ts            # "1d,3h,30m" -> [1440,180,30]
│  ├─ services/
│  │  ├─ chat.service.ts
│  │  ├─ event.service.ts
│  │  ├─ course.service.ts
│  │  ├─ task.service.ts
│  │  └─ permission.service.ts
│  ├─ reminders/
│  │  ├─ engine.ts             # hitung reminder yang jatuh tempo
│  │  ├─ occurrences.ts        # expand event/tugas/matkul jadi occurrence
│  │  ├─ scheduler.ts          # tick tiap menit
│  │  └─ format.ts             # susun teks pesan pengingat
│  ├─ db/
│  │  ├─ client.ts             # open DB, pragma WAL & foreign_keys
│  │  ├─ migrate.ts            # runner migrasi sederhana
│  │  ├─ migrations/
│  │  │  └─ 001_init.sql
│  │  └─ repositories/
│  │     ├─ chat.repo.ts
│  │     ├─ event.repo.ts
│  │     ├─ course.repo.ts
│  │     ├─ task.repo.ts
│  │     └─ reminder-log.repo.ts
│  ├─ lib/
│  │  ├─ clock.ts              # interface Clock + SystemClock
│  │  ├─ logger.ts
│  │  └─ errors.ts             # UserError (pesan aman ditampilkan ke user)
│  └─ formatters/
│     └─ lists.ts              # tampilan list event/matkul/tugas
├─ tests/                      # mirror src/
├─ data/                       # gitignored: bot.sqlite, auth/
├─ docs/
│  └─ DECISIONS.md
├─ .env.example
├─ bun.lock
├─ bunfig.toml                 # opsional
├─ package.json
└─ tsconfig.json
```

---

## 5. Skema Database

Aturan waktu:

- `event.start_at`, `task.due_at`, dll. disimpan sebagai **epoch milidetik UTC** (INTEGER).
- Matkul berulang disimpan sebagai hari + jam lokal (bukan epoch), dihitung pakai `timezone` chat.
- Tampilan ke user selalu pakai `timezone` chat.

Setiap item punya `seq` yang unik **per chat**, supaya user cukup mengetik `/tugas done 3` dan bukan ID global.

```sql
-- 001_init.sql
PRAGMA foreign_keys = ON;

CREATE TABLE chat_settings (
  chat_jid         TEXT PRIMARY KEY,
  chat_type        TEXT NOT NULL CHECK (chat_type IN ('group','private')),
  chat_name        TEXT,
  notify_enabled   INTEGER NOT NULL DEFAULT 0,          -- 1 setelah /setnotification
  mention_mode     TEXT NOT NULL DEFAULT 'hidden'
                   CHECK (mention_mode IN ('hidden','visible','none')),
  timezone         TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  reminder_offsets TEXT NOT NULL DEFAULT '[1440,180,30]', -- JSON, menit sebelum waktu mulai
  digest_time      TEXT,                                  -- 'HH:mm' atau NULL (fase 2)
  set_by           TEXT,                                  -- jid yang menjalankan /setnotification
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid    TEXT NOT NULL REFERENCES chat_settings(chat_jid) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  name        TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- ISO: 1=Senin
  start_time  TEXT NOT NULL,                                        -- 'HH:mm'
  end_time    TEXT,
  room        TEXT,
  lecturer    TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (chat_jid, seq)
);

CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid    TEXT NOT NULL REFERENCES chat_settings(chat_jid) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  location    TEXT,
  start_at    INTEGER NOT NULL,   -- epoch ms UTC
  end_at      INTEGER,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (chat_jid, seq)
);
CREATE INDEX idx_events_chat_start ON events(chat_jid, start_at);

CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid    TEXT NOT NULL REFERENCES chat_settings(chat_jid) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  course_id   INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  due_at      INTEGER NOT NULL,   -- epoch ms UTC
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  done_by     TEXT,
  done_at     INTEGER,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (chat_jid, seq)
);
CREATE INDEX idx_tasks_chat_due ON tasks(chat_jid, status, due_at);

-- Mencegah reminder terkirim dua kali (idempotensi)
CREATE TABLE reminder_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid       TEXT NOT NULL,
  source_type    TEXT NOT NULL CHECK (source_type IN ('event','course','task')),
  source_id      INTEGER NOT NULL,
  occurrence_at  INTEGER NOT NULL,  -- epoch ms waktu mulai kejadian yang diingatkan
  offset_minutes INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error          TEXT,
  sent_at        INTEGER NOT NULL,
  UNIQUE (source_type, source_id, occurrence_at, offset_minutes)
);

CREATE TABLE schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

`seq` baru = `COALESCE(MAX(seq),0)+1` untuk `chat_jid` + tabel itu, di dalam transaksi yang sama dengan INSERT.

Saat item dihapus, bersihkan baris `reminder_log` terkait di service yang sama.

---

## 6. Spesifikasi Command

Prefix: `/`. Case-insensitive. Argumen dipisah `|`, supaya judul boleh mengandung spasi.

### 6.1 Umum

| Command | Fungsi |
|---|---|
| `/help` | daftar command |
| `/help <command>` | detail satu command |
| `/ping` | cek bot hidup |

### 6.2 `/setnotification`

| Bentuk | Fungsi |
|---|---|
| `/setnotification` | aktifkan notifikasi di chat ini |
| `/setnotification off` | matikan |
| `/setnotification status` | tampilkan pengaturan saat ini |
| `/setnotification mention <hidden\|visible\|none>` | gaya tag |
| `/setnotification offset 1d,3h,30m` | ubah waktu pengingat |
| `/setnotification tz Asia/Jakarta` | ubah zona waktu |

Perilaku:

- Membuat baris `chat_settings` kalau belum ada, lalu set `notify_enabled = 1`.
- **Grup**: ambil `groupMetadata`, mention seluruh peserta (kecuali bot sendiri).
- **Pribadi**: mention pengirim.
- `mention_mode`:
  - `hidden` (default): `mentions[]` berisi semua peserta, teks tidak memuat daftar `@nomor` panjang. Semua tetap dapat notifikasi, pesan tetap rapi.
  - `visible`: teks memuat `@nomor` semua orang.
  - `none`: tanpa mention.
- Di grup, hanya **admin grup** yang boleh menjalankan perubahan pengaturan.
- Reminder **hanya** dikirim ke chat dengan `notify_enabled = 1`.

### 6.3 `/event`

```
/event add <judul> | <waktu> | [lokasi] | [deskripsi]
/event list [all]
/event detail <no>
/event edit <no> <field>=<nilai> ...    # field: judul, waktu, lokasi, deskripsi
/event delete <no>
```

Contoh:

```
/event add Rapat Himpunan | besok 19:00 | Aula Barat | Bahas proker
/event edit 2 waktu=12-10-2026 08:00 lokasi=Lab 3
```

`list` default hanya yang akan datang (urut waktu). `all` termasuk yang sudah lewat.

### 6.4 `/matkul`

```
/matkul add <nama> | <hari> | <mulai>-<selesai> | [ruang] | [dosen]
/matkul list
/matkul detail <no>
/matkul edit <no> <field>=<nilai> ...   # nama, hari, jam, ruang, dosen
/matkul delete <no>
```

Contoh: `/matkul add Basis Data | senin | 08:00-10:30 | Lab 2 | Pak Budi`

`hari` boleh `senin..minggu`, `sen`, `1..7`. Matkul berulang tiap minggu tanpa tanggal akhir. Hapus atau nonaktifkan lewat `delete`.

### 6.5 `/tugas`

```
/tugas add <judul> | <deadline> | [matkul no] | [deskripsi]
/tugas list [all|done]
/tugas detail <no>
/tugas edit <no> <field>=<nilai> ...    # judul, deadline, matkul, deskripsi
/tugas done <no>
/tugas undone <no>
/tugas delete <no>
```

`list` default menampilkan tugas `open`, urut deadline, dengan penanda terlambat.

### 6.6 Format waktu yang harus didukung parser

- Absolut: `12-10-2026 08:00`, `12/10/2026 08:00`, `12-10 08:00` (tahun otomatis).
- Relatif: `hari ini 20:00`, `besok 19:00`, `lusa 07:30`.
- Nama hari: `senin 10:00`, yaitu hari tersebut terdekat ke depan.
- Jam tanpa tanggal: `19:00`, yaitu hari ini, atau besok kalau sudah lewat.
- Selalu ditafsirkan di `timezone` chat. Tolak waktu yang tidak valid dengan pesan jelas, jangan menebak.

### 6.7 Permission

| Aksi | Grup | Pribadi |
|---|---|---|
| add / list / detail | semua anggota | pemilik chat |
| edit / delete / done | pembuat item **atau** admin grup | pemilik chat |
| `/setnotification` (ubah) | admin grup | pemilik chat |

Daftar `ADMIN_JIDS` di `.env` = super admin bot, boleh semua aksi.

---

## 7. Mesin Pengingat

### 7.1 Tick

Setiap 60 detik (selaras dengan awal menit):

1. Ambil semua chat dengan `notify_enabled = 1`.
2. Untuk tiap chat, bangun daftar **occurrence** dalam jendela `[now - GRACE, now + maxOffset]`:
   - **Event**: 1 occurrence di `start_at`.
   - **Tugas open**: 1 occurrence di `due_at`.
   - **Matkul aktif**: occurrence mingguan terdekat (hitung di timezone chat, lalu ke epoch).
3. Untuk tiap occurrence × tiap offset di `reminder_offsets`:
   - `trigger = occurrence_at - offset * 60_000`
   - Kirim jika `trigger <= now` **dan** `trigger > now - GRACE` **dan** belum ada di `reminder_log`.
4. Setelah kirim, tulis `reminder_log` (`sent` atau `failed`).

Konstanta:

- `GRACE = 15 menit`. Kalau bot mati lalu hidup lagi, reminder yang terlewat kurang dari 15 menit tetap dikirim, sisanya dilewati supaya tidak banjir pesan lama.
- Default offset: `[1440, 180, 30]` (H-1, 3 jam, 30 menit).
- Reminder saat waktu kejadian tiba (offset 0) opsional, aktifkan lewat `/setnotification offset 1d,3h,30m,0`.

### 7.2 Format pesan pengingat (contoh)

```
⏰ *Pengingat Tugas*
Laporan Praktikum Basis Data
📅 Jumat, 9 Okt 2026 • 23:59 WIB
⏳ 3 jam lagi
📚 Matkul: Basis Data

@semua
```

Satu pesan per reminder. Jika beberapa reminder jatuh bersamaan di satu chat, boleh digabung jadi satu pesan agar tidak spam.

### 7.3 Pengiriman

- Kirim lewat antrean per bot dengan jeda **1–2 detik** antar pesan (anti-ban).
- Kalau gagal, catat `failed` + `error`, retry maksimal 2 kali pada tick berikutnya selama masih dalam `GRACE`.
- Pesan ke grup yang bot-nya sudah keluar/dikeluarkan: set `notify_enabled = 0` dan log warning.

---

## 8. Catatan Baileys

- Auth: `useMultiFileAuthState('data/auth')`. Login pakai QR di terminal atau pairing code (`PAIRING_PHONE` opsional di `.env`).
- Reconnect: di `connection.update`, kalau `close` dan alasan **bukan** `DisconnectReason.loggedOut`, sambung ulang dengan backoff (1s → 2s → 5s → maks 30s). Kalau `loggedOut`, hapus auth dan minta login ulang.
- Ekstrak teks dari `message.conversation`, `extendedTextMessage.text`, dan caption media.
- Abaikan pesan dari bot sendiri (`fromMe`) dan pesan status/broadcast.
- Jenis chat: JID berakhiran `@g.us` = grup, selain itu pribadi.
- Daftar peserta: `sock.groupMetadata(jid)`, simpan di `group-cache.ts` dengan TTL (misalnya 10 menit) dan invalidasi saat event `group-participants.update`. Lewatkan cache ke opsi `cachedGroupMetadata` Baileys.
- Mention: `sock.sendMessage(jid, { text, mentions: [jid1, jid2, ...] })`.
- **Perhatian LID**: versi Baileys terbaru memakai identitas LID (`@lid`) di grup, dan field peserta bisa berisi LID atau nomor telepon. Agent wajib cek tipe `GroupParticipant` pada versi yang terpasang, lalu gunakan JID yang valid untuk `mentions`. Tulis temuannya di `docs/DECISIONS.md`.
- Pin versi Baileys di `package.json` (jangan `^`), karena API sering berubah.
- **Baileys di atas Bun**: agent wajib memverifikasi di Fase 3 bahwa koneksi WebSocket, QR/pairing code, kirim-terima pesan, dan reconnect berjalan normal di Bun. Dependensi opsional native (mis. `sharp`, link-preview) tidak dibutuhkan, jadi jangan dipasang kecuali ada fitur yang memerlukannya. Kalau ada masalah kompatibilitas, catat di `docs/DECISIONS.md` dan laporkan ke user. **Jangan diam-diam pindah runtime ke Node.**

---

## 9. Konfigurasi (`.env.example`)

Bun memuat `.env` otomatis (tanpa `dotenv`). Validasi tetap lewat zod di `config/env.ts`.

```
NODE_ENV=production
DATA_DIR=./data
DEFAULT_TIMEZONE=Asia/Jakarta
COMMAND_PREFIX=/
ADMIN_JIDS=6281234567890@s.whatsapp.net
PAIRING_PHONE=
LOG_LEVEL=info
SEND_DELAY_MS=1500
REMINDER_GRACE_MINUTES=15
```

---

## 10. Edge Case yang Wajib Ditangani

- Command di chat yang belum punya `chat_settings`: buat otomatis (tanpa mengaktifkan notifikasi).
- `/setnotification` dijalankan dua kali: idempotent, balas "sudah aktif".
- Deadline/event di masa lalu saat `add`: tolak dengan pesan jelas.
- Nomor `<no>` tidak ada atau milik chat lain: "Item #N tidak ditemukan".
- Anggota grup bertambah atau berkurang: cache peserta di-refresh, reminder berikutnya memakai daftar terbaru.
- Grup sangat besar (ratusan anggota): mode `hidden` jadi default.
- Dua instance bot jalan bersamaan: dilarang. Gunakan lock file di `DATA_DIR` saat startup.
- Perubahan waktu event: hapus `reminder_log` untuk item tersebut supaya reminder dijadwalkan ulang.
- Error tak terduga: log lengkap, balas user dengan pesan umum, jangan bocorkan stack trace.

---

## 11. Rencana Kerja untuk AI Agents

Kerjakan berurutan. Setiap fase ditutup dengan test hijau + commit.

| Fase | Agent / fokus | Output | Selesai jika |
|---|---|---|---|
| 0 | **Scaffold** | `bun init`, package.json, tsconfig (§2.1), ESLint, struktur folder, `env.ts`, logger | `bun run typecheck` & `bun test` jalan (kosong) |
| 1 | **Database** | `001_init.sql`, runner migrasi (`bun:sqlite`), semua repository | `bun test` repo lulus pada `:memory:`; `seq` per chat benar |
| 2 | **Parsing** | `args.ts`, `datetime.ts`, `offsets.ts` | test mencakup semua format di §6.6, termasuk zona waktu |
| 3 | **WA Transport** | socket, reconnect, router, `/ping`, `/help` | bot **jalan di Bun**, login & membalas `/ping` di chat pribadi dan grup; hasil cek kompatibilitas Baileys-Bun dicatat |
| 4 | **Chat & Notification** | `/setnotification` (+ cache peserta, mention) | di grup tag semua anggota; di pribadi tag pengirim |
| 5 | **CRUD** | `/event`, `/matkul`, `/tugas` + permission | semua subcommand bekerja, aturan edit/delete benar |
| 6 | **Reminder Engine** | occurrences, engine, scheduler, `reminder_log` | test dengan fake `Clock`: tidak ada duplikat, catch-up sesuai GRACE |
| 7 | **Polish** | formatter, pesan error ramah, README, Dockerfile (`oven/bun`) / pm2 | README cukup untuk setup dari nol |
| 8 (opsional) | **Digest harian** | ringkasan agenda jam `digest_time` | muncul tiap hari di chat yang mengaktifkan |

Aturan kerja tiap agent:

1. Baca `PROJECT_SPEC.md` dan `docs/DECISIONS.md` dulu.
2. Jangan mengubah skema di luar migrasi baru (`002_*.sql`, dst). Jangan edit migrasi lama.
3. Logika waktu harus bisa dites dengan `Clock` palsu.
4. Tulis test untuk fungsi murni (parser, occurrence, engine) sebelum atau bersama implementasi.
5. Jangan import Baileys di luar `src/wa/`.
6. Semua teks balasan ke user dalam Bahasa Indonesia, singkat, ramah.
7. Setiap keputusan yang menyimpang dari spec dicatat di `docs/DECISIONS.md` beserta alasannya.
8. Gunakan Bun untuk semua perintah (`bun install`, `bun run`, `bun test`). Jangan menambah dependensi yang sudah tersedia bawaan Bun (SQLite, `.env`, test runner).
9. TypeScript strict: tanpa `any` kecuali dengan komentar alasan. `bun run typecheck` harus bersih sebelum commit.

---

## 12. Definition of Done (v1)

- [ ] Bot tersambung stabil dan reconnect otomatis.
- [ ] `/setnotification` berfungsi di grup & pribadi dengan mention yang benar.
- [ ] CRUD event, matkul, tugas lengkap dengan permission.
- [ ] Reminder terkirim tepat waktu, tanpa duplikat, dengan catch-up setelah restart.
- [ ] Semua waktu tampil di timezone chat.
- [ ] Test unit (`bun test`) untuk parser, occurrence, engine, repository.
- [ ] `bun run typecheck` dan `bun run lint` bersih.
- [ ] README: instalasi, login, daftar command, deploy.