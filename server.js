// Prosty, zero-zależnościowy serwer statyczny dla gry "Adididi vs Azure Costs".
// Odpalasz: node server.js   (albo: npm start)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Zabezpieczenie przed path traversal (../../)
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — nie znaleziono (jak nieużywany zasób, ale tańszy)');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    // HTML/JS/CSS — bez długiego cache, żeby akcelerator (np. Cytrus/wykr.es)
    // rewalidował po deployu i nie serwował starej wersji gry.
    // Media (mp3/grafiki) — można cache'ować na dłużej.
    const noCache = ['.html', '.js', '.css', '.json'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-cache, must-revalidate' : 'public, max-age=86400',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🦸  Adididi vs Azure Costs`);
  console.log(`  ▶  http://localhost:${PORT}\n`);
});
