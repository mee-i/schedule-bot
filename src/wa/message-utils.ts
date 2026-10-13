import type { WAMessage } from "@whiskeysockets/baileys";

export interface ExtractedMessage {
  text: string;
  chat_jid: string;
  sender_jid: string;
  is_group: boolean;
  is_from_me: boolean;
  participant?: string | null;
  message_id: string;
  push_name?: string | null;
  raw_message: WAMessage;
}

export function extract_message_text(msg: WAMessage): string {
  const message = msg.message;
  if (!message) {
    return "";
  }

  if (message.conversation) {
    return message.conversation;
  }
  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  }
  if (message.imageMessage?.caption) {
    return message.imageMessage.caption;
  }
  if (message.videoMessage?.caption) {
    return message.videoMessage.caption;
  }
  if (message.documentMessage?.caption) {
    return message.documentMessage.caption;
  }

  return "";
}

export function extract_message(msg: WAMessage): ExtractedMessage | null {
  const key = msg.key;
  const chat_jid = key.remoteJid;
  if (!chat_jid || chat_jid === "status@broadcast") {
    return null;
  }

  const is_from_me = Boolean(key.fromMe);
  const is_group = chat_jid.endsWith("@g.us");
  const sender_jid = is_group ? key.participant ?? chat_jid : chat_jid;
  const text = extract_message_text(msg).trim();

  return {
    text,
    chat_jid,
    sender_jid,
    is_group,
    is_from_me,
    participant: key.participant,
    message_id: key.id ?? "",
    push_name: msg.pushName,
    raw_message: msg,
  };
}
