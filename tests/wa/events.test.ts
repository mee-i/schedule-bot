import { describe, expect, it } from "bun:test";
import { register_message_handlers } from "@/wa/events.ts";
import type { CommandRouter } from "@/commands/router.ts";
import type { WAMessage, WASocket } from "@whiskeysockets/baileys";

describe("Message Events Handler", () => {
  it("marks incoming messages as read and dispatches command", async () => {
    let read_keys: unknown[] = [];
    let dispatched_text = "";

    const mock_sock = {
      readMessages: async (keys: unknown[]) => {
        read_keys.push(...keys);
      },
    } as unknown as WASocket;

    const mock_router = {
      dispatch: async (params: { raw_text: string }) => {
        dispatched_text = params.raw_text;
        return null;
      },
    } as unknown as CommandRouter;

    const handler = register_message_handlers(mock_router);

    const raw_msg = {
      key: {
        remoteJid: "user@s.whatsapp.net",
        fromMe: false,
        id: "MSG_001",
      },
      message: {
        conversation: "/ping",
      },
    } as unknown as WAMessage;

    await handler(mock_sock, {
      type: "notify",
      messages: [raw_msg],
    });

    expect(read_keys).toHaveLength(1);
    expect(read_keys[0]).toEqual(raw_msg.key);
    expect(dispatched_text).toBe("/ping");
  });

  it("marks incoming media/non-command message as read even if text is empty", async () => {
    let read_keys: unknown[] = [];
    let dispatched = false;

    const mock_sock = {
      readMessages: async (keys: unknown[]) => {
        read_keys.push(...keys);
      },
    } as unknown as WASocket;

    const mock_router = {
      dispatch: async () => {
        dispatched = true;
        return null;
      },
    } as unknown as CommandRouter;

    const handler = register_message_handlers(mock_router);

    const media_msg = {
      key: {
        remoteJid: "user@s.whatsapp.net",
        fromMe: false,
        id: "MSG_STICKER",
      },
      message: {
        stickerMessage: {},
      },
    } as unknown as WAMessage;

    await handler(mock_sock, {
      type: "notify",
      messages: [media_msg],
    });

    // Still marks as read
    expect(read_keys).toHaveLength(1);
    expect(read_keys[0]).toEqual(media_msg.key);
    // Does not dispatch command
    expect(dispatched).toBe(false);
  });

  it("does not mark as read if message is from me", async () => {
    let read_keys: unknown[] = [];

    const mock_sock = {
      readMessages: async (keys: unknown[]) => {
        read_keys.push(...keys);
      },
    } as unknown as WASocket;

    const mock_router = {
      dispatch: async () => null,
    } as unknown as CommandRouter;

    const handler = register_message_handlers(mock_router);

    const from_me_msg = {
      key: {
        remoteJid: "user@s.whatsapp.net",
        fromMe: true,
        id: "MSG_FROM_ME",
      },
      message: {
        conversation: "Hello from bot",
      },
    } as unknown as WAMessage;

    await handler(mock_sock, {
      type: "notify",
      messages: [from_me_msg],
    });

    expect(read_keys).toHaveLength(0);
  });
});
