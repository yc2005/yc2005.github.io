// push-sender.js —— 在 GitHub Actions 里运行：对方下单时，给所有已订阅的设备发后台推送
// 读取 sweet-push-sub 标签的 Issue 拿到各设备订阅，用 web-push + VAPID 发送。
const webpush = require('web-push');

const { GH_TOKEN, REPO, ORDER_BODY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT } = process.env;
const API = `https://api.github.com/repos/${REPO}/issues`;
const HEAD = {
  'Authorization': `Bearer ${GH_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json'
};

webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:nobody@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

(async () => {
  // 1) 解析订单，拿到下单人和内容
  let order = {};
  try { order = JSON.parse(ORDER_BODY || '{}'); } catch (_) {}
  const by = (order.by || '').trim();
  const count = Array.isArray(order.items) ? order.items.reduce((s, i) => s + (i.qty || 1), 0) : 0;
  const total = order.total != null ? order.total : '';
  const title = '🍽️ 对方下单啦！';
  const body = (by ? by + ' ' : '') + `点了 ${count} 样${total !== '' ? '，合计 ¥' + total : ''}，快去看看~`;
  const payload = JSON.stringify({ title, body, icon: 'icon-192.png' });

  // 2) 读取所有订阅
  const res = await fetch(`${API}?labels=sweet-push-sub&state=open&per_page=100`, { headers: HEAD });
  const subs = await res.json();
  if (!Array.isArray(subs) || subs.length === 0) { console.log('没有任何推送订阅，结束。'); return; }

  let sent = 0, dead = 0;
  for (const iss of subs) {
    let rec;
    try { rec = JSON.parse(iss.body); } catch (_) { continue; }
    if (!rec || !rec.subscription) continue;
    // 不给下单人本人发（用 deviceId 精确判断，避免给自己弹）
    if (order.deviceId && rec.deviceId && rec.deviceId === order.deviceId) { console.log('跳过下单人自己'); continue; }
    try {
      await webpush.sendNotification(rec.subscription, payload);
      sent++;
      console.log('已推送给：', rec.device || '(未知设备)');
    } catch (err) {
      const code = err && err.statusCode;
      console.log('推送失败：', rec.device, code);
      // 订阅已失效（410 Gone / 404）→ 关闭这条订阅 Issue，自动清理
      if (code === 410 || code === 404) {
        dead++;
        try { await fetch(`${API}/${iss.number}`, { method: 'PATCH', headers: HEAD, body: JSON.stringify({ state: 'closed' }) }); } catch (_) {}
      }
    }
  }
  console.log(`完成：成功 ${sent} 条，清理失效 ${dead} 条。`);
})().catch((e) => { console.error(e); process.exit(1); });
