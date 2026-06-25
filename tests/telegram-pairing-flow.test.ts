import { describe, it, expect, beforeEach } from 'vitest';
import { RemoteGateway } from '../src/main/remote/gateway';
import { MessageRouter } from '../src/main/remote/message-router';
import { ChannelBase } from '../src/main/remote/channels/channel-base';
import type {
  GatewayConfig,
  RemoteMessage,
  RemoteResponse,
  ChannelType,
} from '../src/main/remote/types';

/**
 * Mock channel that captures outbound sends and lets tests inject inbound
 * messages, without touching the network or the real Telegram Bot API.
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

  // Test helper: simulate an inbound message arriving on this channel.
  inject(message: RemoteMessage): void {
    this.emitMessage(message);
  }
}

function pairingGateway(): { gateway: RemoteGateway; channel: MockChannel } {
  const config: GatewayConfig = {
    enabled: true,
    port: 0,
    bind: '127.0.0.1',
    auth: { mode: 'pairing', allowlist: [], requirePairing: true },
  };
  const router = new MessageRouter();
  // Agent never runs in these tests; pairing is gated before routing.
  router.setAgentCallback(async () => {});
  const gateway = new RemoteGateway(config, router);
  const channel = new MockChannel();
  gateway.registerChannel(channel);
  return { gateway, channel };
}

function dm(text: string, userId = '8443134929'): RemoteMessage {
  return {
    id: `msg-${Math.random()}`,
    channelType: 'telegram',
    channelId: userId, // for Telegram DMs, chat id == user id
    sender: { id: userId, name: 'Sam', isBot: false },
    content: { type: 'text', text },
    timestamp: Date.now(),
    isGroup: false,
    isMentioned: false,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Telegram operator-approval pairing flow', () => {
  let gateway: RemoteGateway;
  let channel: MockChannel;

  beforeEach(() => {
    ({ gateway, channel } = pairingGateway());
  });

  it('creates a pending pairing request on first DM and notifies the user', async () => {
    channel.inject(dm('hello'));
    await flush();

    const pendings = gateway.getPendingPairings();
    expect(pendings).toHaveLength(1);
    expect(pendings[0].userId).toBe('8443134929');

    // The user is told their request is pending — not given a self-approve path.
    expect(channel.sent).toHaveLength(1);
    const text = channel.sent[0].content.text ?? '';
    expect(text.toLowerCase()).toContain('approve');
    expect(text.toLowerCase()).not.toContain('reply with the code');
  });

  it('does NOT let the user pair themselves by echoing the code back', async () => {
    channel.inject(dm('hello'));
    await flush();

    const code = gateway.getPendingPairings()[0].code;

    // User echoes the code — must remain unpaired and pending.
    channel.inject(dm(code));
    await flush();

    expect(gateway.getPairedUsers()).toHaveLength(0);
    expect(gateway.getPendingPairings()).toHaveLength(1);

    // Second message just reminds them it is still pending.
    const last = channel.sent[channel.sent.length - 1].content.text ?? '';
    expect(last.toLowerCase()).toContain('pending');
  });

  it('grants access only after the operator approves, and confirms in the DM', async () => {
    channel.inject(dm('hello'));
    await flush();

    const ok = gateway.approvePairing('telegram', '8443134929');
    expect(ok).toBe(true);
    expect(gateway.getPairedUsers()).toHaveLength(1);
    expect(gateway.getPendingPairings()).toHaveLength(0);

    await flush();
    const approvalMsg = channel.sent[channel.sent.length - 1].content.text ?? '';
    expect(approvalMsg.toLowerCase()).toContain('approved');
  });

  it('lets an approved user through to the agent on subsequent messages', async () => {
    channel.inject(dm('hello'));
    await flush();
    gateway.approvePairing('telegram', '8443134929');
    await flush();

    const before = gateway.getPendingPairings().length;
    channel.inject(dm('now do work'));
    await flush();

    // No new pairing request was created for an already-approved user.
    expect(gateway.getPendingPairings().length).toBe(before);
    expect(gateway.getPairedUsers()).toHaveLength(1);
  });

  it('rejecting a request clears it and notifies the user', async () => {
    channel.inject(dm('hello'));
    await flush();

    const ok = gateway.rejectPairing('telegram', '8443134929');
    expect(ok).toBe(true);
    expect(gateway.getPendingPairings()).toHaveLength(0);
    expect(gateway.getPairedUsers()).toHaveLength(0);

    await flush();
    const rejectMsg = channel.sent[channel.sent.length - 1].content.text ?? '';
    expect(rejectMsg.toLowerCase()).toContain('declined');
  });
});
