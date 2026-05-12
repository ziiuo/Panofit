const TRACK_URL = 'http://localhost:8766/track';

const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const pageEnterTimes: Record<string, number> = {};
const sent = new Set<string>();

export function track(event: string, data?: Record<string, any>) {
  const now = Date.now();
  // Dedup within 3s: same event + same page = skip
  const dedupKey = event + '|' + (data?.page || '');
  if (sent.has(dedupKey)) return;
  sent.add(dedupKey);
  setTimeout(() => sent.delete(dedupKey), 3000);

  const tz = 'zh-CN';
  const timeStr = new Date(now).toLocaleString(tz, { timeZone: 'Asia/Shanghai' });
  const payload: Record<string, any> = {
    session_id: sessionId,
    event,
    time: timeStr,
    ua: navigator.userAgent,
  };
  if (data) Object.assign(payload, data);

  fetch(TRACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export function pageEnter(page: string) {
  pageEnterTimes[page] = Date.now();
  track('page_enter', { page });
}

export function pageLeave(page: string) {
  const enter = pageEnterTimes[page];
  const sessionDuration = enter ? Math.round((Date.now() - enter) / 1000) : 0;
  track('page_leave', { page, sessionDuration });
}
