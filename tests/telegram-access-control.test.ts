import { describe, it, expect } from 'vitest';
import { RemoteGateway } from '../src/main/remote/gateway';
import { MessageRouter } from '../src/main/remote/message-router';
import { ChannelBase } from '../src/main/remote/channels/channel-base';
import type {
  GatewayConfig,
  RemoteMessage,
  RemoteResponse,
  ChannelType,
  TelegramChannelConfig,
} from '../src/main/remote/types';

/**
 * Mock channel + a routed-message spy. These tests assert OpenClaw-style
 * Telegram access control: DM policies (open/allowlist/disabled) and group
 * policies (allowlist/open, requireMention, allowFrom).
 */
class MockChannel extends ChannelBase {
  readonly type: ChannelType = 'telegram';
  readonly sent: RemoteResponse[] = [];

  async start(): Promise<void> {
    this._connected = true;
  }
  async stop(): Promise<void> {
    this._connected = false;
  }
  async send(response: RemoteResponse): Promise<void> {
    this.sent.push(response);
  }
  inject(message: RemoteMessage): void {
    this.emitMessage(message);
  }
}

interface Harness {
  gateway: RemoteGateway;
  channel: MockChannel;
  routed: RemoteMessage[];
}

function makeGateway(
  authMode: GatewayConfig['auth']['mode'],
  telegram?: Partial<TelegramChannelConfig>,
  allowlist: string[] = []
): Harness {
  const config: GatewayConfig = {
    enabled: true,
    port: 0,
    bind: '127.0.0.1',
    auth: { mode: authMode, allowlist, requirePairing: authMode === 'pairing' },
  };
  const router = new MessageRouter();
  const routed: RemoteMessage[] = [];
  router.setAgentCallback(async (_sid, _prompt, _content, _wd, channelType, channelId, senderId) => {
    routed.push({
      id: 'routed',
      channelType: channelType as ChannelType,
      channelId,
      sender: { id: senderId, isBot: false },
      content: { type: 'text' },
      timestamp: Date.now(),
      isGroup: false,
      isMentioned: false,
    });
  });
  const gateway = new RemoteGateway(config, router);
  const channel = new MockChannel();
  gateway.registerChannel(channel);
  if (telegram) {
    gateway.setTelegramConfig({ type: 'telegram', botToken: 'x', dm: { policy: 'pairing' }, ...telegram });
  }
  return { gateway, channel, routed };
}

function dm(text: string, userId = '111'): RemoteMessage {
  return {
    id: `dm-${Math.random()}`,
    channelType: 'telegram',
    channelId: userId,
    sender: { id: userId, name: 'User', isBot: false },
    content: { type: 'text', text },
    timestamp: Date.now(),
    isGroup: false,
    isMentioned: false,
  };
}

function groupMsg(opts: {
  chatId?: string;
  userId?: string;
  mentioned?: boolean;
  text?: string;
}): RemoteMessage {
  return {
    id: `grp-${Math.random()}`,
    channelType: 'telegram',
    channelId: opts.chatId ?? '-1001234567890',
    sender: { id: opts.userId ?? '111', name: 'User', isBot: false },
    content: { type: 'text', text: opts.text ?? 'hello' },
    timestamp: Date.now(),
    isGroup: true,
    isMentioned: opts.mentioned ?? false,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Telegram DM policies', () => {
  it("dmPolicy 'open' (allowlist mode + wildcard) lets any user through", async () => {
    const { channel, routed } = makeGateway('open', { dm: { policy: 'open', allowFrom: ['*'] } });
    channel.inject(dm('hi', '999'));
    await flush();
    expect(routed).toHaveLength(1);
  });

  it("dmPolicy 'allowlist' permits listed numeric IDs and normalizes tg:/telegram: prefixes", async () => {
    const { channel, routed } = makeGateway(
      'allowlist',
      { dm: { policy: 'allowlist', allowFrom: ['tg:777'] } },
      ['telegram:777']
    );
    channel.inject(dm('hi', '777'));
    await flush();
    expect(routed).toHaveLength(1);
  });

  it("dmPolicy 'allowlist' blocks unlisted users", async () => {
    const { channel, routed } = makeGateway('allowlist', undefined, ['telegram:777']);
    channel.inject(dm('hi', '123'));
    await flush();
    expect(routed).toHaveLength(0);
    // Unauthorized users get a notice.
    expect(channel.sent.length).toBeGreaterThan(0);
  });

  it("dmPolicy 'disabled' silently drops DMs", async () => {
    const { channel, routed } = makeGateway('allowlist', { dm: { policy: 'disabled' } }, []);
    channel.inject(dm('hi', '123'));
    await flush();
    expect(routed).toHaveLength(0);
    // No reply is sent for disabled DMs.
    expect(channel.sent).toHaveLength(0);
  });
});

describe('Telegram group access control', () => {
  it('blocks groups by default (fail-closed allowlist policy, no groups configured)', async () => {
    const { channel, routed } = makeGateway('open', { groupPolicy: 'allowlist' });
    channel.inject(groupMsg({ mentioned: true }));
    await flush();
    expect(routed).toHaveLength(0);
  });

  it('allows a configured group when mentioned and sender is in allowFrom', async () => {
    const { channel, routed } = makeGateway('open', {
      groupPolicy: 'allowlist',
      groups: { '-1001234567890': { requireMention: true, allowFrom: ['111'] } },
    });
    channel.inject(groupMsg({ chatId: '-1001234567890', userId: '111', mentioned: true }));
    await flush();
    expect(routed).toHaveLength(1);
  });

  it('ignores configured-group messages without a mention when requireMention is true', async () => {
    const { channel, routed } = makeGateway('open', {
      groupPolicy: 'allowlist',
      groups: { '-1001234567890': { requireMention: true, allowFrom: ['111'] } },
    });
    channel.inject(groupMsg({ userId: '111', mentioned: false }));
    await flush();
    expect(routed).toHaveLength(0);
  });

  it('blocks a sender not in the group allowFrom', async () => {
    const { channel, routed } = makeGateway('open', {
      groupPolicy: 'allowlist',
      groups: { '-1001234567890': { requireMention: false, allowFrom: ['111'] } },
    });
    channel.inject(groupMsg({ userId: '222', mentioned: false }));
    await flush();
    expect(routed).toHaveLength(0);
  });

  it("per-group groupPolicy 'open' + requireMention false lets any member through", async () => {
    const { channel, routed } = makeGateway('open', {
      groupPolicy: 'allowlist',
      groups: { '-1001234567890': { groupPolicy: 'open', requireMention: false } },
    });
    channel.inject(groupMsg({ userId: '999', mentioned: false }));
    await flush();
    expect(routed).toHaveLength(1);
  });

  it("wildcard '*' group entry applies defaults to any group", async () => {
    const { channel, routed } = makeGateway('open', {
      groupPolicy: 'allowlist',
      groupAllowFrom: ['111'],
      groups: { '*': { requireMention: false } },
    });
    channel.inject(groupMsg({ chatId: '-1009999999999', userId: '111', mentioned: false }));
    await flush();
    expect(routed).toHaveLength(1);
  });

  it("groupPolicy 'disabled' never responds in groups", async () => {
    const { channel, routed } = makeGateway('open', {
      groupPolicy: 'disabled',
      groups: { '*': { requireMention: false } },
    });
    channel.inject(groupMsg({ mentioned: true }));
    await flush();
    expect(routed).toHaveLength(0);
  });

  it('does not inherit DM authorization for group senders', async () => {
    // Sender is allowed for DMs (allowFrom) but not for the group (no groupAllowFrom,
    // falls back to dm.allowFrom -> here we make them differ).
    const { channel, routed } = makeGateway('open', {
      dm: { policy: 'allowlist', allowFrom: ['111'] },
      groupPolicy: 'allowlist',
      groupAllowFrom: ['222'],
      groups: { '-1001234567890': { requireMention: false } },
    });
    channel.inject(groupMsg({ userId: '111', mentioned: false }));
    await flush();
    expect(routed).toHaveLength(0);
  });
});
