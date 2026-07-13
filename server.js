require('dotenv').config();
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const webpush = require('web-push');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const TRACKTRY_API = 'https://api.tracktry.com';
const TRACKTRY_KEY = process.env.TRACKTRY_API_KEY;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();

// Database setup
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'freight.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    github_id TEXT UNIQUE,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    tracking_number TEXT NOT NULL,
    carrier TEXT,
    service TEXT,
    origin_city TEXT,
    origin_lat REAL,
    origin_lng REAL,
    dest_city TEXT,
    dest_lat REAL,
    dest_lng REAL,
    weight TEXT,
    pieces TEXT,
    status TEXT DEFAULT 'PU',
    status_label TEXT DEFAULT 'Picked Up',
    progress INTEGER DEFAULT 0,
    current_lat REAL,
    current_lng REAL,
    current_city TEXT,
    estimated_delivery DATETIME,
    events TEXT DEFAULT '[]',
    is_real INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    endpoint TEXT,
    p256dh TEXT,
    auth TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    shipment_id TEXT,
    title TEXT,
    message TEXT,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Web Push VAPID keys
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:admin@freighttracker.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

// Session setup
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', 
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  done(null, user || null);
});

if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/api/auth/github/callback` : '/api/auth/github/callback'
  }, (accessToken, refreshToken, profile, done) => {
    try {
      let user = db.prepare('SELECT * FROM users WHERE github_id = ?').get(profile.id);
      
      if (!user) {
        user = db.prepare('SELECT * FROM users WHERE email = ?').get(profile.emails?.[0]?.value || '');
        
        if (user) {
          db.prepare('UPDATE users SET github_id = ?, avatar_url = ? WHERE id = ?').run(profile.id, profile.photos?.[0]?.value || '', user.id);
          user.github_id = profile.id;
          user.avatar_url = profile.photos?.[0]?.value || '';
        } else {
          const id = uuidv4();
          const username = profile.username || profile.displayName || 'github_user';
          const email = profile.emails?.[0]?.value || `${username}@github.local`;
          const avatar = profile.photos?.[0]?.value || '';
          
          db.prepare('INSERT INTO users (id, username, email, password, github_id, avatar_url) VALUES (?, ?, ?, ?, ?, ?)').run(
            id, username, email, bcrypt.hashSync(uuidv4(), 10), profile.id, avatar
          );
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        }
      }
      
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid token' });
  
  req.userId = session.user_id;
  next();
}

// ============ AUTH ROUTES ============

// GitHub OAuth routes
app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/api/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/?error=github_auth_failed' }),
  (req, res) => {
    const token = uuidv4();
    db.prepare('INSERT INTO sessions (id, user_id, token) VALUES (?, ?, ?)').run(uuidv4(), req.user.id, token);
    
    const user = {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      avatar: req.user.avatar_url || '',
      provider: 'github'
    };
    
    res.redirect(`/?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`);
  }
);

// Check GitHub OAuth availability
app.get('/api/auth/github/available', (req, res) => {
  res.json({ available: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const id = uuidv4();
    const hashedPw = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)').run(id, username, email, hashedPw);
    
    const token = uuidv4();
    db.prepare('INSERT INTO sessions (id, user_id, token) VALUES (?, ?, ?)').run(uuidv4(), id, token);
    
    res.json({ success: true, token, user: { id, username, email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = uuidv4();
    db.prepare('INSERT INTO sessions (id, user_id, token) VALUES (?, ?, ?)').run(uuidv4(), user.id, token);
    
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SHIPMENT ROUTES ============

app.get('/api/shipments', authMiddleware, (req, res) => {
  try {
    const shipments = db.prepare('SELECT * FROM shipments WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
    res.json(shipments.map(s => ({
      ...s,
      events: JSON.parse(s.events || '[]'),
      isReal: !!s.is_real
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shipments', authMiddleware, (req, res) => {
  try {
    const { trackingNumber, carrier, service, origin, destination, weight, pieces, status, statusLabel, progress, currentLocation, estimatedDelivery, events, isReal } = req.body;
    
    const id = uuidv4();
    db.prepare(`INSERT INTO shipments (id, user_id, tracking_number, carrier, service, origin_city, origin_lat, origin_lng, dest_city, dest_lat, dest_lng, weight, pieces, status, status_label, progress, current_lat, current_lng, current_city, estimated_delivery, events, is_real) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, req.userId, trackingNumber, carrier, service,
      origin?.city, origin?.lat, origin?.lng,
      destination?.city, destination?.lat, destination?.lng,
      weight, pieces, status, statusLabel, progress,
      currentLocation?.lat, currentLocation?.lng, currentLocation?.city,
      estimatedDelivery, JSON.stringify(events || []), isReal ? 1 : 0
    );
    
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/shipments/:id', authMiddleware, (req, res) => {
  try {
    const { status, statusLabel, progress, currentLat, currentLng, currentCity, events } = req.body;
    
    db.prepare(`UPDATE shipments SET status = ?, status_label = ?, progress = ?, current_lat = ?, current_lng = ?, current_city = ?, events = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`).run(
      status, statusLabel, progress, currentLat, currentLng, currentCity, JSON.stringify(events || []), req.params.id, req.userId
    );
    
    // Check if status changed and send notification
    if (status) {
      sendStatusNotification(req.userId, req.params.id, status, statusLabel);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/shipments/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM shipments WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ NOTIFICATION ROUTES ============

app.post('/api/notifications/subscribe', authMiddleware, (req, res) => {
  try {
    const { endpoint, p256dh, auth: authKey } = req.body;
    
    // Check if subscription exists
    const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    if (existing) {
      return res.json({ success: true });
    }
    
    db.prepare('INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(), req.userId, endpoint, p256dh, authKey
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/unsubscribe', authMiddleware, (req, res) => {
  try {
    const { endpoint } = req.body;
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', authMiddleware, (req, res) => {
  try {
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.userId);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/read-all', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function sendStatusNotification(userId, shipmentId, status, statusLabel) {
  try {
    const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
    if (!shipment) return;
    
    // Save to database
    const id = uuidv4();
    db.prepare('INSERT INTO notifications (id, user_id, shipment_id, title, message) VALUES (?, ?, ?, ?, ?)').run(
      id, userId, shipmentId, `Shipment ${statusLabel}`, `Tracking ${shipment.tracking_number} - ${statusLabel}`
    );
    
    // Send push notification
    const subscriptions = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
    
    const payload = JSON.stringify({
      title: `Shipment ${statusLabel}`,
      body: `Tracking ${shipment.tracking_number} - ${statusLabel}`,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      data: { shipmentId, url: '/' }
    });
    
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload);
      } catch (e) {
        // Subscription expired or invalid
        if (e.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        }
      }
    }
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// ============ TRACKING API ROUTES ============

app.post('/api/detect', async (req, res) => {
  try {
    const { tracking_number } = req.body;
    if (!tracking_number) return res.status(400).json({ error: 'tracking_number required' });

    const resp = await fetch(`${TRACKTRY_API}/v1/carriers/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Tracktry-Api-Key': TRACKTRY_KEY
      },
      body: JSON.stringify({ tracking_number })
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/track', async (req, res) => {
  try {
    const { tracking_number, carrier_code } = req.body;
    if (!tracking_number) return res.status(400).json({ error: 'tracking_number required' });

    const body = { tracking_number };
    if (carrier_code) body.carrier_code = carrier_code;

    const resp = await fetch(`${TRACKTRY_API}/v1/trackings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Tracktry-Api-Key': TRACKTRY_KEY
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/track/:id', async (req, res) => {
  try {
    const resp = await fetch(`${TRACKTRY_API}/v1/trackings/${req.params.id}`, {
      headers: { 'Tracktry-Api-Key': TRACKTRY_KEY }
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/carriers', async (req, res) => {
  try {
    const resp = await fetch(`${TRACKTRY_API}/v1/carriers`, {
      headers: { 'Tracktry-Api-Key': TRACKTRY_KEY }
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ EXPORT ROUTE ============

app.get('/api/export/csv', authMiddleware, (req, res) => {
  try {
    const shipments = db.prepare('SELECT * FROM shipments WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
    
    const headers = ['Tracking Number', 'Carrier', 'Origin', 'Destination', 'Status', 'Progress', 'Weight', 'Pieces', 'Created', 'Updated'];
    const rows = shipments.map(s => [
      s.tracking_number, s.carrier, s.origin_city, s.dest_city, s.status_label, s.progress + '%', s.weight, s.pieces, s.created_at, s.updated_at
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c || ''}"`).join(','))].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=shipments.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SHARE ROUTE ============

app.get('/api/share/:id', (req, res) => {
  try {
    const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    
    res.json({
      trackingNumber: shipment.tracking_number,
      carrier: shipment.carrier,
      origin: { city: shipment.origin_city, lat: shipment.origin_lat, lng: shipment.origin_lng },
      destination: { city: shipment.dest_city, lat: shipment.dest_lat, lng: shipment.dest_lng },
      status: shipment.status_label,
      progress: shipment.progress,
      estimatedDelivery: shipment.estimated_delivery
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Freight Tracker Pro running on http://localhost:${PORT}`);
});
