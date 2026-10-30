const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// --- Renderスリープ対策用の簡易サーバー ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`HTTP Server is running on port ${PORT}`));

// --- Discord Botの初期設定 ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const GAS_URL = process.env.GAS_URL; // GASのウェブアプリURL

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // 30秒ごとにスプレッドシートを確認し、時間になったらリマインドを送信
    setInterval(checkReminders, 30 * 1000);
});

// メッセージ投稿時の処理：スプレッドシートにリマインド予定を保存
client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.id !== TARGET_CHANNEL_ID) return;

    // 48時間後の日時を計算
    const remindAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    
    const reminderData = {
        action: 'add',
        id: message.id,
        channelId: message.channel.id,
        messageId: message.id,
        messageUrl: message.url,
        remindAt: remindAt
    };

    try {
        await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reminderData)
        });
        console.log('リマインドをスプレッドシートに登録しました');
    } catch (error) {
        console.error('リマインドの登録に失敗:', error);
    }
});

// 定期チェック処理：時間になったら通知して完了にする
async function checkReminders() {
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get' })
        });
        const reminders = await response.json();
        const now = new Date();

        for (const r of reminders) {
            if (new Date(r.remindAt) <= now) {
                try {
                    const channel = await client.channels.fetch(r.channelId);
                    if (channel) {
                        await channel.send({
                            content: `⏰ **リマインド:** 48時間前に送信されたメッセージです！担当者は注文が済んでいなかったらすぐに注文をお願いします。難しい場合は、他の人にお願いしてね\n${r.messageUrl}`
                        });
                    }
                    // 送信完了をスプレッドシートに記録
                    await fetch(GAS_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'complete', row: r.row })
                    });
                    console.log(`リマインド送信完了: ${r.messageUrl}`);
                } catch (err) {
                    console.error('個別リマインド送信エラー:', err);
                }
            }
        }
    } catch (error) {
        console.error('リマインド確認エラー:', error);
    }
}

client.login(process.env.DISCORD_TOKEN);
