/**
 * Remote Control Types
 * Type definitions for the remote control module (Telegram-focused).
 */

// Types are defined locally in this file

// ============================================================================
// Gateway Configuration
// ============================================================================

export interface GatewayConfig {
  /** Whether remote gateway is enabled */
  enabled: boolean;

  /** WebSocket server port */
  port: number;

  /** Bind address ('127.0.0.1' for local only, '0.0.0.0' for all interfaces) */
  bind: '127.0.0.1' | '0.0.0.0';

  /** Authentication configuration */
  auth: GatewayAuthConfig;

  /** Tunnel configuration for public access */
  tunnel?: TunnelConfig;

  /** Default working directory for remote sessions */
  defaultWorkingDirectory?: string;

  /** Auto-approve safe tools without user confirmation */
  autoApproveSafeTools?: boolean;
}

export interface GatewayAuthConfig {
  /** Authentication mode */
  mode: 'token' | 'allowlist' | 'pairing' | 'open';

  /** API token (required when mode is 'token') */
  token?: string;

  /** Allowed user IDs (required when mode is 'allowlist') */
  allowlist?: string[];

  /** Whether to require pairing for new users */
  requirePairing?: boolean;
}

export interface TunnelConfig {
  /** Whether tunnel is enabled */
  enabled: boolean;

  /** Tunnel type */
  type: 'frp' | 'ngrok' | 'cloudflare';

  /** FRP configuration */
  frp?: {
    serverAddr: string;
    serverPort: number;
    token?: string;
    subdomain?: string;
  };

  /** Ngrok configuration */
  ngrok?: {
    authToken: string;
    region?: string;
  };

  /** Cloudflare Tunnel configuration */
  cloudflare?: {
    tunnelToken: string;
  };
}

// ============================================================================
// Channel Configuration
// ============================================================================

// 'telegram' is the supported messaging channel. 'websocket' is reserved for
// direct clients of the local gateway control plane (not a configurable channel).
export type ChannelType = 'telegram' | 'websocket';

export interface ChannelConfig {
  /** Channel type */
  type: ChannelType;

  /** Whether this channel is enabled */
  enabled: boolean;

  /** Channel-specific configuration */
  config: TelegramChannelConfig | WebSocketChannelConfig;
}

/**
 * Direct-message access policy (mirrors OpenClaw `channels.telegram.dmPolicy`).
 *
 * - `open`     — any Telegram user can talk to the bot (requires `allowFrom: ["*"]`)
 * - `pairing`  — first DM from an unknown user creates an operator-approvable request
 * - `allowlist`— only numeric user IDs listed in `allowFrom` may talk to the bot
 * - `disabled` — DMs are rejected entirely
 */
export type TelegramDmPolicy = 'open' | 'pairing' | 'allowlist' | 'disabled';

/**
 * Group access policy (mirrors OpenClaw `channels.telegram.groupPolicy`).
 *
 * - `open`     — any member of an allowed group can trigger the bot
 * - `allowlist`— only senders in `groupAllowFrom` (falling back to `allowFrom`) may trigger it
 * - `disabled` — the bot never responds in groups
 */
export type TelegramGroupPolicy = 'open' | 'allowlist' | 'disabled';

/** Per-group / per-topic override (mirrors OpenClaw `channels.telegram.groups.<chatId>`). */
export interface TelegramGroupConfig {
  /** Require an explicit @mention of the bot before responding (default: true). */
  requireMention?: boolean;

  /** Sender IDs allowed to trigger the bot in this group (overrides groupAllowFrom). */
  allowFrom?: string[];

  /** Per-group policy override. */
  groupPolicy?: TelegramGroupPolicy;
}

// Telegram Channel
export interface TelegramChannelConfig {
  type: 'telegram';

  /** Bot token from @BotFather */
  botToken: string;

  /** Webhook URL (optional, uses polling if not set) */
  webhookUrl?: string;

  /** DM policy */
  dm: {
    policy: TelegramDmPolicy;
    allowFrom?: string[]; // Telegram user IDs (numeric; "*" for open)
  };

  /**
   * Group access policy (mirrors OpenClaw `groupPolicy`). Defaults to `allowlist`
   * (fail-closed) when not set.
   */
  groupPolicy?: TelegramGroupPolicy;

  /**
   * Sender IDs allowed to trigger the bot in groups. Falls back to `dm.allowFrom`
   * when unset (mirrors OpenClaw `groupAllowFrom`). Numeric Telegram user IDs;
   * `telegram:` / `tg:` prefixes are normalized. Use `["*"]` to allow any member
   * of an allowed group.
   */
  groupAllowFrom?: string[];

  /**
   * Group allowlist (mirrors OpenClaw `channels.telegram.groups`). Keys are
   * numeric Telegram group/supergroup chat IDs (negative, e.g. `-1001234567890`)
   * or `"*"` to match any group. When present, acts as an allowlist: groups not
   * listed (and without a `"*"` entry) are blocked.
   */
  groups?: {
    [chatId: string]: TelegramGroupConfig;
  };
}

// WebSocket Client Channel (direct clients of the local gateway control plane)
export interface WebSocketChannelConfig {
  type: 'websocket';

  /** Allowed client IDs */
  allowedClients?: string[];

  /** Whether to allow anonymous connections */
  allowAnonymous?: boolean;
}

// ============================================================================
// Remote Message Protocol
// ============================================================================

/**
 * Unified message format for all channels
 */
export interface RemoteMessage {
  /** Unique message ID */
  id: string;

  /** Channel type */
  channelType: ChannelType;

  /** Channel-specific chat/room ID */
  channelId: string;

  /** Sender information */
  sender: RemoteSender;

  /** Message content */
  content: RemoteContent;

  /** Reply to message ID (if this is a reply) */
  replyTo?: string;

  /** Message timestamp */
  timestamp: number;

  /** Whether this is a group message */
  isGroup: boolean;

  /** Whether the bot was mentioned (@) */
  isMentioned: boolean;

  /** Raw platform-specific data */
  raw?: unknown;
}

export interface RemoteSender {
  /** Platform-specific user ID */
  id: string;

  /** Display name */
  name?: string;

  /** Avatar URL */
  avatar?: string;

  /** Whether this is a bot */
  isBot: boolean;

  /** Platform-specific extra info */
  extra?: Record<string, unknown>;
}

export interface RemoteContent {
  /** Content type */
  type: 'text' | 'image' | 'file' | 'voice' | 'video' | 'rich_text' | 'interactive';

  /** Text content (for text type) */
  text?: string;

  /** Image URL or key (for image type) */
  imageUrl?: string;
  imageKey?: string;

  /** File information (for file type) */
  file?: {
    name: string;
    url?: string;
    key?: string;
    size?: number;
    mimeType?: string;
  };

  /** Voice/audio information */
  voice?: {
    url?: string;
    key?: string;
    duration?: number;
  };

  /** Rich text content (platform-specific) */
  richText?: unknown;

  /** Interactive card content (platform-specific) */
  interactive?: unknown;
}

/**
 * Response to send back to channel
 */
export interface RemoteResponse {
  /** Target channel type */
  channelType: ChannelType;

  /** Target chat/room ID */
  channelId: string;

  /** Content to send */
  content: RemoteResponseContent;

  /** Reply to specific message */
  replyTo?: string;
}

export interface RemoteResponseContent {
  /** Content type */
  type: 'text' | 'markdown' | 'image' | 'file' | 'card';

  /** Text content */
  text?: string;

  /** Markdown content */
  markdown?: string;

  /** Image to send */
  image?: {
    url?: string;
    base64?: string;
    key?: string;
  };

  /** File to send */
  file?: {
    url?: string;
    path?: string;
    name: string;
  };

  /** Interactive card (platform-specific) */
  card?: unknown;
}

// ============================================================================
// Remote Session Management
// ============================================================================

/**
 * Maps remote chat to local session
 */
export interface RemoteSessionMapping {
  /** Remote channel type */
  channelType: ChannelType;

  /** Remote chat/room ID */
  channelId: string;

  /** Remote user ID (for DM sessions) */
  userId?: string;

  /** Local session ID */
  sessionId: string;

  /** Working directory for this session */
  workingDirectory?: string;

  /** Session creation timestamp */
  createdAt: number;

  /** Last activity timestamp */
  lastActiveAt: number;
}

// ============================================================================
// Gateway Events
// ============================================================================

export type GatewayEventType =
  | 'gateway.started'
  | 'gateway.stopped'
  | 'gateway.error'
  | 'channel.connected'
  | 'channel.disconnected'
  | 'channel.error'
  | 'message.received'
  | 'message.sent'
  | 'session.created'
  | 'session.ended';

export interface GatewayEvent {
  type: GatewayEventType;
  timestamp: number;
  data: unknown;
}

// ============================================================================
// Channel Interface
// ============================================================================

export interface IChannel {
  /** Channel type */
  readonly type: ChannelType;

  /** Whether the channel is connected */
  readonly connected: boolean;

  /** Start the channel */
  start(): Promise<void>;

  /** Stop the channel */
  stop(): Promise<void>;

  /** Send a response to the channel */
  send(response: RemoteResponse): Promise<void>;

  /** Set message handler */
  onMessage(handler: (message: RemoteMessage) => void): void;

  /** Set error handler */
  onError(handler: (error: Error) => void): void;
}

// ============================================================================
// Pairing
// ============================================================================

export interface PairingRequest {
  /** Pairing code (6 digits) */
  code: string;

  /** Channel type */
  channelType: ChannelType;

  /** User ID */
  userId: string;

  /** User name */
  userName?: string;

  /** Request timestamp */
  createdAt: number;

  /** Expiry timestamp */
  expiresAt: number;
}

export interface PairedUser {
  /** User ID */
  userId: string;

  /** User name */
  userName?: string;

  /** Channel type */
  channelType: ChannelType;

  /** Paired timestamp */
  pairedAt: number;

  /** Last active timestamp */
  lastActiveAt: number;
}

// ============================================================================
// Gateway Status
// ============================================================================

export interface GatewayStatus {
  /** Whether gateway is running */
  running: boolean;

  /** Gateway port */
  port?: number;

  /** Public URL (if tunnel is active) */
  publicUrl?: string;

  /** Connected channels */
  channels: {
    type: ChannelType;
    connected: boolean;
    error?: string;
  }[];

  /** Active remote sessions count */
  activeSessions: number;

  /** Pending pairing requests */
  pendingPairings: number;
}

// ============================================================================
// Remote Config Store
// ============================================================================

export interface RemoteConfig {
  gateway: GatewayConfig;
  channels: {
    telegram?: TelegramChannelConfig;
    websocket?: WebSocketChannelConfig;
  };
}

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  gateway: {
    enabled: false,
    port: 18789,
    bind: '127.0.0.1',
    auth: {
      // Default to pairing (matches OpenClaw's default dmPolicy): the first DM
      // from an unknown user creates an operator-approvable request instead of
      // being silently denied. Operators can switch to 'allowlist' or 'open'.
      mode: 'pairing',
      allowlist: [],
      requirePairing: true,
    },
  },
  channels: {},
};
