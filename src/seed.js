const path = require('path');
const fs = require('fs');
const { db } = require('./db');

// "2498345517-2498345545" oder "2495716875" -> Liste von IDs
function expandIds(list) {
  const out = [];
  for (const item of list || []) {
    const m = String(item).match(/^(\d+)-(\d+)$/);
    if (m) {
      for (let i = parseInt(m[1], 10); i <= parseInt(m[2], 10); i++) out.push(String(i));
    } else {
      out.push(String(item));
    }
  }
  return out;
}

function seedIfEmpty() {
  const has = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (has > 0) return;
  console.log('[seed] Leere Datenbank – Inhalte werden eingespielt...');

  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'seed.json'), 'utf8'));
  const struktur = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'seed-struktur.json'), 'utf8'));
  const geschichte = fs.readFileSync(path.join(__dirname, '..', 'content', 'geschichte.txt'), 'utf8');

  const setSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(seed.settings)) setSetting.run(k, v);
    setSetting.run('history_text', geschichte);
    setSetting.run('vorstand_json', JSON.stringify(struktur.vorstand));
    setSetting.run('vorstand_groupimage', struktur.vorstand_groupimage);
    setSetting.run('obmaenner_json', JSON.stringify(struktur.obmaenner));
    setSetting.run('kapellmeister_json', JSON.stringify(struktur.kapellmeister));
    setSetting.run('registers_json', JSON.stringify(struktur.registers));
    setSetting.run('links_json', JSON.stringify(struktur.links));

    // Partner: imageIds expandieren
    const partners = struktur.partners.map(p => ({ ...p, images: expandIds(p.imageIds) }));
    setSetting.run('partners_json', JSON.stringify(partners));

    const insEvent = db.prepare('INSERT INTO events (datum, titel, ort, hinweis, sort) VALUES (?, ?, ?, ?, ?)');
    seed.events.forEach((e, i) => insEvent.run(e.datum, e.titel, e.ort || '', e.hinweis || '', i));

    const insReport = db.prepare('INSERT INTO reports (slug, title, date, body, images, published) VALUES (?, ?, ?, ?, ?, 1)');
    for (const r of seed.reports) {
      insReport.run(r.slug, r.title, r.date, r.body, JSON.stringify(expandIds(r.imageIds)));
    }
  });
  tx();
  console.log('[seed] Fertig.');
}

module.exports = { seedIfEmpty };
