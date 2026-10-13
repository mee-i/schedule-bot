import { describe, expect, it } from "bun:test";
import { extract_message } from "@/wa/message-utils.ts";
import type { WAMessage } from "@whiskeysockets/baileys";

describe("Message Utils", () => {
  it("extracts conversation from standard group message", () => {
    const mock_msg = {
      key: {
        remoteJid: "12345@g.us",
        participant: "628111@s.whatsapp.net",
        fromMe: false,
        id: "MSG123",
      },
      message: {
        conversation: "/ping",
      },
    } as unknown as WAMessage;

    const extracted = extract_message(mock_msg);
    expect(extracted).not.toBeNull();
    expect(extracted?.chat_jid).toBe("12345@g.us");
    expect(extracted?.sender_jid).toBe("628111@s.whatsapp.net");
    expect(extracted?.is_group).toBe(true);
    expect(extracted?.text).toBe("/ping");
    expect(extracted?.is_from_me).toBe(false);
  });

  it("extracts text from extendedTextMessage", () => {
    const mock_msg = {
      key: {
        remoteJid: "user@s.whatsapp.net",
        fromMe: false,
        id: "MSG456",
      },
      message: {
        extendedTextMessage: {
          text: "/help event",
        },
      },
    } as unknown as WAMessage;

    const extracted = extract_message(mock_msg);
    expect(extracted?.text).toBe("/help event");
    expect(extracted?.is_group).toBe(false);
  });

  it("skips status@broadcast", () => {
    const mock_msg = {
      key: {
        remoteJid: "status@broadcast",
        fromMe: false,
        id: "STATUS",
      },
      message: {
        conversation: "Story update",
      },
    } as unknown as WAMessage;

    const extracted = extract_message(mock_msg);
    expect(extracted).toBeNull();
  });
});
