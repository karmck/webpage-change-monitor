async function notifyTelegram(title, content) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  console.error('[DEBUG][Telegram] notifyTelegram called for:', title);

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[DEBUG][Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return;
  }
  try {
    const maxLen = 4000;
    const header = `CHANGE DETECTED: ${title}\n\n`;
    const body = content.length > maxLen
      ? content.slice(0, maxLen) + '\n\n...truncated'
      : content;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    console.error('[DEBUG][Telegram] Sending message, length:', (header + body).length);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: header + body
      })
    });

    const text = await res.text();
    console.error('[DEBUG][Telegram] Response status:', res.status);
  } catch (e) {
    console.error('[DEBUG] Telegram notify failed:', e && e.message);
  }
}

async function notifyTelegramBatch(changes) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  console.error('[DEBUG][Telegram] notifyTelegramBatch called, items:', changes.length);

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[DEBUG][Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return;
  }

  try {
    let message = `Webpage Monitor - Changes Detected\n\n`;

    for (const item of changes) {
      const excerpt = item.content.length > 1000
        ? item.content.slice(0, 1000) + '\n...truncated'
        : item.content;

      message += `${item.title}\n`;
      message += `${item.url}\n\n`;
      message += `${excerpt}\n\n`;
    }

    if (message.length > 4000) {
      message = message.slice(0, 4000) + '\n...truncated';
    }

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        disable_web_page_preview: true
      })
    });

    const text = await res.text();
    console.error('[DEBUG][Telegram] Batch message status:', res.status);
  } catch (e) {
    console.error('[DEBUG][Telegram] Batch message failed:', e && e.message);
  }
}

export { notifyTelegram, notifyTelegramBatch };
