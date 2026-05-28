// ── Mounjaro Tracker · Service Worker ──
const CACHE = 'mj-tracker-v2';
const ASSETS = ['./index.html', './sw.js'];

// ── INSTALL: precache ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // Tenta il precache ma non blocca se fallisce (es. file://)
      return c.addAll(ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE: pulizia vecchie cache ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
  // Avvia il controllo reminder all'attivazione
  checkAndScheduleReminder();
});

// ── FETCH: cache-first, fallback network ──
self.addEventListener('fetch', e => {
  // Ignora richieste non-GET e cross-origin
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(resp => {
        if(resp && resp.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});

// ── NOTIFICATION CLICK: apri o porta in primo piano l'app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || self.registration.scope;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const found = list.find(c => c.url === targetUrl);
      if(found) return found.focus();
      return clients.openWindow(targetUrl);
    })
  );
});

// ── NOTIFICATIONCLOSE: nessuna azione necessaria ──
self.addEventListener('notificationclose', () => {});

// ── MESSAGE: comandi dall'app principale ──
self.addEventListener('message', e => {
  if(e.data?.type === 'SCHEDULE_REMINDER') {
    const { hour, minute, body } = e.data;
    scheduleReminder(hour, minute || 0, body);
  }
  if(e.data?.type === 'CANCEL_REMINDER') {
    clearTimeout(self._reminderTimer);
  }
  if(e.data?.type === 'SEND_NOW') {
    sendSummaryNotification(e.data.title, e.data.body);
  }
});

// ── REMINDER AUTOMATICO MATTUTINO ──
let _reminderTimer = null;

function msToNext(hour, minute) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if(next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function scheduleReminder(hour = 8, minute = 0, bodyText) {
  clearTimeout(_reminderTimer);
  const ms = msToNext(hour, minute);
  _reminderTimer = setTimeout(() => {
    sendSummaryNotification(
      '⌚ Mounjaro · Riepilogo mattutino',
      bodyText || 'Apri l\'app per registrare peso, energia e misure di oggi.'
    );
    // Ripianifica per domani alla stessa ora
    scheduleReminder(hour, minute, bodyText);
  }, ms);
}

function sendSummaryNotification(title, body) {
  return self.registration.showNotification(title, {
    body,
    icon: buildIcon(),
    badge: buildBadge(),
    tag: 'mj-daily-summary',
    renotify: true,
    vibrate: [150, 80, 150],
    data: { url: self.registration.scope }
  });
}

function checkAndScheduleReminder() {
  // Rilegge l'ora dal client tramite postMessage se disponibile
  // Altrimenti usa default 8:00
  scheduleReminder(8, 0);
}

// ── ICONE INLINE ──
function buildIcon() {
  return `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="32" r="32" fill="%231E1A14"/>' +
    '<circle cx="32" cy="32" r="26" fill="none" stroke="%23B8912A" stroke-width="2"/>' +
    '<text y="42" x="32" text-anchor="middle" font-size="30" fill="%23B8912A">💉</text>' +
    '</svg>'
  )}`;
}

function buildBadge() {
  return `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="32" r="32" fill="%23B8912A"/>' +
    '</svg>'
  )}`;
}
