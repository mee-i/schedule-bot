import type {
  GroupMetadata,
  GroupParticipant,
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";
import type { CommandRouter } from "@/commands/router.ts";
import { chat_logger, logger } from "@/lib/logger.ts";
import { group_cache } from "@/wa/group-cache.ts";
import { extract_message } from "@/wa/message-utils.ts";
import { message_sender } from "@/wa/sender.ts";

export function is_participant_admin(
  metadata: GroupMetadata | null,
  user_jid: string
): boolean {
  if (!metadata) {
    return false;
  }
  const participant = metadata.participants.find(
    (p: GroupParticipant) => p.id === user_jid
  );
  return participant?.admin === "admin" || participant?.admin === "superadmin";
}

export function register_message_handlers(
  router: CommandRouter
): (sock: WASocket, upsert: unknown) => Promise<void> {
  return async (sock: WASocket, upsert: unknown): Promise<void> => {
    const data = upsert as {
      type?: string;
      messages?: WAMessage[];
    };

    if (data.type !== "notify" || !Array.isArray(data.messages)) {
      return;
    }

    for (const raw_msg of data.messages) {
      try {
        const extracted = extract_message(raw_msg);
        if (!extracted || extracted.is_from_me) {
          continue;
        }

        // Otomatis tandai pesan masuk sebagai telah dibaca (read receipt / centang biru)
        if (raw_msg.key) {
          try {
            await sock.readMessages([raw_msg.key]);
          } catch (read_err) {
            logger.debug({
              event: "read_receipt_failed",
              error: String(read_err),
            });
          }
        }

        if (!extracted.text) {
          continue;
        }

        let is_admin = false;
        let group_name: string | undefined;
        if (extracted.is_group) {
          const metadata = await group_cache.get_group_metadata(
            sock,
            extracted.chat_jid
          );
          group_name = metadata?.subject;
          is_admin = is_participant_admin(metadata, extracted.sender_jid);
        } else {
          is_admin = true;
        }

        // Tampilkan log pesan chat masuk dengan warna, tipe (PC/GC), timestamp, dan pengirim
        chat_logger.incoming({
          is_group: extracted.is_group,
          chat_jid: extracted.chat_jid,
          group_name,
          sender_jid: extracted.sender_jid,
          sender_name: extracted.push_name,
          text: extracted.text,
        });

        const reply = await router.dispatch({
          raw_text: extracted.text,
          chat_jid: extracted.chat_jid,
          sender_jid: extracted.sender_jid,
          is_group: extracted.is_group,
          is_admin,
          sock,
        });

        if (reply) {
          await message_sender.send_text(sock, extracted.chat_jid, reply);
        }
      } catch (error) {
        logger.error({
          event: "message_upsert_handler_error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
