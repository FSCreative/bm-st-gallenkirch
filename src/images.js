/*
 * Bild-Import: Lädt beim ersten Start alle Bilder der alten Website
 * (www.bmstgallenkirch.at) als lokale Kopien auf das Volume (DATA_DIR/media/images).
 * Läuft im Hintergrund, blockiert den Serverstart nicht.
 */
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('./db');

const BASE = 'https://www.bmstgallenkirch.at';
const IMG_DIR = path.join(DATA_DIR, 'media', 'images');
const MARKER = path.join(DATA_DIR, 'images-imported.json');

const PAGES = [
  '/',
  '/über-uns/', '/über-uns/vorstand/', '/über-uns/geschichte/', '/über-uns/obmänner/', '/über-uns/kapellmeister/',
  '/partnerkapellen/', '/partnerkapellen/musikverein-heiligenberg/', '/partnerkapellen/musikkapelle-ebenau/',
  '/kontakt/', '/impressum/', '/links/',
  '/mitglieder/', '/mitglieder/kapellmeister/', '/mitglieder/fähnrich-und-patin/', '/mitglieder/marketenderinnen/',
  '/mitglieder/oboe/', '/mitglieder/querflöte/', '/mitglieder/klarinette/', '/mitglieder/saxophon/',
  '/mitglieder/trompete/', '/mitglieder/flügelhorn/', '/mitglieder/euphonium/', '/mitglieder/horn/',
  '/mitglieder/posaune/', '/mitglieder/tuba/', '/mitglieder/schlagzeug/',
  '/bezirksmusikfest-2023-rückblick/', '/bezirksmusikfest-2023-rückblick/fotos-vrwäga/',
  '/bezirksmusikfest-2023-rückblick/tombola-gwinna/', '/bezirksmusikfest-2023-rückblick/sponsoren-danke/'
];

// Seiten, deren Bilder automatisch als Galerie angelegt werden
const PAGE_GALLERIES = {
  '/bezirksmusikfest-2023-rückblick/fotos-vrwäga/': { slug: 'bezirksmusikfest-2023', title: 'Bezirksmusikfest 2023 - #vrwäga' }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (BM-Website-Import)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.text();
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (BM-Website-Import)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

function extractImageUrls(html) {
  const re = /https:\/\/www\.bmstgallenkirch\.at\/s\/(?:cc_images|img)\/[A-Za-z0-9_.-]+?\.(?:jpg|jpeg|png|JPG|PNG)/g;
  return (html.match(re) || []).filter(u => !u.includes('/thumb_'));
}

async function runImport() {
  const state = fs.existsSync(MARKER) ? JSON.parse(fs.readFileSync(MARKER, 'utf8')) : { done: false, pages: {} };
  if (state.done) return;
  console.log('[images] Starte Bild-Import von', BASE);

  const perPage = {};
  const all = new Set();
  for (const p of PAGES) {
    try {
      const html = await fetchText(BASE + encodeURI(p));
      const urls = [...new Set(extractImageUrls(html))];
      perPage[p] = urls;
      urls.forEach(u => all.add(u));
      await sleep(300);
    } catch (e) {
      console.warn('[images] Seite fehlgeschlagen:', p, e.message);
    }
  }
  console.log(`[images] ${all.size} Bilder gefunden, lade herunter...`);

  let ok = 0, fail = 0;
  for (const url of all) {
    const name = path.basename(new URL(url).pathname);
    const dest = path.join(IMG_DIR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { ok++; continue; }
    try {
      await downloadFile(url, dest);
      ok++;
      await sleep(150);
    } catch (e) {
      fail++;
      console.warn('[images] Download fehlgeschlagen:', url, e.message);
    }
  }
  console.log(`[images] Fertig: ${ok} ok, ${fail} fehlgeschlagen`);

  // Galerien aus definierten Seiten anlegen
  for (const [page, def] of Object.entries(PAGE_GALLERIES)) {
    const urls = perPage[page] || [];
    if (!urls.length) continue;
    let g = db.prepare('SELECT * FROM galleries WHERE slug = ?').get(def.slug);
    if (!g) {
      const info = db.prepare('INSERT INTO galleries (slug, title, sort) VALUES (?, ?, 99)').run(def.slug, def.title);
      g = { id: info.lastInsertRowid };
    }
    const insert = db.prepare('INSERT INTO photos (gallery_id, file, sort) VALUES (?, ?, ?)');
    const existing = new Set(db.prepare('SELECT file FROM photos WHERE gallery_id = ?').all(g.id).map(r => r.file));
    let i = 0;
    for (const url of urls) {
      const name = path.basename(new URL(url).pathname);
      const rel = 'images/' + name;
      if (existing.has(rel)) continue;
      if (fs.existsSync(path.join(IMG_DIR, name))) insert.run(g.id, rel, i++);
    }
  }

  state.done = fail === 0 || ok > 0;
  state.stats = { ok, fail, total: all.size, at: new Date().toISOString() };
  fs.writeFileSync(MARKER, JSON.stringify(state, null, 2));
}

function importImagesInBackground() {
  if (process.env.SKIP_IMAGE_IMPORT === '1') return;
  setTimeout(() => {
    runImport().catch(e => console.error('[images] Import-Fehler:', e));
  }, 3000);
}

module.exports = { importImagesInBackground };
