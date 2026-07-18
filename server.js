const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const DRAWS_FILE = path.join(DATA_DIR, 'draws.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

let drawTimer = null;

function ensureEnvironment() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]');
  }
  if (!fs.existsSync(TICKETS_FILE)) {
    fs.writeFileSync(TICKETS_FILE, '[]');
  }
  if (!fs.existsSync(DRAWS_FILE)) {
    fs.writeFileSync(DRAWS_FILE, '[]');
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
      siteName: 'birloto.com',
      gameName: 'Russian Loto Demo',
      ticketPrice: 100,
      welcomeBonus: 500,
      startingBalance: 2000,
      rowMultiplier: 2,
      twoRowMultiplier: 5,
      fullHouseMultiplier: 10,
      autoDrawIntervalMs: 2500,
      allowSelfStart: true,
      theme: {
        primary: '#7a0014',
        secondary: '#d4af37',
        dark: '#0f0a0a'
      }
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getUsers() {
  return readJson(USERS_FILE, []);
}

function saveUsers(users) {
  writeJson(USERS_FILE, users);
}

function getTickets() {
  return readJson(TICKETS_FILE, []);
}

function saveTickets(tickets) {
  writeJson(TICKETS_FILE, tickets);
}

function getDraws() {
  return readJson(DRAWS_FILE, []);
}

function saveDraws(draws) {
  writeJson(DRAWS_FILE, draws);
}

function getSettings() {
  return readJson(SETTINGS_FILE, {});
}

function saveSettings(settings) {
  writeJson(SETTINGS_FILE, settings);
}

function nextId(items) {
  return items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    balance: user.balance,
    bonusBalance: user.bonusBalance,
    isAdmin: !!user.isAdmin,
    createdAt: user.createdAt,
    stats: user.stats || {
      gamesPlayed: 0,
      ticketsBought: 0,
      totalSpent: 0,
      totalWon: 0,
      biggestWin: 0
    }
  };
}

function getCurrentWaitingRound(draws) {
  return draws.find((draw) => draw.status === 'waiting') || null;
}

function getCurrentActiveRound(draws) {
  return draws.find((draw) => draw.status === 'active') || null;
}

function generateRemainingNumbers() {
  return Array.from({ length: 90 }, (_, index) => index + 1);
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function combinationsOfRows(size) {
  const rows = [0, 1, 2];
  const combos = [];
  function walk(start, current) {
    if (current.length === size) {
      combos.push([...current]);
      return;
    }
    for (let i = start; i < rows.length; i += 1) {
      current.push(rows[i]);
      walk(i + 1, current);
      current.pop();
    }
  }
  walk(0, []);
  return combos;
}

function assignColumnsToRows(columnCounts) {
  const rowRemaining = [5, 5, 5];
  const possibilities = columnCounts.map((count) => shuffle(combinationsOfRows(count)));

  function backtrack(columnIndex, assignments) {
    if (columnIndex === columnCounts.length) {
      if (rowRemaining.every((value) => value === 0)) {
        return assignments;
      }
      return null;
    }

    for (const combo of possibilities[columnIndex]) {
      const canUse = combo.every((row) => rowRemaining[row] > 0);
      if (!canUse) {
        continue;
      }

      combo.forEach((row) => {
        rowRemaining[row] -= 1;
      });
      assignments[columnIndex] = combo;

      const result = backtrack(columnIndex + 1, assignments);
      if (result) {
        return result;
      }

      combo.forEach((row) => {
        rowRemaining[row] += 1;
      });
      assignments[columnIndex] = null;
    }
    return null;
  }

  return backtrack(0, Array(columnCounts.length).fill(null));
}

function generateLotoCard() {
  const columnRanges = [
    [1, 9],
    [10, 19],
    [20, 29],
    [30, 39],
    [40, 49],
    [50, 59],
    [60, 69],
    [70, 79],
    [80, 90]
  ];

  const columnCounts = Array(9).fill(1);
  let extra = 6;
  while (extra > 0) {
    const index = Math.floor(Math.random() * 9);
    if (columnCounts[index] < 3) {
      columnCounts[index] += 1;
      extra -= 1;
    }
  }

  const rowAssignments = assignColumnsToRows(columnCounts);
  if (!rowAssignments) {
    return generateLotoCard();
  }

  const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
  const rowNumbers = [[], [], []];

  for (let column = 0; column < 9; column += 1) {
    const [min, max] = columnRanges[column];
    const pool = Array.from({ length: max - min + 1 }, (_, index) => min + index);
    const chosen = shuffle(pool).slice(0, columnCounts[column]).sort((a, b) => a - b);
    const rows = [...rowAssignments[column]].sort((a, b) => a - b);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const number = chosen[i];
      grid[row][column] = number;
      rowNumbers[row].push(number);
    }
  }

  rowNumbers.forEach((numbers) => numbers.sort((a, b) => a - b));

  return {
    grid,
    rowNumbers,
    numbers: grid.flat().filter((value) => value !== null).sort((a, b) => a - b)
  };
}

function spendFromWallet(user, amount) {
  let remaining = amount;
  let bonusSpent = 0;
  let balanceSpent = 0;

  if (user.bonusBalance > 0) {
    bonusSpent = Math.min(user.bonusBalance, remaining);
    user.bonusBalance -= bonusSpent;
    remaining -= bonusSpent;
  }

  if (remaining > 0) {
    balanceSpent = Math.min(user.balance, remaining);
    user.balance -= balanceSpent;
    remaining -= balanceSpent;
  }

  return {
    success: remaining === 0,
    bonusSpent,
    balanceSpent,
    totalSpent: amount - remaining
  };
}

function createWaitingRound() {
  const draws = getDraws();
  const settings = getSettings();
  const active = getCurrentActiveRound(draws);
  const waiting = getCurrentWaitingRound(draws);

  if (active || waiting) {
    return active || waiting;
  }

  const newRound = {
    id: nextId(draws),
    status: 'waiting',
    ticketPrice: settings.ticketPrice,
    numbersDrawn: [],
    remainingNumbers: generateRemainingNumbers(),
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    winners: [],
    stats: {
      totalTickets: 0,
      totalPot: 0,
      totalPayout: 0,
      highestSinglePayout: 0,
      lastNumber: null
    }
  };

  draws.push(newRound);
  saveDraws(draws);
  return newRound;
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Giriş tələb olunur.' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  const users = getUsers();
  const user = users.find((item) => item.id === req.session.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin icazəsi tələb olunur.' });
  }
  return next();
}

function updateTicketOutcome(ticket, drawnNumbers, settings, round) {
  const drawnSet = new Set(drawnNumbers);
  const matchedNumbers = ticket.card.numbers.filter((number) => drawnSet.has(number));
  ticket.matchedNumbers = matchedNumbers;

  const rowHits = ticket.card.rowNumbers.map((row) => row.filter((number) => drawnSet.has(number)).length);
  const completedRows = rowHits.filter((count) => count === 5).length;
  let payout = 0;

  if (!ticket.payouts.oneRow && completedRows >= 1) {
    ticket.payouts.oneRow = true;
    payout += ticket.price * settings.rowMultiplier;
    round.winners.push({
      ticketId: ticket.id,
      userId: ticket.userId,
      username: ticket.username,
      prizeType: 'Bir sıra',
      amount: ticket.price * settings.rowMultiplier,
      numberAt: round.stats.lastNumber,
      createdAt: new Date().toISOString()
    });
  }

  if (!ticket.payouts.twoRows && completedRows >= 2) {
    ticket.payouts.twoRows = true;
    payout += ticket.price * settings.twoRowMultiplier;
    round.winners.push({
      ticketId: ticket.id,
      userId: ticket.userId,
      username: ticket.username,
      prizeType: 'İki sıra',
      amount: ticket.price * settings.twoRowMultiplier,
      numberAt: round.stats.lastNumber,
      createdAt: new Date().toISOString()
    });
  }

  if (!ticket.payouts.fullHouse && matchedNumbers.length === 15) {
    ticket.payouts.fullHouse = true;
    payout += ticket.price * settings.fullHouseMultiplier;
    ticket.status = 'completed';
    round.winners.push({
      ticketId: ticket.id,
      userId: ticket.userId,
      username: ticket.username,
      prizeType: 'Full House',
      amount: ticket.price * settings.fullHouseMultiplier,
      numberAt: round.stats.lastNumber,
      createdAt: new Date().toISOString()
    });
  }

  ticket.rowHits = rowHits;
  ticket.totalPayout = (ticket.totalPayout || 0) + payout;
  return payout;
}

function settleCurrentNumber(round) {
  const settings = getSettings();
  const tickets = getTickets();
  const users = getUsers();
  const roundTickets = tickets.filter((ticket) => ticket.roundId === round.id);
  let roundPayout = 0;

  roundTickets.forEach((ticket) => {
    const payout = updateTicketOutcome(ticket, round.numbersDrawn, settings, round);
    if (payout > 0) {
      const user = users.find((item) => item.id === ticket.userId);
      if (user) {
        user.balance += payout;
        user.stats.totalWon += payout;
        user.stats.biggestWin = Math.max(user.stats.biggestWin || 0, payout);
      }
      roundPayout += payout;
      round.stats.highestSinglePayout = Math.max(round.stats.highestSinglePayout, payout);
    }
  });

  round.stats.totalPayout += roundPayout;
  saveTickets(tickets);
  saveUsers(users);
}

function finalizeRound(round) {
  round.status = 'completed';
  round.completedAt = new Date().toISOString();
  round.remainingNumbers = [];

  const tickets = getTickets();
  const users = getUsers();

  tickets
    .filter((ticket) => ticket.roundId === round.id)
    .forEach((ticket) => {
      if (!ticket.payouts.fullHouse) {
        ticket.status = 'closed';
      }
      const user = users.find((item) => item.id === ticket.userId);
      if (user) {
        user.stats.gamesPlayed += 1;
      }
    });

  saveTickets(tickets);
  saveUsers(users);

  const draws = getDraws();
  const drawIndex = draws.findIndex((item) => item.id === round.id);
  if (drawIndex !== -1) {
    draws[drawIndex] = round;
    saveDraws(draws);
  }

  if (drawTimer) {
    clearInterval(drawTimer);
    drawTimer = null;
  }

  createWaitingRound();
}

function drawNextNumber() {
  const draws = getDraws();
  const activeRound = getCurrentActiveRound(draws);
  if (!activeRound) {
    if (drawTimer) {
      clearInterval(drawTimer);
      drawTimer = null;
    }
    return;
  }

  if (!activeRound.remainingNumbers.length) {
    finalizeRound(activeRound);
    return;
  }

  const index = Math.floor(Math.random() * activeRound.remainingNumbers.length);
  const number = activeRound.remainingNumbers.splice(index, 1)[0];
  activeRound.numbersDrawn.push(number);
  activeRound.stats.lastNumber = number;

  settleCurrentNumber(activeRound);

  const allTickets = getTickets().filter((ticket) => ticket.roundId === activeRound.id);
  const allCompleted = allTickets.length > 0 && allTickets.every((ticket) => ticket.payouts.fullHouse);

  const drawIndex = draws.findIndex((item) => item.id === activeRound.id);
  if (drawIndex !== -1) {
    draws[drawIndex] = activeRound;
    saveDraws(draws);
  }

  if (!activeRound.remainingNumbers.length || allCompleted) {
    finalizeRound(activeRound);
  }
}

function startAutoDrawIfNeeded() {
  const settings = getSettings();
  const draws = getDraws();
  const activeRound = getCurrentActiveRound(draws);
  if (!activeRound) {
    return;
  }
  if (drawTimer) {
    clearInterval(drawTimer);
  }
  drawTimer = setInterval(drawNextNumber, settings.autoDrawIntervalMs || 2500);
}

function startRound() {
  const draws = getDraws();
  const waitingRound = getCurrentWaitingRound(draws);
  if (!waitingRound) {
    return { error: 'Başlanacaq növbə tapılmadı.' };
  }

  const tickets = getTickets().filter((ticket) => ticket.roundId === waitingRound.id);
  if (!tickets.length) {
    return { error: 'Başlatmaq üçün ən azı bir bilet olmalıdır.' };
  }

  waitingRound.status = 'active';
  waitingRound.startedAt = new Date().toISOString();
  waitingRound.stats.totalTickets = tickets.length;
  waitingRound.stats.totalPot = tickets.reduce((sum, item) => sum + item.price, 0);
  saveDraws(draws);
  startAutoDrawIfNeeded();
  return { round: waitingRound };
}

function getPublicRound(round) {
  if (!round) {
    return null;
  }
  return {
    id: round.id,
    status: round.status,
    ticketPrice: round.ticketPrice,
    numbersDrawn: round.numbersDrawn,
    remainingCount: round.remainingNumbers.length,
    createdAt: round.createdAt,
    startedAt: round.startedAt,
    completedAt: round.completedAt,
    winners: round.winners.slice(-20),
    stats: round.stats
  };
}

function seedAdminIfMissing() {
  const users = getUsers();
  const hasAdmin = users.some((user) => user.isAdmin);
  if (!hasAdmin) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    users.push({
      id: nextId(users),
      username: 'admin',
      passwordHash,
      balance: 100000,
      bonusBalance: 0,
      isAdmin: true,
      createdAt: new Date().toISOString(),
      stats: {
        gamesPlayed: 0,
        ticketsBought: 0,
        totalSpent: 0,
        totalWon: 0,
        biggestWin: 0
      }
    });
    saveUsers(users);
  }
}

ensureEnvironment();
seedAdminIfMissing();
createWaitingRound();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'birloto-demo-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(express.static(PUBLIC_DIR));

app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

app.get('/api/session', (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  const users = getUsers();
  const user = users.find((item) => item.id === req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ authenticated: false });
  }
  return res.json({ authenticated: true, user: sanitizeUser(user) });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'İstifadəçi adı və şifrə tələb olunur.' });
  }
  if (String(username).length < 3 || String(password).length < 6) {
    return res.status(400).json({ error: 'İstifadəçi adı ən azı 3, şifrə ən azı 6 simvol olmalıdır.' });
  }

  const users = getUsers();
  const existing = users.find((user) => user.username.toLowerCase() === String(username).toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Bu istifadəçi adı artıq mövcuddur.' });
  }

  const settings = getSettings();
  const passwordHash = await bcrypt.hash(String(password), 10);
  const newUser = {
    id: nextId(users),
    username: String(username).trim(),
    passwordHash,
    balance: settings.startingBalance || 2000,
    bonusBalance: settings.welcomeBonus || 500,
    isAdmin: false,
    createdAt: new Date().toISOString(),
    stats: {
      gamesPlayed: 0,
      ticketsBought: 0,
      totalSpent: 0,
      totalWon: 0,
      biggestWin: 0
    }
  };

  users.push(newUser);
  saveUsers(users);
  req.session.userId = newUser.id;
  return res.status(201).json({ message: 'Qeydiyyat tamamlandı.', user: sanitizeUser(newUser) });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  const user = users.find((item) => item.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Yanlış giriş məlumatları.' });
  }

  const valid = await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Yanlış giriş məlumatları.' });
  }

  req.session.userId = user.id;
  return res.json({ message: 'Giriş uğurludur.', user: sanitizeUser(user) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Çıxış edildi.' });
  });
});

app.get('/api/lobby', (req, res) => {
  const draws = getDraws();
  const current = getCurrentActiveRound(draws) || getCurrentWaitingRound(draws) || createWaitingRound();
  const tickets = getTickets();
  const recentRounds = [...draws]
    .filter((draw) => draw.status === 'completed')
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 10)
    .map((round) => ({
      ...getPublicRound(round),
      players: new Set(tickets.filter((ticket) => ticket.roundId === round.id).map((ticket) => ticket.userId)).size
    }));

  const playersInCurrent = new Set(tickets.filter((ticket) => ticket.roundId === current.id).map((ticket) => ticket.userId)).size;
  const totalTicketsInCurrent = tickets.filter((ticket) => ticket.roundId === current.id).length;

  res.json({
    currentRound: {
      ...getPublicRound(current),
      players: playersInCurrent,
      totalTickets: totalTicketsInCurrent
    },
    recentRounds,
    settings: getSettings()
  });
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  const users = getUsers();
  const user = users.find((item) => item.id === req.session.userId);
  const draws = getDraws();
  const tickets = getTickets();
  const myTickets = tickets
    .filter((ticket) => ticket.userId === user.id)
    .sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt))
    .slice(0, 20);
  const myRounds = draws
    .filter((draw) => myTickets.some((ticket) => ticket.roundId === draw.id))
    .sort((a, b) => new Date((b.completedAt || b.createdAt)) - new Date((a.completedAt || a.createdAt)));

  res.json({
    user: sanitizeUser(user),
    tickets: myTickets,
    rounds: myRounds.map(getPublicRound),
    currentRound: getPublicRound(getCurrentActiveRound(draws) || getCurrentWaitingRound(draws))
  });
});

app.get('/api/history', requireAuth, (req, res) => {
  const tickets = getTickets();
  const draws = getDraws();
  const history = tickets
    .filter((ticket) => ticket.userId === req.session.userId)
    .sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt))
    .map((ticket) => ({
      ...ticket,
      round: getPublicRound(draws.find((draw) => draw.id === ticket.roundId))
    }));
  res.json({ history });
});

app.post('/api/tickets/buy', requireAuth, (req, res) => {
  const quantity = Math.max(1, Math.min(20, Number(req.body.quantity || 1)));
  const draws = getDraws();
  const currentRound = getCurrentActiveRound(draws) || getCurrentWaitingRound(draws) || createWaitingRound();
  if (currentRound.status !== 'waiting') {
    return res.status(400).json({ error: 'Hazırda bilet satışı bağlıdır. Yeni raundu gözləyin.' });
  }

  const users = getUsers();
  const user = users.find((item) => item.id === req.session.userId);
  const totalPrice = currentRound.ticketPrice * quantity;
  const availableFunds = user.balance + user.bonusBalance;
  if (availableFunds < totalPrice) {
    return res.status(400).json({ error: 'Balans kifayət deyil.' });
  }

  const spendResult = spendFromWallet(user, totalPrice);
  if (!spendResult.success) {
    return res.status(400).json({ error: 'Ödəniş zamanı xəta baş verdi.' });
  }

  const tickets = getTickets();
  const newTickets = [];
  for (let i = 0; i < quantity; i += 1) {
    const card = generateLotoCard();
    const ticket = {
      id: nextId(tickets.concat(newTickets)),
      roundId: currentRound.id,
      userId: user.id,
      username: user.username,
      price: currentRound.ticketPrice,
      card,
      rowHits: [0, 0, 0],
      matchedNumbers: [],
      payouts: {
        oneRow: false,
        twoRows: false,
        fullHouse: false
      },
      totalPayout: 0,
      status: 'active',
      purchasedAt: new Date().toISOString()
    };
    newTickets.push(ticket);
  }

  tickets.push(...newTickets);
  user.stats.ticketsBought += quantity;
  user.stats.totalSpent += totalPrice;
  saveTickets(tickets);
  saveUsers(users);

  const updatedDraws = getDraws();
  const drawIndex = updatedDraws.findIndex((draw) => draw.id === currentRound.id);
  if (drawIndex !== -1) {
    updatedDraws[drawIndex].stats.totalTickets += quantity;
    updatedDraws[drawIndex].stats.totalPot += totalPrice;
    saveDraws(updatedDraws);
  }

  res.status(201).json({
    message: `${quantity} bilet alındı.`,
    tickets: newTickets,
    user: sanitizeUser(user),
    round: getPublicRound(updatedDraws.find((draw) => draw.id === currentRound.id))
  });
});

app.get('/api/game/state', requireAuth, (req, res) => {
  const draws = getDraws();
  const currentRound = getCurrentActiveRound(draws) || getCurrentWaitingRound(draws) || createWaitingRound();
  const tickets = getTickets().filter((ticket) => ticket.roundId === currentRound.id && ticket.userId === req.session.userId);
  const users = getUsers();
  const user = users.find((item) => item.id === req.session.userId);

  res.json({
    round: getPublicRound(currentRound),
    tickets,
    user: sanitizeUser(user),
    recentCompleted: draws
      .filter((draw) => draw.status === 'completed')
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, 5)
      .map(getPublicRound)
  });
});

app.post('/api/game/start', requireAuth, (req, res) => {
  const settings = getSettings();
  const users = getUsers();
  const user = users.find((item) => item.id === req.session.userId);
  if (!settings.allowSelfStart && !user.isAdmin) {
    return res.status(403).json({ error: 'Raundu yalnız admin başlada bilər.' });
  }

  const result = startRound();
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ message: 'Raund başladı.', round: getPublicRound(result.round) });
});

app.get('/api/admin/overview', requireAuth, requireAdmin, (req, res) => {
  const users = getUsers();
  const draws = getDraws();
  const tickets = getTickets();
  const totals = {
    users: users.length,
    activeUsers: users.filter((user) => !user.isAdmin).length,
    totalTickets: tickets.length,
    totalTicketSales: tickets.reduce((sum, ticket) => sum + ticket.price, 0),
    totalPayout: tickets.reduce((sum, ticket) => sum + (ticket.totalPayout || 0), 0),
    activeRoundTickets: (() => {
      const activeOrWaiting = getCurrentActiveRound(draws) || getCurrentWaitingRound(draws);
      if (!activeOrWaiting) {
        return 0;
      }
      return tickets.filter((ticket) => ticket.roundId === activeOrWaiting.id).length;
    })()
  };

  res.json({
    totals,
    users: users.map(sanitizeUser),
    draws: draws
      .sort((a, b) => new Date((b.completedAt || b.createdAt)) - new Date((a.completedAt || a.createdAt)))
      .map(getPublicRound),
    settings: getSettings()
  });
});

app.post('/api/admin/credit', requireAuth, requireAdmin, (req, res) => {
  const { userId, amount, type } = req.body;
  const users = getUsers();
  const user = users.find((item) => item.id === Number(userId));
  if (!user) {
    return res.status(404).json({ error: 'İstifadəçi tapılmadı.' });
  }
  const numericAmount = Number(amount || 0);
  if (!numericAmount || numericAmount <= 0) {
    return res.status(400).json({ error: 'Məbləğ düzgün deyil.' });
  }

  if (type === 'bonus') {
    user.bonusBalance += numericAmount;
  } else {
    user.balance += numericAmount;
  }
  saveUsers(users);
  return res.json({ message: 'Balans yeniləndi.', user: sanitizeUser(user) });
});

app.post('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const current = getSettings();
  const updated = {
    ...current,
    ticketPrice: Number(req.body.ticketPrice || current.ticketPrice),
    welcomeBonus: Number(req.body.welcomeBonus || current.welcomeBonus),
    startingBalance: Number(req.body.startingBalance || current.startingBalance),
    rowMultiplier: Number(req.body.rowMultiplier || current.rowMultiplier),
    twoRowMultiplier: Number(req.body.twoRowMultiplier || current.twoRowMultiplier),
    fullHouseMultiplier: Number(req.body.fullHouseMultiplier || current.fullHouseMultiplier),
    autoDrawIntervalMs: Number(req.body.autoDrawIntervalMs || current.autoDrawIntervalMs),
    allowSelfStart: String(req.body.allowSelfStart) === 'true'
  };
  saveSettings(updated);
  startAutoDrawIfNeeded();
  res.json({ message: 'Ayarlar yeniləndi.', settings: updated });
});

app.get('/api/admin/export', requireAuth, requireAdmin, (req, res) => {
  res.json({
    exportedAt: new Date().toISOString(),
    users: getUsers().map(sanitizeUser),
    draws: getDraws(),
    tickets: getTickets(),
    settings: getSettings()
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Sorğu tapılmadı.' });
});

startAutoDrawIfNeeded();

app.listen(PORT, () => {
  console.log(`birloto demo server running on port ${PORT}`);
});
