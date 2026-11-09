import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'

const files = (await readdir('dist', { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name !== 'sw.js')
  .map(entry => entry.parentPath.replace(/^dist\/?/, '') + '/' + entry.name)
  .map(path => path.replace(/^\//, '')).sort()
const hash = createHash('sha256')
for (const file of files) hash.update(await readFile('dist/' + file))

await writeFile('dist/sw.js', `const prefix = 'tidal-tactician:' + self.registration.scope + ':';
const version = prefix + '${hash.digest('hex').slice(0, 16)}';
const urls = ${JSON.stringify(files)}.map(file => new URL(file, self.registration.scope).href);
const home = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(version).then(cache => cache.addAll(urls)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== version).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate' && request.url.startsWith(self.registration.scope)) {
    event.respondWith(fetch(request, { cache: 'no-cache' }).catch(() => caches.open(version).then(cache => cache.match(home))));
  } else if (urls.includes(request.url)) {
    event.respondWith(caches.open(version).then(cache => cache.match(request, { ignoreVary: true })).then(cached => cached || fetch(request)));
  }
});
`)
