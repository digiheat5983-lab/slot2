const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const { db, init } = require('./db');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-secret';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@casino.local';

init();

const app = express();
app.use(bodyParser.json());
app.use(session({ secret: 'dev-secret', resave: false, saveUninitialized: false }));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'unauthenticated' });
  next();
}

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email+password required' });
  const hash = await bcrypt.hash(password, 10);
  const is_admin = email === ADMIN_EMAIL ? 1 : 0;
  const initial = 100; // default starting funds
  db.run('INSERT INTO users (email, password_hash, balance, is_admin) VALUES (?,?,?,?)', [email, hash, initial, is_admin], function (err) {
    if (err) return res.status(400).json({ error: 'email taken' });
    req.session.userId = this.lastID;
    res.json({ id: this.lastID, email, balance: initial, is_admin: !!is_admin });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT id, password_hash, balance, is_admin FROM users WHERE email = ?', [email], async (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(400).json({ error: 'invalid credentials' });
    req.session.userId = row.id;
    res.json({ id: row.id, email, balance: row.balance, is_admin: !!row.is_admin });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  db.get('SELECT id,email,balance,is_admin FROM users WHERE id = ?', [req.session.userId], (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'user not found' });
    res.json(row);
  });
});

app.post('/api/funds/adjust', requireAuth, (req, res) => {
  const { amount } = req.body;
  const a = Number(amount) || 0;
  if (a === 0) return res.status(400).json({ error: 'invalid amount' });
  db.get('SELECT balance FROM users WHERE id = ?', [req.session.userId], (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'user not found' });
    const newBal = row.balance + a;
    if (newBal < 0) return res.status(400).json({ error: 'insufficient funds' });
    db.run('UPDATE users SET balance = ? WHERE id = ?', [newBal, req.session.userId], function (e) {
      if (e) return res.status(500).json({ error: 'db error' });
      db.run('INSERT INTO transactions (user_id,type,amount) VALUES (?,?,?)', [req.session.userId, 'adjust', a]);
      res.json({ balance: newBal });
    });
  });
});

app.post('/api/admin/credit', (req, res) => {
  const { email, amount, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'forbidden' });
  const a = Number(amount) || 0;
  if (a === 0) return res.status(400).json({ error: 'invalid amount' });
  db.get('SELECT id,balance FROM users WHERE email = ?', [email], (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'user not found' });
    const newBal = row.balance + a;
    db.run('UPDATE users SET balance = ? WHERE id = ?', [newBal, row.id], function (e) {
      if (e) return res.status(500).json({ error: 'db error' });
      db.run('INSERT INTO transactions (user_id,type,amount) VALUES (?,?,?)', [row.id, 'admin_credit', a]);
      res.json({ email, balance: newBal });
    });
  });
});

// Slot games: 3x3 grid, 5 paylines (top, mid, bot, diag down, diag up)
const SYMBOLS = ['🍒','🍋','🔔','⭐','7️⃣'];
const PAYOUTS = { '🍒':1, '🍋':1.2, '🔔':2, '⭐':3, '7️⃣':5 };

function spinGrid() {
  const grid = [];
  for (let r=0;r<3;r++){
    grid[r]=[];
    for (let c=0;c<3;c++) grid[r][c]=SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)];
  }
  return grid;
}

const PAYLINES = [
  [[0,0],[0,1],[0,2]], // top
  [[1,0],[1,1],[1,2]], // middle
  [[2,0],[2,1],[2,2]], // bottom
  [[0,0],[1,1],[2,2]], // diag down
  [[2,0],[1,1],[0,2]]  // diag up
];

function evaluate(grid, bet) {
  let total = 0;
  const wins = [];
  PAYLINES.forEach((line,i)=>{
    const s0 = grid[line[0][0]][line[0][1]];
    const s1 = grid[line[1][0]][line[1][1]];
    const s2 = grid[line[2][0]][line[2][1]];
    if (s0 === s1 && s1 === s2) {
      const mult = PAYOUTS[s0] || 1;
      const amt = bet * mult;
      total += amt;
      wins.push({ line: i, symbol: s0, amount: amt });
    }
  });
  return { total, wins };
}

app.post('/api/spin', requireAuth, (req, res) => {
  const { bet } = req.body;
  const b = Number(bet) || 0;
  if (b <= 0) return res.status(400).json({ error: 'invalid bet' });
  db.get('SELECT balance FROM users WHERE id = ?', [req.session.userId], (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'user not found' });
    if (row.balance < b) return res.status(400).json({ error: 'insufficient funds' });
    const grid = spinGrid();
    const result = evaluate(grid, b);
    const net = result.total - b; // user pays bet, wins result.total
    const newBal = row.balance + net;
    db.run('UPDATE users SET balance = ? WHERE id = ?', [newBal, req.session.userId], function (e) {
      if (e) return res.status(500).json({ error: 'db error' });
      db.run('INSERT INTO transactions (user_id,type,amount) VALUES (?,?,?)', [req.session.userId, 'spin', net]);
      res.json({ grid, wins: result.wins, payout: result.total, balance: newBal });
    });
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server running on port', port));
