const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');

const { db, DATA_DIR } = require('./src/db');
const { seedIfEmpty } = require('./src/seed');
const { importImagesInBackground } = require('./src/images');
const adminRouter = require('./src/admin');

const app = express();
const PORT = process.env.PORT || 3000;

seedIfEmpty();
importImagesInBackground();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
app.use('/media', express.static(path.join(DATA_DIR, 'media'), { maxAge: '30d' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bm-stgallenkirch-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// ---------- Helpers ----------
const getSetting = (key, fallback = '') => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
};
const getJson = (key, fallback = []) => {
  try { return JSON.parse(getSetting(key, JSON.stringify(fallback))); }
  catch (e) { return fallback; }
};

// Bild-ID/Dateiname -> lokale Media-URL (Originalbilder liegen in media/images)
const mediaDir = path.join(DATA_DIR, 'media', 'images');
let mediaCache = null;
function resolveImage(ref) {
  if (!ref) return null;
  if (ref.startsWith('/') || ref.startsWith('http')) return ref;
  if (!mediaCache || Date.now() - mediaCache.t > 30000) {
    mediaCache = { t: Date.now(), files: fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : [] };
  }
  const hit = mediaCache.files.find(f => f === ref || f.startsWith('cache_' + ref + '.') ||
    f.startsWith('teaserbox_' + ref + '.') || f.startsWith(ref + '.'));
  return hit ? '/media/images/' + hit : null;
}

// Einfache Absatz-Formatierung (Text mit Leerzeilen -> <p>), Links klickbar
function nl2p(text) {
  if (!text) return '';
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.split(/\n\s*\n/).map(par => {
    let html = esc(par.trim()).replace(/\n/g, '<br>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return `<p>${html}</p>`;
  }).join('\n');
}

app.locals.resolveImage = resolveImage;
app.locals.nl2p = nl2p;
app.locals.assetV = Date.now(); // Cache-Busting für CSS/JS bei jedem Deploy

app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.isAdmin = !!(req.session && req.session.isAdmin);
  res.locals.site = {
    name: 'Bürgermusik St. Gallenkirch',
    instagram: getSetting('instagram', '@zagallakilknermusig'),
    instagramJugend: getSetting('instagram_jugend', '@zagallakilknerjungmusig'),
    facebook: getSetting('facebook', 'https://de-de.facebook.com/bmstgallenkirch/')
  };
  next();
});

// ---------- Öffentliche Seiten ----------
app.get('/', (req, res) => {
  const events = db.prepare('SELECT * FROM events ORDER BY sort, id').all();
  const reports = db.prepare("SELECT * FROM reports WHERE published = 1 ORDER BY date DESC, id DESC LIMIT 4").all()
    .map(r => ({ ...r, images: JSON.parse(r.images || '[]') }));
  res.render('index', {
    title: 'Homepage',
    welcomeTitle: getSetting('welcome_title'),
    welcomeText: getSetting('welcome_text'),
    joinText: getSetting('join_text'),
    vereinsfotoText: getSetting('vereinsfoto_text'),
    events: events.slice(0, 5),
    reports
  });
});

app.get('/berichte', (req, res) => {
  const reports = db.prepare("SELECT * FROM reports WHERE published = 1 ORDER BY date DESC, id DESC").all()
    .map(r => ({ ...r, images: JSON.parse(r.images || '[]') }));
  res.render('berichte', { title: 'Berichte', reports });
});

app.get('/berichte/:slug', (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!r) return res.status(404).render('404', { title: 'Nicht gefunden' });
  r.images = JSON.parse(r.images || '[]');
  res.render('bericht', { title: r.title, r });
});

app.get('/termine', (req, res) => {
  const events = db.prepare('SELECT * FROM events ORDER BY sort, id').all();
  res.render('termine', { title: 'Termine', events, introText: getSetting('termine_intro') });
});

app.get('/ueber-uns', (req, res) => {
  res.render('ueber-uns', { title: 'Über uns', text: getSetting('about_text'), stats: getJson('about_stats', []) });
});
app.get('/ueber-uns/vorstand', (req, res) => {
  res.render('vorstand', { title: 'Vorstand', vorstand: getJson('vorstand_json') });
});
app.get('/ueber-uns/geschichte', (req, res) => {
  res.render('geschichte', { title: 'Geschichte', text: getSetting('history_text') });
});
app.get('/ueber-uns/obmaenner', (req, res) => {
  res.render('chronik', { title: 'Obmänner/Obfrauen', heading: 'Obmänner/Obfrauen der Bürgermusik St. Gallenkirch', rows: getJson('obmaenner_json') });
});
app.get('/ueber-uns/kapellmeister', (req, res) => {
  res.render('chronik', { title: 'Kapellmeister', heading: 'Kapellmeister der Bürgermusik St. Gallenkirch', rows: getJson('kapellmeister_json') });
});

app.get('/mitglieder', (req, res) => {
  res.render('mitglieder', { title: 'Mitglieder', registers: getJson('registers_json') });
});
app.get('/mitglieder/:slug', (req, res) => {
  const registers = getJson('registers_json');
  const reg = registers.find(r => r.slug === req.params.slug);
  if (!reg) return res.status(404).render('404', { title: 'Nicht gefunden' });
  res.render('register', { title: reg.title, reg, registers });
});

app.get('/partnerkapellen', (req, res) => {
  res.render('partner', { title: 'Partnerkapellen', partners: getJson('partners_json') });
});
app.get('/partnerkapellen/:slug', (req, res) => {
  const partners = getJson('partners_json');
  const p = partners.find(x => x.slug === req.params.slug);
  if (!p) return res.status(404).render('404', { title: 'Nicht gefunden' });
  res.render('partner-detail', { title: p.title, p });
});

app.get('/fotos', (req, res) => {
  const galleries = db.prepare(`SELECT g.*, COUNT(p.id) AS cnt,
    (SELECT file FROM photos WHERE gallery_id = g.id ORDER BY sort, id LIMIT 1) AS cover
    FROM galleries g LEFT JOIN photos p ON p.gallery_id = g.id
    GROUP BY g.id ORDER BY g.sort, g.id`).all();
  res.render('fotos', { title: 'Fotos', galleries });
});
app.get('/fotos/:slug', (req, res) => {
  const g = db.prepare('SELECT * FROM galleries WHERE slug = ?').get(req.params.slug);
  if (!g) return res.status(404).render('404', { title: 'Nicht gefunden' });
  const photos = db.prepare('SELECT * FROM photos WHERE gallery_id = ? ORDER BY sort, id').all(g.id);
  res.render('galerie', { title: g.title, g, photos });
});

app.get('/links', (req, res) => {
  res.render('links', { title: 'Links', linksData: getJson('links_json', { groups: [] }) });
});
app.get('/kontakt', (req, res) => {
  res.render('kontakt', { title: 'Kontakt', text: getSetting('contact_text'), contacts: getJson('contacts_json') });
});
app.get('/impressum', (req, res) => {
  res.render('impressum', { title: 'Impressum', text: getSetting('imprint_text') });
});

// ---------- Admin ----------
app.use('/admin', adminRouter);

app.use((req, res) => res.status(404).render('404', { title: 'Nicht gefunden' }));

app.listen(PORT, () => console.log(`BM St. Gallenkirch läuft auf Port ${PORT} (DATA_DIR=${DATA_DIR})`));
