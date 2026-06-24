/**
 * Telegram live smoke test.
 *
 * Exercises the same Bot API surface the app's TelegramChannel uses:
 *   - getMe          (validates the bot token)
 *   - deleteWebhook  (switch to polling mode, like the channel does)
 *   - sendMessage    (optional: send a test message to a chat)
 *   - getUpdates     (poll briefly for an inbound message)
 *
 * The token is read from the TELEGRAM_BOT_TOKEN environment variable so it is
 * never passed on the command line or through chat. Optionally set
 * TELEGRAM_CHAT_ID to send a test message to a specific chat.
 *
 * Usage (inside WSL):
 *   export TELEGRAM_BOT_TOKEN='123456:ABC...'   # from @BotFather
 *   export TELEGRAM_CHAT_ID='42'                # optional
 *   node scripts/telegram-smoke.mjs
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  console.error('✗ TELEGRAM_BOT_TOKEN is not set. Export it first, then re-run.');
  process.exit(1);
}

const API = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function callApi(method, body = {}) {
  const res = await fetch(API(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.description || `Telegram ${method} failed (HTTP ${res.status})`);
  }
  return json.result;
}

async function main() {
  console.log('→ getMe (validating token)…');
  const me = await callApi('getMe', {});
  console.log(`✓ Bot OK: @${me.username} (id ${me.id})`);

  console.log('→ deleteWebhook (enabling polling mode)…');
  await callApi('deleteWebhook', { drop_pending_updates: false });
  console.log('✓ Webhook cleared');

  if (chatId) {
    console.log(`→ sendMessage to chat ${chatId}…`);
    const sent = await callApi('sendMessage', {
      chat_id: chatId,
      text: '✅ Open Cowork Telegram smoke test — your bot is wired up correctly.',
      disable_web_page_preview: true,
    });
    console.log(`✓ Message sent (message_id ${sent.message_id})`);
  } else {
    console.log('• TELEGRAM_CHAT_ID not set — skipping sendMessage test.');
    console.log(`  To get your chat id: message @${me.username} once, then re-run.`);
  }

  console.log('→ getUpdates (polling ~6s for an inbound message)…');
  console.log(`  Send a message to @${me.username} now to see it captured.`);
  const updates = await callApi('getUpdates', {
    timeout: 6,
    allowed_updates: ['message', 'edited_message'],
  });

  if (updates.length === 0) {
    console.log('• No inbound messages received during the poll window (that is OK).');
  } else {
    for (const u of updates) {
      const m = u.message || u.edited_message;
      if (!m) continue;
      const from = m.from?.username || m.from?.first_name || m.from?.id;
      console.log(
        `✓ Inbound: chat=${m.chat.id} from=${from} text=${JSON.stringify(m.text || m.caption || '')}`
      );
    }
  }

  console.log('\n🎉 Telegram integration smoke test completed successfully.');
}

main().catch((err) => {
  console.error('\n✗ Smoke test failed:', err.message);
  process.exit(1);
});
