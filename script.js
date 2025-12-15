/* Bảo Long - script.js
   Uses assets/*.png and assets/music.mp3 in the assets folder.
   If you want to test with rectangle placeholders instead of images,
   comment images load or set images.* = null (see commented block).
*/

/* ----------------- Basic setup ----------------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let W = window.innerWidth, H = window.innerHeight;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W; canvas.height = H;
}
resize();
window.addEventListener('resize', resize);

/* ---------- Game state ---------- */
const groundY = () => Math.round(H * 0.78);
let baseSpeed = 300;
let gameSpeed = 1.0;
let elapsed = 0;
let lastTime = null;
let running = false;
let paused = false;
let gameOver = false;
let frameReq = null;

let money = 0;
let totalGold = 0;

let baseObstacleInterval = 1.4;
let baseMoneyInterval = 2.0;

const upgrades = {
  risk: { lvl: 0, baseCost: 100 },
  cooldown: { lvl: 0, baseCost: 150 },
  luck: { lvl: 0, baseCost: 50 }
};

const skills = {
  timeSlow: { lvl: 1, unlocked: true, baseCost: 100, cooldownBase: 60, cooldown: 0, activeUntil: 0, slowPerLevel: 0.10 },
  shield: { lvl: 0, unlocked: false, unlockCost: 150, levelCost: 150, cooldownBase: 60, cooldown: 0, activeUntil: 0, durationBase: 1.0 },
  meteor: { lvl: 0, unlocked: false, unlockCost: 500, levelCost: 150, cooldownBase: 120, cooldown: 0, activeUntil: 0, durationBase: 5.0 }
};

const GOLD_VALUE = 1;
const DIAMOND_VALUE = 10;

let obstacleTimer = 0, moneyTimer = 0;
let nextObstacleInterval = baseObstacleInterval, nextMoneyInterval = baseMoneyInterval;

let obstacles = [], pickups = [];

/* player */
const player = {
  x: Math.round(W * 0.12),
  w: Math.round(Math.min(W, H) * 0.12),
  h: Math.round(Math.min(W, H) * 0.12),
  y: 0,
  vy: 0,
  gravity: 1500,
  jumpForce: -650,
  onGround: true
};

/* images */
const images = {};
const imageFiles = {
  dino: 'assets/dino.png',
  cactus: 'assets/cactus.png',
  bird: 'assets/bird.png',
  meteor: 'assets/meteor.png'
};
let loadedImages = 0;
const totalImagesToLoad = Object.keys(imageFiles).length;
for (const k in imageFiles) {
  images[k] = new Image();
  images[k].src = imageFiles[k];
  images[k].onload = () => { loadedImages++; };
  images[k].onerror = () => { loadedImages++; console.warn('Image failed:', imageFiles[k]); };
}

/* If you want to force placeholders instead of images, uncomment next block:
images.dino = null; images.cactus = null; images.bird = null; images.meteor = null; loadedImages = totalImagesToLoad;
*/

/* music */
const bgMusic = document.getElementById('bgMusic');
bgMusic.volume = 0.45;

/* DOM elements */
const overlay = document.getElementById('overlay');
const shopModal = document.getElementById('shopModal');
const gameOverModal = document.getElementById('gameOver');

const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');

const moneyDisplay = document.getElementById('money');
const timeDisplay = document.getElementById('time');
const speedDisplay = document.getElementById('speed');

const lvlRisk = document.getElementById('lvl-risk');
const lvlCD = document.getElementById('lvl-cd');
const lvlLuck = document.getElementById('lvl-luck');

const costRisk = document.getElementById('cost-risk');
const costCD = document.getElementById('cost-cd');
const costLuck = document.getElementById('cost-luck');

const lvlTimeSlowSpan = document.getElementById('lvl-timeslow');
const lvlShieldSpan = document.getElementById('lvl-shield');
const lvlMeteorSpan = document.getElementById('lvl-meteor');

const cdTimeSlow = document.getElementById('cd-timeSlow');
const cdShield = document.getElementById('cd-shield');
const cdMeteor = document.getElementById('cd-meteor');

const skillButtons = {
  timeSlow: document.getElementById('skillTimeSlow'),
  shield: document.getElementById('skillShield'),
  meteor: document.getElementById('skillMeteor')
};

const finalTimeSpan = document.getElementById('finalTime');
const finalMoneySpan = document.getElementById('finalMoney');

/* ---- utility functions for modifiers ---- */
function getCooldownReduction() {
  const percent = Math.min(75, upgrades.cooldown.lvl * 5);
  return percent / 100;
}
function getAdjustedCooldown(base) { return base * (1 - getCooldownReduction()); }
function getAdjustedObstacleInterval() {
  const inc = upgrades.risk.lvl * 0.05;
  return Math.max(0.35, baseObstacleInterval / (1 + inc));
}
function getAdjustedMoneyInterval() {
  const inc = upgrades.risk.lvl * 0.10;
  return Math.max(0.3, baseMoneyInterval / (1 + inc));
}
function getDiamondChance() {
  const extra = Math.min(0.25 - 0.10, upgrades.luck.lvl * 0.01);
  return 0.10 + extra;
}

/* ---------- Input ---------- */
function handleJump() {
  if (!running || paused || gameOver) return;
  if (player.onGround) { player.vy = player.jumpForce; player.onGround = false; }
}

/* pointer-friendly input for canvas */
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); handleJump(); });
window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); handleJump(); } });

/* ---------- Skill & button handlers (use pointerdown for mobile reliability) ---------- */
function safePointer(el, fn) {
  el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); fn(ev); });
}
safePointer(skillButtons.timeSlow, () => useSkill('timeSlow'));
safePointer(skillButtons.shield, () => useSkill('shield'));
safePointer(skillButtons.meteor, () => useSkill('meteor'));

/* shop buy buttons: pointerdown */
document.querySelectorAll('.buyBtn').forEach(btn => {
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); handleBuy(e.currentTarget.dataset.upgrade); });
});

/* start/resume/restart (pointerdown to avoid touch events being swallowed) */
safePointer(startBtn, () => {
  overlay.classList.remove('visible'); overlay.classList.add('hidden');
  startGame();
  try { bgMusic.play().catch(()=>{}); } catch(e){}
});
safePointer(resumeBtn, () => {
  closeShop();
});
safePointer(restartBtn, () => {
  // quick restart - reload page for clean reset
  location.reload();
});

/* ---------- Shop / Buy logic ---------- */
function handleBuy(key) {
  if (key === 'risk') {
    const cost = upgrades.risk.baseCost * Math.pow(2, upgrades.risk.lvl);
    if (money >= cost) { money -= cost; upgrades.risk.lvl++; updateUI(); nextObstacleInterval = getAdjustedObstacleInterval(); nextMoneyInterval = getAdjustedMoneyInterval(); }
    else alert('Not enough money');
  } else if (key === 'cooldown') {
    const cost = upgrades.cooldown.baseCost * Math.pow(3, upgrades.cooldown.lvl);
    if (money >= cost) { money -= cost; upgrades.cooldown.lvl++; updateUI(); }
    else alert('Not enough money');
  } else if (key === 'luck') {
    const cost = Math.round(upgrades.luck.baseCost * Math.pow(1.5, upgrades.luck.lvl));
    if (money >= cost) { money -= cost; upgrades.luck.lvl++; updateUI(); }
    else alert('Not enough money');
  } else if (key === 'timeslowSkill') {
    const cost = skills.timeSlow.baseCost * skills.timeSlow.lvl;
    if (money >= cost) { money -= cost; skills.timeSlow.lvl++; updateUI(); }
    else alert('Not enough money');
  } else if (key === 'shieldSkill') {
    if (!skills.shield.unlocked) {
      if (money >= skills.shield.unlockCost) { money -= skills.shield.unlockCost; skills.shield.unlocked = true; skills.shield.lvl = 1; updateUI(); }
      else alert('Not enough money to unlock Shield');
    } else {
      const cost = skills.shield.levelCost * skills.shield.lvl;
      if (money >= cost) { money -= cost; skills.shield.lvl++; updateUI(); } else alert('Not enough money');
    }
  } else if (key === 'meteorSkill') {
    if (!skills.meteor.unlocked) {
      if (money >= skills.meteor.unlockCost) { money -= skills.meteor.unlockCost; skills.meteor.unlocked = true; skills.meteor.lvl = 1; updateUI(); }
      else alert('Not enough money to unlock Meteor Call');
    } else {
      const cost = skills.meteor.levelCost * skills.meteor.lvl;
      if (money >= cost) { money -= cost; skills.meteor.lvl++; updateUI(); } else alert('Not enough money');
    }
  }
}

/* ---------- Skill usage ---------- */
function useSkill(name) {
  if (!running || paused || gameOver) return;
  const now = elapsed;
  if (!skills[name].unlocked) { alert('Skill locked. Unlock in shop.'); return; }
  if (skills[name].cooldown > now) return;
  if (name === 'timeSlow') {
    const dur = 3 + skills.timeSlow.lvl * 0.5;
    skills.timeSlow.activeUntil = now + dur;
    skills.timeSlow.cooldown = now + getAdjustedCooldown(skills.timeSlow.cooldownBase);
  } else if (name === 'shield') {
    const dur = skills.shield.durationBase + 0.5 * (skills.shield.lvl - 1);
    skills.shield.activeUntil = now + dur;
    skills.shield.cooldown = now + getAdjustedCooldown(skills.shield.cooldownBase);
  } else if (name === 'meteor') {
    const dur = skills.meteor.durationBase + 1 * (skills.meteor.lvl - 1);
    skills.meteor.activeUntil = now + dur;
    skills.meteor.cooldown = now + getAdjustedCooldown(skills.meteor.cooldownBase);
    spawnMeteor();
  }
  updateUI();
}

/* ---------- Spawning ---------- */
function spawnObstacle() {
  if (skills.meteor.activeUntil > elapsed) return; // meteor blocks obstacles
  const isBird = Math.random() < 0.45;
  if (isBird) {
    const birdH = Math.min(W, H) * 0.09;
    const y = Math.max(50, groundY() - player.h - (Math.random() * (player.h * 2) + player.h * 0.5));
    obstacles.push({ type:'bird', x: W + 40, y, w: birdH, h: birdH });
  } else {
    const cW = Math.min(W, H) * 0.12;
    const y = groundY() - cW * 0.9;
    obstacles.push({ type:'cactus', x: W + 40, y, w: cW * 0.9, h: cW });
  }
}

function spawnPickup() {
  const isDiamond = Math.random() < getDiamondChance();
  const spawnOnGround = Math.random() < 0.5;
  const size = Math.min(W, H) * (isDiamond ? 0.06 : 0.05);
  const y = spawnOnGround ? groundY() - size - 6 : groundY() - player.h - Math.random() * (player.h * 1.2) - size;
  pickups.push({ type: isDiamond ? 'diamond' : 'gold', x: W + 40, y, w: size, h: size });
}

/* meteor visual */
function spawnMeteor() {
  const m = { type:'meteorVis', x: W + 60, y: -100, w: Math.min(W,H) * 0.18, h: Math.min(W,H) * 0.18, vx: -1000, vy: 1200, life: 1.8 };
  obstacles.push(m);
}

/* ---------- Game loop ---------- */
let lastSpeedIncrease = 0;
let shopTriggeredAt = null;

function startGame() {
  resetState();
  running = true; paused = false; gameOver = false;
  lastTime = null;
  frameReq = requestAnimationFrame(loop);
}

function resetState() {
  elapsed = 0; lastSpeedIncrease = 0; gameSpeed = 1.0; money = 0; totalGold = 0;
  obstacles = []; pickups = [];
  player.y = groundY() - player.h; player.vy = 0; player.onGround = true;
  obstacleTimer = 0; moneyTimer = 0;
  nextObstacleInterval = getAdjustedObstacleInterval(); nextMoneyInterval = getAdjustedMoneyInterval();
  upgrades.risk.lvl = upgrades.risk.lvl || 0;
}

function loop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = (ts - lastTime) / 1000;
  lastTime = ts;
  if (!paused && running && !gameOver) { update(dt); render(); }
  frameReq = requestAnimationFrame(loop);
}

function update(dt) {
  elapsed += dt;

  if (Math.floor(elapsed / 60) > lastSpeedIncrease) {
    lastSpeedIncrease = Math.floor(elapsed / 60);
    gameSpeed *= 1.07;
  }

  // Shop every 120s
  if (Math.floor(elapsed) > 0 && Math.floor(elapsed) % 120 === 0 && Math.floor(elapsed) !== 0) {
    if (!shopTriggeredAt || shopTriggeredAt !== Math.floor(elapsed)) {
      shopTriggeredAt = Math.floor(elapsed);
      openShop();
    }
  }

  const now = elapsed;
  const slowMultiplier = (skills.timeSlow.activeUntil > now) ? (1 - (skills.timeSlow.slowPerLevel * skills.timeSlow.lvl)) : 1;
  const effectiveSpeed = baseSpeed * gameSpeed * slowMultiplier;

  // player physics
  player.vy += player.gravity * dt;
  player.y += player.vy * dt;
  if (player.y + player.h >= groundY()) { player.y = groundY() - player.h; player.vy = 0; player.onGround = true; }

  // spawn logic
  obstacleTimer += dt; moneyTimer += dt;
  if (obstacleTimer >= nextObstacleInterval) { spawnObstacle(); obstacleTimer = 0; nextObstacleInterval = getAdjustedObstacleInterval() * (0.85 + Math.random() * 0.5); }
  if (moneyTimer >= nextMoneyInterval) { spawnPickup(); moneyTimer = 0; nextMoneyInterval = getAdjustedMoneyInterval() * (0.7 + Math.random()); }

  // move obstacles/pickups
  for (let i = obstacles.length -1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.type === 'meteorVis') {
      o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt;
      if (o.life <= 0 || o.x + o.w < -200 || o.y > H + 200) obstacles.splice(i,1);
      continue;
    }
    o.x -= effectiveSpeed * dt * ((o.type === 'bird') ? 0.9 : 1.0);
    if (o.x + o.w < -100) obstacles.splice(i,1);
  }
  for (let i = pickups.length -1; i >= 0; i--) {
    const p = pickups[i];
    p.x -= effectiveSpeed * dt * 0.9;
    if (p.x + p.w < -100) pickups.splice(i,1);
  }

  // collisions
  const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };
  let shieldActive = skills.shield.activeUntil > now;
  for (let i = obstacles.length -1; i >=0; i--) {
    const o = obstacles[i];
    if (o.type === 'meteorVis') continue;
    if (rectIntersects(playerRect, {x:o.x,y:o.y,w:o.w,h:o.h})) {
      if (shieldActive) { obstacles.splice(i,1); continue; }
      endGame(); return;
    }
  }
  for (let i = pickups.length -1; i >=0; i--) {
    const p = pickups[i];
    if (rectIntersects(playerRect, {x:p.x,y:p.y,w:p.w,h:p.h})) {
      money += (p.type === 'gold' ? GOLD_VALUE : DIAMOND_VALUE);
      totalGold += (p.type === 'gold' ? 1 : 10);
      pickups.splice(i,1);
      updateUI();
    }
  }

  updateSkillCooldowns();
  updateHUD();
}

function render() {
  ctx.clearRect(0,0,W,H);
  // ground
  ctx.fillStyle = "rgba(34,34,34,0.07)";
  const gY = groundY();
  ctx.fillRect(0, gY, W, H - gY);

  drawPlayer();
  pickups.forEach(drawPickup);
  obstacles.forEach(drawObstacle);

  // shield visual
  if (skills.shield.activeUntil > elapsed) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#00f';
    ctx.beginPath();
    ctx.arc(player.x + player.w/2, player.y + player.h/2, player.w, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // time slow overlay
  if (skills.timeSlow.activeUntil > elapsed) {
    ctx.fillStyle = 'rgba(10,10,30,0.06)';
    ctx.fillRect(0,0,W,H);
  }
}

/* draw utilities */
function drawPlayer() {
  if (images.dino && images.dino.complete && images.dino.naturalWidth !== 0) {
    ctx.drawImage(images.dino, player.x, player.y, player.w, player.h);
  } else {
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#000';
    ctx.fillText('DINO', player.x + 8, player.y + 18);
  }
}
function drawObstacle(o) {
  if (o.type === 'meteorVis') {
    if (images.meteor && images.meteor.complete && images.meteor.naturalWidth !== 0) ctx.drawImage(images.meteor, o.x, o.y, o.w, o.h);
    else { ctx.fillStyle = '#ff8a00'; ctx.fillRect(o.x,o.y,o.w,o.h); }
    return;
  }
  if (o.type === 'cactus') {
    if (images.cactus && images.cactus.complete && images.cactus.naturalWidth !== 0) ctx.drawImage(images.cactus, o.x, o.y, o.w, o.h);
    else { ctx.fillStyle = '#2ecc71'; ctx.fillRect(o.x,o.y,o.w,o.h); }
  } else if (o.type === 'bird') {
    if (images.bird && images.bird.complete && images.bird.naturalWidth !== 0) ctx.drawImage(images.bird, o.x, o.y, o.w, o.h);
    else { ctx.fillStyle = '#a29bfe'; ctx.fillRect(o.x,o.y,o.w,o.h); }
  }
}
function drawPickup(p) {
  if (p.type === 'gold') {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.ellipse(p.x + p.w/2, p.y + p.h/2, p.w/2, p.h/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillText('$', p.x + p.w/2 - 4, p.y + p.h/2 + 4);
  } else {
    ctx.save();
    ctx.translate(p.x + p.w/2, p.y + p.h/2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#7fdbff';
    ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
    ctx.restore();
  }
}

/* ---------- Helpers & UI ---------- */
function rectIntersects(a,b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function endGame() {
  gameOver = true; running = false;
  cancelAnimationFrame(frameReq);
  finalTimeSpan.textContent = Math.floor(elapsed);
  finalMoneySpan.textContent = money;
  gameOverModal.classList.remove('hidden'); gameOverModal.classList.add('visible');
}

function updateHUD() {
  moneyDisplay.textContent = `$${money}`;
  timeDisplay.textContent = `Time: ${Math.floor(elapsed)}s`;
  speedDisplay.textContent = `Speed: ${gameSpeed.toFixed(2)}x`;

  lvlRisk.textContent = upgrades.risk.lvl;
  lvlCD.textContent = upgrades.cooldown.lvl;
  lvlLuck.textContent = upgrades.luck.lvl;

  costRisk.textContent = Math.round(upgrades.risk.baseCost * Math.pow(2, upgrades.risk.lvl));
  costCD.textContent = Math.round(upgrades.cooldown.baseCost * Math.pow(3, upgrades.cooldown.lvl));
  costLuck.textContent = Math.round(upgrades.luck.baseCost * Math.pow(1.5, upgrades.luck.lvl));

  lvlTimeSlowSpan.textContent = skills.timeSlow.lvl;
  lvlShieldSpan.textContent = skills.shield.lvl;
  lvlMeteorSpan.textContent = skills.meteor.lvl;
}

function updateSkillCooldowns() {
  const now = elapsed;
  if (!skills.timeSlow.unlocked) { cdTimeSlow.textContent = 'Locked'; skillButtons.timeSlow.classList.add('locked'); }
  else {
    skillButtons.timeSlow.classList.remove('locked');
    const rem = Math.max(0, skills.timeSlow.cooldown - now);
    cdTimeSlow.textContent = rem > 0 ? `CD: ${Math.ceil(rem)}s` : (skills.timeSlow.activeUntil > now ? `Active` : 'Ready');
  }
  if (!skills.shield.unlocked) { cdShield.textContent = 'Locked'; skillButtons.shield.classList.add('locked'); }
  else {
    skillButtons.shield.classList.remove('locked');
    const rem = Math.max(0, skills.shield.cooldown - now);
    cdShield.textContent = rem > 0 ? `CD: ${Math.ceil(rem)}s` : (skills.shield.activeUntil > now ? `Active` : 'Ready');
  }
  if (!skills.meteor.unlocked) { cdMeteor.textContent = 'Locked'; skillButtons.meteor.classList.add('locked'); }
  else {
    skillButtons.meteor.classList.remove('locked');
    const rem = Math.max(0, skills.meteor.cooldown - now);
    cdMeteor.textContent = rem > 0 ? `CD: ${Math.ceil(rem)}s` : (skills.meteor.activeUntil > now ? `Active` : 'Ready');
  }
}
function updateUI() {
  updateHUD();
  updateSkillCooldowns();
  if (skills.shield.unlocked) skillButtons.shield.classList.remove('locked'); else skillButtons.shield.classList.add('locked');
  if (skills.meteor.unlocked) skillButtons.meteor.classList.remove('locked'); else skillButtons.meteor.classList.add('locked');
}

/* Shop open/close */
function openShop() {
  paused = true;
  shopModal.classList.remove('hidden'); shopModal.classList.add('visible');
}
function closeShop() {
  paused = false;
  shopModal.classList.remove('visible'); shopModal.classList.add('hidden');
  obstacleTimer = 0; moneyTimer = 0;
  nextObstacleInterval = getAdjustedObstacleInterval(); nextMoneyInterval = getAdjustedMoneyInterval();
}

/* initial UI update */
updateUI();
