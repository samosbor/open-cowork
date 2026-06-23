/**
 * Telegram Channel
 * Implements Telegram bot message receive/send via Bot API.
 */

import { ChannelBase, withRetry } from '../channel-base';
import { log, logError, logWarn } from '../../../utils/logger';
import type {
  TelegramChannelConfig,
  RemoteMessage,
  RemoteResponse,
  RemoteResponseContent,
} from '../../types';

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  from?: TelegramUser;
  chat: TelegramChat;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export class TelegramChannel extends ChannelBase {
  readonly type = 'telegram' as const;

  private config: TelegramChannelConfig;
  private botUserId?: number;
  private botUsername?: string;
  private updateOffset = 0;
  private pollTimer?: NodeJS.Timeout;
  private isPolling = false;

  constructor(config: TelegramChannelConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this._connected) {
      logWarn('[Telegram] Channel already started');
      return;
    }

    if (!this.config.botToken) {
      throw new Error('Telegram botToken is required');
    }

    this.logStatus('Starting channel...');

    try {
      const me = await this.callApi<TelegramUser>('getMe', {});
      this.botUserId = me.id;
      this.botUsername = me.username;

      if (this.config.webhookUrl) {
        await this.callApi('setWebhook', { url: this.config.webhookUrl });
        this.logStatus('Using webhook mode');
      } else {
        await this.callApi('deleteWebhook', { drop_pending_updates: false });
        this.startPollingLoop();
        this.logStatus('Using polling mode');
      }

      this._connected = true;
      this.logStatus('Channel started successfully', {
        botUserId: this.botUserId,
        botUsername: this.botUsername,
      });
    } catch (error) {
      this._connected = false;
      logError('[Telegram] Failed to start channel:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this._connected) return;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    this._connected = false;
    this.isPolling = false;
    this.logStatus('Channel stopped');
  }

  async send(response: RemoteResponse): Promise<void> {
    if (!this._connected) {
      throw new Error('Channel not connected');
    }

    const text = this.toPlainText(response.content);
    const chunks = this.splitMessage(text, 3800);

    await withRetry(
      async () => {
        for (const chunk of chunks) {
          await this.callApi('sendMessage', {
            chat_id: response.channelId,
            text: chunk,
            disable_web_page_preview: true,
          });
          if (chunks.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
      },
      {
        maxRetries: 3,
        delayMs: 1000,
        onRetry: (attempt, error) => {
          logWarn(`[Telegram] Send retry ${attempt}:`, error.message);
        },
      }
    );
  }

  handleWebhook(
    _headers: Record<string, string>,
    body: string
  ): { status: number; data: Record<string, unknown> } {
    try {
      const update = JSON.parse(body) as TelegramUpdate;
      this.processUpdate(update);
      return { status: 200, data: { ok: true } };
    } catch (error) {
      logError('[Telegram] Webhook handling error:', error);
      return { status: 400, data: { ok: false, error: 'Invalid payload' } };
    }
  }

  private startPollingLoop(): void {
    if (this.isPolling) return;
    this.isPolling = true;

    const poll = async () => {
      if (!this._connected) {
        this.isPolling = false;
        return;
      }

      try {
        const updates = await this.callApi<TelegramUpdate[]>('getUpdates', {
          offset: this.updateOffset,
          timeout: 25,
          allowed_updates: ['message', 'edited_message'],
        });

        for (const update of updates) {
          this.processUpdate(update);
          this.updateOffset = Math.max(this.updateOffset, update.update_id + 1);
        }
      } catch (error) {
        logWarn('[Telegram] Polling error:', error instanceof Error ? error.message : String(error));
      }

      this.pollTimer = setTimeout(() => {
        void poll();
      }, 500);
    };

    void poll();
  }

  private processUpdate(update: TelegramUpdate): void {
    const message = update.message || update.edited_message;
    if (!message?.from || message.from.is_bot) return;

    const rawText = (message.text || message.caption || '').trim();
    if (!rawText) return;

    const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
    const isMentioned =
      isGroup && this.botUsername
        ? rawText.includes(`@${this.botUsername}`)
        : false;

    const cleanText =
      isGroup && this.botUsername
        ? rawText.replace(new RegExp(`@${this.botUsername}\\s*`, 'gi'), '').trim()
        : rawText;

    const remoteMessage: RemoteMessage = {
      id: `${update.update_id}`,
      channelType: 'telegram',
      channelId: `${message.chat.id}`,
      sender: {
        id: `${message.from.id}`,
        name:
          message.from.username ||
          [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') ||
          undefined,
        isBot: false,
      },
      content: {
        type: 'text',
        text: cleanText,
      },
      timestamp: message.date * 1000,
      isGroup,
      isMentioned,
      raw: update,
    };

    this.emitMessage(remoteMessage);
  }

  private async callApi<T = Record<string, unknown>>(
    method: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = (await response.json()) as TelegramApiResponse<T>;

    if (!response.ok || !json.ok || typeof json.result === 'undefined') {
      throw new Error(
        json.description || `Telegram API ${method} failed with HTTP ${response.status}`
      );
    }

    return json.result;
  }

  private toPlainText(content: RemoteResponseContent): string {
    switch (content.type) {
      case 'text':
        return content.text || '';
      case 'markdown':
        return content.markdown || '';
      default:
        return content.text || '';
    }
  }
}
