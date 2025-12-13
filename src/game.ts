import './style.css';



// set active menu item (Играть)
(function setActiveLink(){
  const baseDir = window.location.pathname.replace(/\/[^\/]*$/, '');
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link-mob, .nav-link');
  navLinks.forEach((link) => {
    let linkPath = link.getAttribute('href');
    if (linkPath) linkPath = `${baseDir}${linkPath.replace('./', '/')}`;
    if (linkPath === currentPath) link.classList.add('active');
  });
})();

// Controls wiring (moved below UI elements)

window.addEventListener('resize', () => { generateLevel(); draw(); });

// init
resizeCanvas();
generateLevel();
resetGame();

// UI elements
const startBtn = document.getElementById('start') as HTMLButtonElement | null;
const landBtn = document.getElementById('land') as HTMLButtonElement | null;
const resetBtn = document.getElementById('reset') as HTMLButtonElement | null;
const cashoutBtn = document.getElementById('cashout') as HTMLButtonElement | null;
const multiplierEl = document.getElementById('multiplier') as HTMLElement | null;
const scoreEl = document.getElementById('score') as HTMLElement | null;
const statusEl = document.getElementById('status') as HTMLElement | null;
const _canvasEl = document.getElementById('canvas');
if (!(_canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas not found');
const canvas = _canvasEl;
const ctx = canvas.getContext('2d')!;

// Game state
let running = false;
let crashed = false;
let multiplier = 1.0;
let score = 0;
let lastTime = 0;
let crashAt = 0; // multiplier at which crash happens

// Plane physics
let planeX = 60;
let planeY = 120;
let planeVY = 0;
let planeVX = 160; // px/s
let planeAngle = 0;
let isUp = false;

// Static obstacles and bonuses
type Bonus = { x: number; y: number; type: number; used?: boolean };
type Rocket = { x: number; y: number; r: number; hit?: boolean };
const bonuses: Bonus[] = [];
const rockets: Rocket[] = [];
const carrier = { x: 0, y: 0, w: 220, h: 36 };

// Helpers
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function formatMult(n: number) { return n.toFixed(2) + 'x'; }

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = Math.round(cssW * ratio);
  canvas.height = Math.round(cssH * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function generateLevel() {
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  // carrier on right
  carrier.x = cw - carrier.w - 40;
  carrier.y = ch - 40;

  // clear lists
  bonuses.length = 0;
  rockets.length = 0;

  // bonuses (static) with types: [1, 5, 10, 2, 5]
  const bonusTypes = [1, 5, 10, 2, 5];
  for (let i = 0; i < bonusTypes.length; i++) {
    const bx = 100 + i * 110;
    const by = ch - 140 - ((i % 2) * 36);
    bonuses.push({ x: bx, y: by, type: bonusTypes[i] });
  }

  // rockets static
  for (let i = 0; i < 5; i++) {
    const rx = 160 + i * 120;
    const ry = ch - 80 - ((i % 2) * 60);
    rockets.push({ x: rx, y: ry, r: 10 });
  }
}

function resetGame() {
  running = false;
  crashed = false;
  multiplier = 1.0;
  lastTime = performance.now();
  score = 0;
  planeX = 60;
  planeY = canvas.clientHeight - 120;
  planeVY = 0;
  planeAngle = 0;
  multiplierEl && (multiplierEl.textContent = formatMult(multiplier));
  scoreEl && (scoreEl.textContent = String(score));
  statusEl && (statusEl.textContent = 'Ожидание');
  cashoutBtn && (cashoutBtn.disabled = true);
  startBtn && (startBtn.disabled = false);
  landBtn && (landBtn.disabled = false);
  generateLevel();
  draw();
}

function randomCrash() {
  // random crash multiplier 2..8
  return 2 + Math.random() * 8;
}

function startRound() {
  if (running) return;
  crashAt = randomCrash();
  running = true;
  crashed = false;
  lastTime = performance.now();
  planeX = 60;
  planeY = canvas.clientHeight - 120;
  planeVY = 0;
  multiplier = 1.0;
  startBtn && (startBtn.disabled = true);
  cashoutBtn && (cashoutBtn.disabled = false);
  statusEl && (statusEl.textContent = 'В полёте');
  requestAnimationFrame(loop);
}

function cashout() {
  if (!running || crashed) return;
  running = false;
  cashoutBtn && (cashoutBtn.disabled = true);
  const reward = Math.round(multiplier * 10);
  score += reward;
  scoreEl && (scoreEl.textContent = String(score));
  statusEl && (statusEl.textContent = `Вы забрали: ${formatMult(multiplier)} (+${reward})`);
  startBtn && (startBtn.disabled = false);
}

function doLand() {
  if (!running) return;
  // plane must be above carrier area and vertical speed slow
  const puX = planeX;
  if (puX > carrier.x - 10 && puX < carrier.x + carrier.w + 10 && Math.abs(planeVY) < 200) {
    running = false;
    const reward = Math.round(multiplier * 20);
    score += reward;
    scoreEl && (scoreEl.textContent = String(score));
    statusEl && (statusEl.textContent = `Приземление успешно! +${reward}`);
    startBtn && (startBtn.disabled = false);
    cashoutBtn && (cashoutBtn.disabled = true);
  } else {
    statusEl && (statusEl.textContent = 'Не получилось приземлиться');
  }
}

function loop(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (running) {
    // update multiplier
    multiplier += dt * (0.5 + multiplier * 0.12);
    multiplierEl && (multiplierEl.textContent = formatMult(multiplier));

    // update plane position
    planeX += planeVX * dt;
    planeVY += isUp ? -850 * dt : 600 * dt; // thrust up or gravity
    planeY += planeVY * dt;
    planeAngle = clamp(-planeVY / 240, -0.7, 0.7);

    // limits
    const minY = 24;
    const maxY = canvas.clientHeight - 24;
    if (planeY < minY) { planeY = minY; planeVY = 0; }
    if (planeY > maxY) { planeY = maxY; planeVY = 0; }

    // check collisions with rockets
    for (const r of rockets) {
      if (r.hit) continue;
      const dx = planeX - r.x; const dy = planeY - r.y;
      const rr = r.r + 10;
      if (dx * dx + dy * dy < rr * rr) {
        // crash!
        crashed = true;
        running = false;
        r.hit = true;
        statusEl && (statusEl.textContent = `Сбит ракетой @ ${formatMult(multiplier)}`);
        cashoutBtn && (cashoutBtn.disabled = true);
        startBtn && (startBtn.disabled = false);
      }
    }

    // bonuses collision
    for (const b of bonuses) {
      if (b.used) continue;
      const dx = planeX - b.x; const dy = planeY - b.y;
      if (dx * dx + dy * dy < (10 + 12) * (10 + 12)) {
        b.used = true;
        score += b.type * 20;
        scoreEl && (scoreEl.textContent = String(score));
        // visual feedback
        statusEl && (statusEl.textContent = `Бонус x${b.type} собран`);
      }
    }

    // crash by multiplier
    if (multiplier >= crashAt) {
      crashed = true;
      running = false;
      statusEl && (statusEl.textContent = `Краш @ ${formatMult(multiplier)}`);
      cashoutBtn && (cashoutBtn.disabled = true);
      startBtn && (startBtn.disabled = false);
    }

    // wrap plane to left if goes off screen
    const cw = canvas.clientWidth;
    if (planeX > cw + 80) {
      planeX = -40;
    }
  }

  draw();
  if (running) requestAnimationFrame(loop);
}

function draw() {
  resizeCanvas();
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  ctx.clearRect(0, 0, cw, ch);

  // background gradient
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, '#021428');
  g.addColorStop(1, '#002b3e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);

  // water / sea line
  ctx.fillStyle = '#032c3b';
  ctx.fillRect(0, ch - 28, cw, 28);

  // draw carrier
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(carrier.x, carrier.y, carrier.w, carrier.h);
  ctx.fillStyle = '#d5d8dc';
  ctx.fillRect(carrier.x + 10, carrier.y + 6, 60, 12);

  // draw bonuses
  for (const b of bonuses) {
    if (b.used) continue;
    ctx.fillStyle = '#39d353';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText('x' + b.type, b.x - 10, b.y + 5);
  }

  // draw rockets
  for (const r of rockets) {
    ctx.fillStyle = r.hit ? '#612020' : '#ff4d4d';
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.fill();
    // simple rocket nose
    ctx.fillStyle = '#aa0000';
    ctx.fillRect(r.x - 3, r.y - r.r - 6, 6, 4);
  }

  // path line
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, ch - 30);
  const t = clamp(multiplier / 20, 0, 1);
  for (let x = 20; x <= cw - 40; x += 18) {
    const y = ch - 30 - Math.sin((x / cw) * Math.PI * 2) * 28 - t * 90;
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // draw plane
  ctx.save();
  ctx.translate(planeX, planeY);
  ctx.rotate(planeAngle);
  ctx.fillStyle = '#ffd400';
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff8f00';
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(10, -6);
  ctx.lineTo(10, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // text overlays (multiplier / status / score)
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.fillText('Multiplier: ' + formatMult(multiplier), 10, 22);
  ctx.fillText('Score: ' + score, 10, 44);
  if (crashed) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText('CRASHED', cw / 2 - 46, ch / 2);
  }
}

// set active menu item (Играть)
(function setActiveLink(){
  const baseDir = window.location.pathname.replace(/\/[^\/]*$/, '');
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link-mob, .nav-link');
  navLinks.forEach((link) => {
    let linkPath = link.getAttribute('href');
    if (linkPath) linkPath = `${baseDir}${linkPath.replace('./', '/')}`;
    if (linkPath === currentPath) link.classList.add('active');
  });
})();

// Controls wiring
startBtn?.addEventListener('click', () => { resetGame(); startRound(); });
landBtn?.addEventListener('click', () => { doLand(); });
resetBtn?.addEventListener('click', () => { resetGame(); });
cashoutBtn?.addEventListener('click', () => { cashout(); });

window.addEventListener('keydown', (e) => { if (e.code === 'Space') isUp = true; });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') isUp = false; });
window.addEventListener('mousedown', () => isUp = true);
window.addEventListener('mouseup', () => isUp = false);

window.addEventListener('resize', () => { generateLevel(); draw(); });

// init
resizeCanvas();
generateLevel();
resetGame();
/** removed final duplicated block **/
