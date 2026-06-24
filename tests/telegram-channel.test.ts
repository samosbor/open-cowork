import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/main/utils/logger', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { TelegramChannel } from '../src/main/remote/channels/telegram';
import type {
  RemoteMessage,
  RemoteResponse,
  TelegramChannelConfig,
} from '../src/main/remote/types';

interface FetchCall {
  method: string;
  body: Record<string, unknown>;
}

/**
 * Installs a mock for global.fetch that intercepts Telegram Bot API calls.
 * Returns a list of recorded calls and a helper to queue method responses.
 */
function installFetchMock(options?: {
  /** Map of Telegram method name -> result payload (or a function returning one). */
  responses?: Record<string, unknown | (() => unknown)>;
}) {
  const calls: FetchCall[] = [];
  const responses = options?.responses ?? {};

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = url.split('/').pop() ?? '';
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    calls.push({ method, body });

    let result: unknown;
    if (method in responses) {
      const r = responses[method];
      result = typeof r === 'function' ? (r as () => unknown)() : r;
    } else if (method === 'getMe') {
      result = { id: 999, is_bot: true, username: 'cowork_bot', first_name: 'Cowork' };
    } else if (method === 'getUpdates') {
      result = [];
    } else {
      result = { message_id: 1, ok: true };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result }),
    } as unknown as Response;
  });

  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function makeConfig(overrides: Partial<TelegramChannelConfig> = {}): TelegramChannelConfig {
  return {
    type: 'telegram',
    botToken: 'TEST:TOKEN',
    dm: { policy: 'open' },
    ...overrides,
  };
}

function privateTextUpdate(text: string, opts?: { userId?: number; chatId?: number }) {
  return {
    update_id: 100,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      text,
      from: {
        id: opts?.userId ?? 42,
        is_bot: false,
        username: 'alice',
        first_name: 'Alice',
      },
      chat: {
        id: opts?.chatId ?? 42,
        type: 'private',
      },
    },
  };
}

describe('TelegramChannel', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts in polling mode: calls getMe and deleteWebhook', async () => {
    const { calls } = installFetchMock();
    const channel = new TelegramChannel(makeConfig());

    await channel.start();

    expect(channel.connected).toBe(true);
    const methods = calls.map((c) => c.method);
    expect(methods).toContain('getMe');
    expect(methods).toContain('deleteWebhook');
    expect(methods).not.toContain('setWebhook');

    await channel.stop();
    expect(channel.connected).toBe(false);
  });

  it('starts in webhook mode when webhookUrl is configured', async () => {
    const { calls } = installFetchMock();
    const channel = new TelegramChannel(
      makeConfig({ webhookUrl: 'https://example.com/webhook/telegram' })
    );

    await channel.start();

    const setWebhook = calls.find((c) => c.method === 'setWebhook');
    expect(setWebhook).toBeDefined();
    expect(setWebhook?.body.url).toBe('https://example.com/webhook/telegram');

    await channel.stop();
  });

  it('throws when botToken is missing', async () => {
    installFetchMock();
    const channel = new TelegramChannel(makeConfig({ botToken: '' }));
    await expect(channel.start()).rejects.toThrow(/botToken is required/i);
    expect(channel.connected).toBe(false);
  });

  it('parses an inbound private message via webhook into a RemoteMessage', async () => {
    installFetchMock();
    const channel = new TelegramChannel(makeConfig());
    await channel.start();

    const received: RemoteMessage[] = [];
    channel.onMessage((m) => received.push(m));

    const result = channel.handleWebhook({}, JSON.stringify(privateTextUpdate('hello world')));

    expect(result.status).toBe(200);
    expect(received).toHaveLength(1);
    const msg = received[0];
    expect(msg.channelType).toBe('telegram');
    expect(msg.channelId).toBe('42');
    expect(msg.sender.id).toBe('42');
    expect(msg.sender.name).toBe('alice');
    expect(msg.content.text).toBe('hello world');
    expect(msg.isGroup).toBe(false);

    await channel.stop();
  });

  it('ignores messages from bots', async () => {
    installFetchMock();
    const channel = new TelegramChannel(makeConfig());
    await channel.start();

    const received: RemoteMessage[] = [];
    channel.onMessage((m) => received.push(m));

    const update = privateTextUpdate('from a bot');
    update.message.from.is_bot = true;

    channel.handleWebhook({}, JSON.stringify(update));
    expect(received).toHaveLength(0);

    await channel.stop();
  });

  it('detects mentions and strips the bot username in group chats', async () => {
    installFetchMock();
    const channel = new TelegramChannel(makeConfig());
    await channel.start();

    const received: RemoteMessage[] = [];
    channel.onMessage((m) => received.push(m));

    const groupUpdate = {
      update_id: 200,
      message: {
        message_id: 5,
        date: Math.floor(Date.now() / 1000),
        text: '@cowork_bot please summarize this',
        from: { id: 7, is_bot: false, username: 'bob', first_name: 'Bob' },
        chat: { id: -1001, type: 'supergroup', title: 'Team' },
      },
    };

    channel.handleWebhook({}, JSON.stringify(groupUpdate));

    expect(received).toHaveLength(1);
    expect(received[0].isGroup).toBe(true);
    expect(received[0].isMentioned).toBe(true);
    expect(received[0].content.text).toBe('please summarize this');

    await channel.stop();
  });

  it('returns 400 for malformed webhook payloads', async () => {
    installFetchMock();
    const channel = new TelegramChannel(makeConfig());
    await channel.start();

    const result = channel.handleWebhook({}, '{not valid json');
    expect(result.status).toBe(400);
    expect(result.data.ok).toBe(false);

    await channel.stop();
  });

  it('sends a text response via sendMessage', async () => {
    const { calls } = installFetchMock();
    const channel = new TelegramChannel(makeConfig());
    await channel.start();

    const response: RemoteResponse = {
      channelType: 'telegram',
      channelId: '42',
      content: { type: 'text', text: 'Done!' },
    };

    await channel.send(response);

    const send = calls.find((c) => c.method === 'sendMessage');
    expect(send).toBeDefined();
    expect(send?.body.chat_id).toBe('42');
    expect(send?.body.text).toBe('Done!');

    await channel.stop();
  });

  it('splits long messages into multiple sendMessage calls', async () => {
    const { calls } = installFetchMock();
    const channel = new TelegramChannel(makeConfig());
    await channel.start();

    const longText = 'x'.repeat(9000); // > 3800 char chunk size used by the channel
    await channel.send({
      channelType: 'telegram',
      channelId: '42',
      content: { type: 'text', text: longText },
    });

    const sends = calls.filter((c) => c.method === 'sendMessage');
    expect(sends.length).toBeGreaterThan(1);
    const reassembled = sends.map((s) => s.body.text as string).join('');
    expect(reassembled).toBe(longText);

    await channel.stop();
  });

  it('throws when sending while not connected', async () => {
    installFetchMock();
    const channel = new TelegramChannel(makeConfig());
    await expect(
      channel.send({
        channelType: 'telegram',
        channelId: '42',
        content: { type: 'text', text: 'hi' },
      })
    ).rejects.toThrow(/not connected/i);
  });

  it('surfaces Telegram API errors with the description', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, error_code: 401, description: 'Unauthorized' }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const channel = new TelegramChannel(makeConfig());
    await expect(channel.start()).rejects.toThrow(/Unauthorized/);
    expect(channel.connected).toBe(false);
  });
});
