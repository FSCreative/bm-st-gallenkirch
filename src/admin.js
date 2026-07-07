const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { db, DATA_DIR } = require('./db');

const router = express.Router();

const UPLOAD_DIR = path.join(DATA_DIR, 'media', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  res.redirect('/admin/login');
};

const slugify = s => s.toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80) || 'bericht';

// ---------- Login ----------
router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin-Login', error: null });
});
router.post('/login', (req, res) => {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return res.render('admin/login', { title: 'Admin-Login', error: 'ADMIN_PASSWORD ist nicht gesetzt (Umgebungsvariable in Railway anlegen).' });
  if (req.body.password === pw) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { title: 'Admin-Login', error: 'Falsches Passwort.' });
});
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Dashboard ----------
router.get('/', requireAdmin, (req, res) => {
  const counts = {
    reports: db.prepare('SELECT COUNT(*) c FROM reports').get().c,
    events: db.prepare('SELECT COUNT(*) c FROM events').get().c,
    galleries: db.prepare('SELECT COUNT(*) c FROM galleries').get().c,
    photos: db.prepare('SELECT COUNT(*) c FROM photos').get().c
  };
  let importStats = null;
  const marker = path.join(DATA_DIR, 'images-imported.json');
  if (fs.existsSync(marker)) {
    try { importStats = JSON.parse(fs.readFileSync(marker, 'utf8')).stats; } catch (e) {}
  }
  res.render('admin/dashboard', { title: 'Admin', counts, importStats });
});

// ---------- Berichte (Blog) ----------
router.get('/berichte', requireAdmin, (req, res) => {
  const reports = db.prepare('SELECT id, slug, title, date, published FROM reports ORDER BY date DESC, id DESC').all();
  res.render('admin/berichte', { title: 'Berichte verwalten', reports });
});
router.get('/berichte/neu', requireAdmin, (req, res) => {
  res.render('admin/bericht-form', { title: 'Neuer Bericht', r: { id: null, title: '', date: new Date().toISOString().slice(0, 10), body: '', images: [], published: 1 } });
});
router.get('/berichte/:id', requireAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!r) return res.redirect('/admin/berichte');
  r.images = JSON.parse(r.images || '[]');
  res.render('admin/bericht-form', { title: 'Bericht bearbeiten', r });
});
router.post('/berichte/speichern', requireAdmin, upload.array('neueBilder', 30), (req, res) => {
  const { id, title, date, body, published } = req.body;
  let images = [];
  try { images = JSON.parse(req.body.imagesJson || '[]'); } catch (e) {}
  for (const f of req.files || []) images.push('uploads/' + f.filename);
  const pub = published ? 1 : 0;
  if (id) {
    db.prepare('UPDATE reports SET title=?, date=?, body=?, images=?, published=? WHERE id=?')
      .run(title, date, body, JSON.stringify(images), pub, id);
    return res.redirect('/admin/berichte/' + id);
  }
  let slug = slugify(title);
  let n = 1;
  while (db.prepare('SELECT 1 FROM reports WHERE slug = ?').get(slug)) slug = slugify(title) + '-' + (++n);
  const info = db.prepare('INSERT INTO reports (slug, title, date, body, images, published) VALUES (?,?,?,?,?,?)')
    .run(slug, title, date, body, JSON.stringify(images), pub);
  res.redirect('/admin/berichte/' + info.lastInsertRowid);
});
router.post('/berichte/:id/loeschen', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  res.redirect('/admin/berichte');
});

// ---------- Fotos / Galerien ----------
router.get('/fotos', requireAdmin, (req, res) => {
  const galleries = db.prepare(`SELECT g.*, COUNT(p.id) AS cnt FROM galleries g
    LEFT JOIN photos p ON p.gallery_id = g.id GROUP BY g.id ORDER BY g.sort, g.id`).all();
  res.render('admin/fotos', { title: 'Fotos verwalten', galleries });
});
router.post('/fotos/galerie-neu', requireAdmin, (req, res) => {
  const title = (req.body.title || '').trim();
  if (title) {
    let slug = slugify(title);
    let n = 1;
    while (db.prepare('SELECT 1 FROM galleries WHERE slug = ?').get(slug)) slug = slugify(title) + '-' + (++n);
    db.prepare('INSERT INTO galleries (slug, title) VALUES (?, ?)').run(slug, title);
  }
  res.redirect('/admin/fotos');
});
router.get('/fotos/:id', requireAdmin, (req, res) => {
  const g = db.prepare('SELECT * FROM galleries WHERE id = ?').get(req.params.id);
  if (!g) return res.redirect('/admin/fotos');
  const photos = db.prepare('SELECT * FROM photos WHERE gallery_id = ? ORDER BY sort, id').all(g.id);
  res.render('admin/galerie', { title: 'Galerie: ' + g.title, g, photos });
});
router.post('/fotos/:id/upload', requireAdmin, upload.array('fotos', 50), (req, res) => {
  const g = db.prepare('SELECT * FROM galleries WHERE id = ?').get(req.params.id);
  if (g) {
    const ins = db.prepare('INSERT INTO photos (gallery_id, file, caption) VALUES (?, ?, ?)');
    for (const f of req.files || []) ins.run(g.id, 'uploads/' + f.filename, '');
  }
  res.redirect('/admin/fotos/' + req.params.id);
});
router.post('/fotos/:id/umbenennen', requireAdmin, (req, res) => {
  db.prepare('UPDATE galleries SET title = ? WHERE id = ?').run(req.body.title, req.params.id);
  res.redirect('/admin/fotos/' + req.params.id);
});
router.post('/fotos/:id/loeschen', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM photos WHERE gallery_id = ?').run(req.params.id);
  db.prepare('DELETE FROM galleries WHERE id = ?').run(req.params.id);
  res.redirect('/admin/fotos');
});
router.post('/foto/:photoId/loeschen', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.photoId);
  if (p) {
    db.prepare('DELETE FROM photos WHERE id = ?').run(p.id);
    if (p.file.startsWith('uploads/')) {
      const abs = path.join(DATA_DIR, 'media', p.file);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }
  }
  res.redirect(req.get('referer') || '/admin/fotos');
});
router.post('/foto/:photoId/caption', requireAdmin, (req, res) => {
  db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(req.body.caption || '', req.params.photoId);
  res.redirect(req.get('referer') || '/admin/fotos');
});

// ---------- Texte ----------
const EDITABLE_TEXTS = [
  { key: 'welcome_title', label: 'Startseite: Begrüßungs-Überschrift', rows: 2 },
  { key: 'welcome_text', label: 'Startseite: Begrüßungstext', rows: 6 },
  { key: 'join_text', label: 'Startseite: „Komm zur Musig!“-Text', rows: 6 },
  { key: 'vereinsfoto_text', label: 'Startseite: Text zum Vereinsfoto', rows: 8 },
  { key: 'termine_intro', label: 'Termine: Einleitungstext', rows: 3 },
  { key: 'about_text', label: 'Über uns: Haupttext', rows: 12 },
  { key: 'history_text', label: 'Geschichte: Text', rows: 20 },
  { key: 'contact_text', label: 'Kontakt: Adresse/Einleitung', rows: 4 },
  { key: 'imprint_text', label: 'Impressum', rows: 12 },
  { key: 'instagram', label: 'Instagram-Handle', rows: 1 },
  { key: 'instagram_jugend', label: 'Instagram-Handle Jungmusig', rows: 1 },
  { key: 'facebook', label: 'Facebook-URL', rows: 1 }
];
router.get('/texte', requireAdmin, (req, res) => {
  const get = db.prepare('SELECT value FROM settings WHERE key = ?');
  const texts = EDITABLE_TEXTS.map(t => ({ ...t, value: (get.get(t.key) || {}).value || '' }));
  res.render('admin/texte', { title: 'Texte bearbeiten', texts, saved: req.query.saved === '1' });
});
router.post('/texte', requireAdmin, (req, res) => {
  const set = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const t of EDITABLE_TEXTS) {
    if (typeof req.body[t.key] === 'string') set.run(t.key, req.body[t.key]);
  }
  res.redirect('/admin/texte?saved=1');
});

// ---------- Termine ----------
router.get('/termine', requireAdmin, (req, res) => {
  const events = db.prepare('SELECT * FROM events ORDER BY sort, id').all();
  res.render('admin/termine', { title: 'Termine verwalten', events });
});
router.post('/termine/neu', requireAdmin, (req, res) => {
  const max = db.prepare('SELECT COALESCE(MAX(sort), 0) m FROM events').get().m;
  db.prepare('INSERT INTO events (datum, titel, ort, hinweis, sort) VALUES (?,?,?,?,?)')
    .run(req.body.datum || '', req.body.titel || '', req.body.ort || '', req.body.hinweis || '', max + 1);
  res.redirect('/admin/termine');
});
router.post('/termine/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE events SET datum=?, titel=?, ort=?, hinweis=?, sort=? WHERE id=?')
    .run(req.body.datum || '', req.body.titel || '', req.body.ort || '', req.body.hinweis || '', parseInt(req.body.sort, 10) || 0, req.params.id);
  res.redirect('/admin/termine');
});
router.post('/termine/:id/loeschen', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.redirect('/admin/termine');
});

module.exports = router;
