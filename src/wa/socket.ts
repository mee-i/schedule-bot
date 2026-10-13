import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  type ConnectionState,
  type UserFacingSocketConfig,
  type WASocket,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import type { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import qrcode from "qrcode-terminal";
import { env } from "@/config/env.ts";
import { get_database } from "@/db/client.ts";
import { logger } from "@/lib/logger.ts";
import { group_cache } from "@/wa/group-cache.ts";
import { useSQLiteAuthState } from "@/wa/sqlite-auth.ts";

export interface SocketOptions {
  on_message_upsert?: (sock: WASocket, upsert: unknown) => Promise<void>;
  on_group_update?: (update: unknown) => void;
  db?: Database;
  session_id?: string;
}

function parse_pairing_arg(): string | undefined {
  for (const arg of process.argv) {
    if (arg.startsWith("--pairing=")) {
      return arg.slice("--pairing=".length);
    }
    if (arg.startsWith("--phone=")) {
      return arg.slice("--phone=".length);
    }
  }
  return undefined;
}

function prompt_input(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function normalize_phone_number(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("08")) {
    cleaned = "62" + cleaned.slice(1);
  }
  return cleaned;
}

export class WhatsAppConnection {
  private sock: WASocket | null = null;
  private reconnect_attempts = 0;
  private is_stopping = false;
  private pairing_code_requested = false;
  private pairing_phone?: string;
  private use_pairing_code = false;
  private clear_auth_state?: () => Promise<void>;

  constructor(private readonly options: SocketOptions = {}) {}

  async start(): Promise<WASocket> {
    const db = this.options.db ?? get_database();
    const legacy_auth_dir = path.join(env.DATA_DIR, "auth");

    const { state, saveCreds, clearState } = await useSQLiteAuthState(db, {
      sessionId: this.options.session_id ?? "baileys",
      legacyAuthDir: legacy_auth_dir,
    });
    this.clear_auth_state = clearState;

    const is_authenticated = Boolean(
      state.creds.me?.id || state.creds.registered
    );

    if (!this.use_pairing_code) {
      this.use_pairing_code =
        process.argv.includes("--pairing") ||
        process.argv.includes("--use-pairing-code") ||
        process.argv.some(
          (arg) => arg.startsWith("--pairing=") || arg.startsWith("--phone=")
        ) ||
        Boolean(env.PAIRING_PHONE);
    }

    if (!this.pairing_phone) {
      const detected = env.PAIRING_PHONE || parse_pairing_arg();
      if (detected) {
        this.pairing_phone = normalize_phone_number(detected);
      }
    }

    // Hanya tampilkan prompt login jika BENAR-BENAR belum terautentikasi dan bukan sedang reconnect
    if (!is_authenticated && this.reconnect_attempts === 0) {
      if (
        this.use_pairing_code &&
        !this.pairing_phone &&
        process.stdin.isTTY
      ) {
        console.log("\n=======================================================");
        console.log("            LOGIN WHATSAPP VIA PAIRING CODE            ");
        console.log("=======================================================");
        const entered = await prompt_input(
          "Masukkan nomor WhatsApp Anda (contoh: 6281234567890): "
        );
        if (entered) {
          this.pairing_phone = normalize_phone_number(entered);
        }
      } else if (
        !this.use_pairing_code &&
        process.stdin.isTTY &&
        !process.argv.includes("--qr")
      ) {
        console.log("\n=======================================================");
        console.log("             METODE LOGIN WHATSAPP BOT                 ");
        console.log("=======================================================");
        console.log("1. Scan QR Code di terminal (default)");
        console.log("2. Masukkan nomor HP untuk Pairing Code (8 digit)");
        console.log("=======================================================");
        const choice = await prompt_input(
          "Pilih metode login [1/2] (default: 1): "
        );
        if (choice === "2") {
          this.use_pairing_code = true;
          const entered = await prompt_input(
            "Masukkan nomor WhatsApp Anda (contoh: 6281234567890): "
          );
          if (entered) {
            this.pairing_phone = normalize_phone_number(entered);
          }
        }
      }
    }

    let version: [number, number, number] | undefined;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
      logger.info({
        event: "baileys_version",
        version,
        isLatest: latest.isLatest,
      });
    } catch (err) {
      logger.warn({
        event: "baileys_version_check_failed",
        error: String(err),
      });
    }

    const raw_baileys_logger = logger.child({ module: "baileys" });
    raw_baileys_logger.level = "warn";

    // Proxy wrapper untuk meredam spam log kegagalan dekripsi Baileys di terminal
    const baileys_logger = new Proxy(raw_baileys_logger, {
      get(target, prop, receiver) {
        if (prop === "error") {
          return (arg1: unknown, arg2?: unknown, ...rest: unknown[]) => {
            const msg =
              typeof arg1 === "string"
                ? arg1
                : typeof arg2 === "string"
                  ? arg2
                  : "";
            const err_obj =
              arg1 && typeof arg1 === "object" && "err" in arg1
                ? (arg1 as { err?: { message?: string } }).err
                : undefined;

            if (
              msg.includes("failed to decrypt message") ||
              err_obj?.message?.includes("No session found to decrypt message") ||
              err_obj?.message?.includes("No SenderKeyRecord found")
            ) {
              return;
            }
            return (target.error as (...args: unknown[]) => void)(
              arg1,
              arg2,
              ...rest
            );
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    this.sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu("Chrome"),
      printQRInTerminal: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: (msg) => {
        return (
          msg.syncType === proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP ||
          msg.syncType === proto.HistorySync.HistorySyncType.PUSH_NAME
        );
      },
      getMessage: async (_key) => undefined,
      cachedGroupMetadata: async (jid) =>
        group_cache.get_cached(jid) ?? undefined,
      logger: baileys_logger as NonNullable<
        UserFacingSocketConfig["logger"]
      >,
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on(
      "connection.update",
      async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !is_authenticated) {
          if (this.use_pairing_code && this.pairing_phone) {
            if (!this.pairing_code_requested && this.sock) {
              this.pairing_code_requested = true;
              try {
                await new Promise((r) => setTimeout(r, 1000));
                const code = await this.sock.requestPairingCode(
                  this.pairing_phone
                );
                console.log(
                  "\n======================================================="
                );
                console.log(
                  "       KODE PAIRING WHATSAPP ANDA TELAH DIBUAT          "
                );
                console.log(
                  "======================================================="
                );
                console.log(`Kode Pairing : ${code}`);
                console.log("");
                console.log("Instruksi login di HP:");
                console.log("1. Buka aplikasi WhatsApp di HP Anda");
                console.log(
                  "2. Buka Pengaturan > Perangkat Tertaut (Linked Devices)"
                );
                console.log(
                  "3. Pilih Tautkan Perangkat > Tautkan dengan nomor telepon saja"
                );
                console.log(`4. Masukkan kode 8 digit di atas: ${code}`);
                console.log(
                  "=======================================================\n"
                );
                logger.info({ event: "pairing_code_generated", code });
              } catch (err) {
                logger.error({
                  event: "pairing_code_error",
                  error: String(err),
                });
                this.pairing_code_requested = false;
              }
            }
          } else {
            console.log(
              "\n======================================================="
            );
            console.log(
              "             SCAN WHATSAPP QR CODE DI BAWAH            "
            );
            console.log(
              "======================================================="
            );
            console.log("1. Buka WhatsApp di HP Anda");
            console.log(
              "2. Buka Pengaturan > Perangkat Tertaut > Tautkan Perangkat"
            );
            console.log("3. Arahkan kamera ke QR Code di bawah:");
            console.log(
              "=======================================================\n"
            );
            qrcode.generate(qr, { small: true });
          }
        }

        if (connection === "close") {
          const reason = (lastDisconnect?.error as Boom | undefined)?.output
            ?.statusCode;
          const should_reconnect =
            !this.is_stopping && reason !== DisconnectReason.loggedOut;

          logger.warn({
            event: "connection_closed",
            statusCode: reason,
            reconnecting: should_reconnect,
          });

          this.pairing_code_requested = false;

          if (reason === DisconnectReason.loggedOut) {
            logger.error(
              "WhatsApp session logged out. Removing auth credentials..."
            );
            if (this.clear_auth_state) {
              await this.clear_auth_state();
            }
            if (fs.existsSync(legacy_auth_dir)) {
              try {
                fs.rmSync(legacy_auth_dir, { recursive: true, force: true });
              } catch {
                // ignore
              }
            }
          } else if (should_reconnect) {
            this.handle_reconnect();
          }
        } else if (connection === "open") {
          this.reconnect_attempts = 0;
          this.pairing_code_requested = false;
          console.log(
            "\n======================================================="
          );
          console.log("✅ Berhasil login dan terhubung ke WhatsApp!");
          console.log(
            "=======================================================\n"
          );
          logger.info("WhatsApp connection established successfully.");
        }
      }
    );

    this.sock.ev.on("messages.upsert", async (upsert) => {
      if (this.sock && this.options.on_message_upsert) {
        await this.options.on_message_upsert(this.sock, upsert);
      }
    });

    this.sock.ev.on("group-participants.update", (update) => {
      group_cache.invalidate(update.id);
      if (this.options.on_group_update) {
        this.options.on_group_update(update);
      }
    });

    return this.sock;
  }

  private handle_reconnect(): void {
    const delays = [1000, 2000, 5000, 10000, 30000];
    const delay =
      delays[Math.min(this.reconnect_attempts, delays.length - 1)] ?? 30000;
    this.reconnect_attempts += 1;

    logger.info({
      event: "scheduling_reconnect",
      attempt: this.reconnect_attempts,
      delay_ms: delay,
    });

    setTimeout(() => {
      if (!this.is_stopping) {
        this.start().catch((err) => {
          logger.error({ event: "reconnect_failed", error: String(err) });
        });
      }
    }, delay);
  }

  get_socket(): WASocket | null {
    return this.sock;
  }

  is_connected(): boolean {
    return this.sock !== null && !this.is_stopping;
  }

  async logout(): Promise<void> {
    this.is_stopping = true;
    const legacy_auth_dir = path.join(env.DATA_DIR, "auth");
    if (this.sock) {
      try {
        await this.sock.logout("User requested logout from CLI");
      } catch {
        // Socket might already be closed or in error state
      }
      this.sock = null;
    }
    if (this.clear_auth_state) {
      try {
        await this.clear_auth_state();
        logger.info({ event: "sqlite_auth_state_cleared" });
      } catch (err) {
        logger.error({
          event: "sqlite_auth_cleanup_failed",
          error: String(err),
        });
      }
    }
    if (fs.existsSync(legacy_auth_dir)) {
      try {
        fs.rmSync(legacy_auth_dir, { recursive: true, force: true });
        logger.info({ event: "legacy_auth_directory_cleared", legacy_auth_dir });
      } catch (err) {
        logger.error({ event: "auth_cleanup_failed", error: String(err) });
      }
    }
  }

  stop(): void {
    this.is_stopping = true;
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch (err) {
        logger.error({ event: "socket_close_error", error: String(err) });
      }
      this.sock = null;
    }
  }
}
