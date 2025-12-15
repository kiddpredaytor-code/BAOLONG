/* Bảo Long - main gameplay script
   Uses images in /assets/ (dino.png, cactus.png, bird.png, meteor.png, bg.png)
   and music.mp3
*/

/* ------------- CONFIG & STATE ------------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let W = window.innerWidth;
let H = window.innerHeight;
canvas.width = W;
canvas.height = H;

window.addEventListener('resize', () => {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W; canvas.height = H;
});

/* Game variables */
const groundY = () => Math.round(H * 0.78); // ground Y position
let gameSpeed = 1.0; // base multiplier, increases every minute
let baseSpeed = 300; // pixels per second baseline
let lastSpeedIncrease = 0; // seconds

let elapsed = 0; // total seconds survived
let lastTime = null;
let running = false;
let paused = false;
let gameOver = false;
let frameReq = null;

let money = 0;
let totalGold = 0; // for final tally

/* Spawn rates (in seconds as base intervals) */
let baseObstacleInterval = 1.4; // average seconds between obstacles
let baseMoneyInterval = 2.0;

/* Upgrades / Skills state */
const upgrades = {
  risk: { lvl: 0, baseCost: 100 },
  cooldown: { lvl: 0, baseCost: 150 },
  luck: { lvl: 0, baseCost: 50 }
};

const skills = {
  timeSlow: {
    lvl: 1, // starter unlocked at level 1
    unlocked: true,
    baseCost: 100,
    cooldownBase: 60,
    cooldown: 0,
    activeUntil: 0,
    slowPerLevel: 0.10, // 10% per level
  },
  shield: {
    lvl: 0,
    unlocked: false,
    unlockCost: 150,
    levelCost: 150,
    cooldownBase: 60,
    cooldown: 0,
    activeUntil: 0,
    durationBase: 1.0, // 1s
  },
  meteor: {
    lvl: 0,
    unlocked: false,
    unlockCost: 500,
    levelCost: 150,
    cooldownBase: 120,
    cooldown: 0,
    activeUntil: 0,
    durationBase: 5.0
  }
};

/* probabilities */
let diamondChance = 0.10; // 10% initially (1/10)
const DIAMOND_VALUE = 10;
const GOLD_VALUE = 1;

/* special effects */
let meteorActive = false;
let shieldActive = false;

/* spawn timers */
let obstacleTimer = 0;
let moneyTimer = 0;
let nextObstacleInterval = getAdjustedObstacleInterval();
let nextMoneyInterval = getAdjustedMoneyInterval();

/* objects arrays */
let obstacles = []; // {type:'cactus'|'bird', x, y, w, h, vx}
let pickups = []; // {type:'gold'|'diamond', x, y, w, h, vy}

/* Player (dino) */
const player = {
  x: Math.round(W * 0.12),
  w: Math.round(Math.min(W, H) * 0.12),
  h: Math.round(Math.min(W, H) * 0.12),
  y: 0, // will be set
  vy: 0,
  gravity: 1500,
  jumpForce: -650,
  onGround: true,
  invincibleUntil: 0
};

/* Load images */
const images = {};
const imageFiles = {
  dino: 'assets/dino.png',
  cactus: 'assets/cactus.png',
  bird: 'assets/bird.png',
  meteor: 'assets/meteor.png'
};

let loadedImages = 0;
const totalImagesToLoad = Object.keys(imageFiles).length;
for (const key in imageFiles) {
  images[key] = new Image();
  images[key].src = imageFiles[key];
  images[key].onload = () => { loadedImages++; };
  images[key].onerror = () => {
    // If image failed to load, simply mark as loaded; we will fall back to colored rectangles
    loadedImages++;
    console.warn(`Failed loading ${imageFiles[key]}. Using placeholder for ${key}.`);
  };
}

/* Uncomment the following block to use colored rectangle placeholders
   if you don't want to use the actual asset images:
*/
/*
images.dino = null; images.cactus = null; images.bird = null; images.meteor = null;
loadedImages = totalImagesToLoad;
*/

/* Background music */
const bgMusic = document.getElementById('bgMusic');
bgMusic.volume = 0.45;

/* UI elements */
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

/* Shop buys */
document.querySelectorAll('.buyBtn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const key = e.currentTarget.dataset.upgrade;
    handleBuy(key);
  });
});

/* ---------- Helpers for intervals / modifiers ---------- */
function getCooldownReduction() {
  // each cooldown lvl reduces cooldowns by 5%, cap 75%
  const percent = Math.min(75, upgrades.cooldown.lvl * 5);
  return percent / 100;
}

function getAdjustedCooldown(base) {
  const red = getCooldownReduction();
  return base * (1 - red);
}

function getAdjustedObstacleInterval() {
  // apply Risk & Reward: obstacle spawn rate +5% per level (faster => smaller interval)
  const increasePct = upgrades.risk.lvl * 0.05;
  return Math.max(0.35, baseObstacleInterval / (1 + increasePct));
}

function getAdjustedMoneyInterval() {
  const increasePct = upgrades.risk.lvl * 0.10; // money spawn rate increases 10% per level
  return Math.max(0.3, baseMoneyInterval / (1 + increasePct));
}

function getDiamondChance() {
  // base (0.10) + luck upgrade 1% per level, cap 25%
  const extra = Math.min(0.25 - 0.10, upgrades.luck.lvl * 0.01);
  return 0.10 + extra;
}

/* ---------- Input: touch & keyboard ---------- */
function handleJump() {
  if (!running || paused || gameOver) return;
  if (player.onGround) {
    player.vy = player.jumpForce;
    player.onGround = false;
  }
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleJump();
});
canvas.addEventListener('mousedown', (e) => {
  // allow desktop testing: click on canvas to jump
  handleJump();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    handleJump();
  }
});

/* Skill button handlers */
skillButtons.timeSlow.addEventListener('click', () => {
  useSkill('timeSlow');
});
skillButtons.shield.addEventListener('click', () => {
  useSkill('shield');
});
skillButtons.meteor.addEventListener('click', () => {
  useSkill('meteor');
});

/* Start / Resume / Restart */
startBtn.addEventListener('click', () => {
  overlay.classList.remove('visible'); overlay.classList.add('hidden');
  startGame();
  // starts music on user interaction (browsers require)
  try { bgMusic.play().catch(()=>{}); } catch (e) {}
});

resumeBtn.addEventListener('click', () => {
  closeShop();
});

restartBtn.addEventListener('click', () => {
  location.reload();
});

/* ---------- Buy logic ---------- */
function handleBuy(key) {
  if (key === 'risk') {
    const cost = upgrades.risk.baseCost * Math.pow(2, upgrades.risk.lvl);
    if (money >= cost) {
      money -= cost; upgrades.risk.lvl++; updateUI();
      nextObstacleInterval = getAdjustedObstacleInterval();
      nextMoneyInterval = getAdjustedMoneyInterval();
    } else alert('Not enough money');
  } else if (key === 'cooldown') {
    const cost = upgrades.cooldown.baseCost * Math.pow(3, upgrades.cooldown.lvl);
    if (money >= cost) {
      money -= cost; upgrades.cooldown.lvl++; updateUI();
    } else alert('Not enough money');
  } else if (key === 'luck') {
    const cost = Math.round(upgrades.luck.baseCost * Math.pow(1.5, upgrades.luck.lvl));
    if (money >= cost) {
      money -= cost; upgrades.luck.lvl++; updateUI();
    } else alert('Not enough money');
  } else if (key === 'timeslowSkill') {
    const cost = skills.timeSlow.baseCost * skills.timeSlow.lvl;
    if (money >= cost) {
      money -= cost; skills.timeSlow.lvl++; updateUI();
    } else alert('Not enough money');
  } else if (key === 'shieldSkill') {
    if (!skills.shield.unlocked) {
      if (money >= skills.shield.unlockCost) {
        money -= skills.shield.unlockCost;
        skills.shield.unlocked = true; skills.shield.lvl = 1; updateUI();
      } else alert('Not enough money to unlock Shield');
    } else {
      const cost = skills.shield.levelCost * skills.shield.lvl;
      if (money >= cost) {
        money -= cost; skills.shield.lvl++; updateUI();
      } else alert('Not enough money');
    }
  } else if (key === 'meteorSkill') {
    if (!skills.meteor.unlocked) {
      if (money >= skills.meteor.unlockCost) {
        money -= skills.meteor.unlockCost;
        skills.meteor.unlocked = true; skills.meteor.lvl = 1; updateUI();
      } else alert('Not enough money to unlock Meteor Call');
    } else {
      const cost = skills.meteor.levelCost * skills.meteor.lvl;
      if (money >= cost) {
        money -= cost; skills.meteor.lvl++; updateUI();
      } else alert('Not enough money');
    }
  }
}

/* ---------- Skill usage ---------- */
function useSkill(name) {
  if (!running || paused || gameOver) return;
  const now = elapsed;
  if (!skills[name].unlocked) { alert('Skill locked. Unlock it in the shop.'); return; }
  const scool = getAdjustedCooldown(skills[name].cooldownBase || skills[name].cooldownBase || 60);
  if (skills[name].cooldown > now) return; // still cooling
  if (name === 'timeSlow') {
    // slow percent per level
    const slowPct = skills.timeSlow.slowPerLevel * skills.timeSlow.lvl;
    const dur = 3 + skills.timeSlow.lvl * 0.5; // base duration ~3s; leveled increases - you can tweak
    skills.timeSlow.activeUntil = now + dur;
    skills.timeSlow.cooldown = now + getAdjustedCooldown(skills.timeSlow.cooldownBase);
  } else if (name === 'shield') {
    const dur = skills.shield.durationBase + 0.5 * (skills.shield.lvl - 1);
    shieldsOn(dur);
    skills.shield.cooldown = now + getAdjustedCooldown(skills.shield.cooldownBase);
  } else if (name === 'meteor') {
    const dur = skills.meteor.durationBase + 1 * (skills.meteor.lvl - 1);
    activateMeteor(dur);
    skills.meteor.cooldown = now + getAdjustedCooldown(skills.meteor.cooldownBase);
  }
  updateUI();
}

function shieldsOn(duration) {
  shieldActive = true;
  const now = elapsed;
  skills.shield.activeUntil = now + duration;
}

/* Meteor effect: stop birds & cactus for duration but money still spawns */
function activateMeteor(duration) {
  meteorActive = true;
  const now = elapsed;
  skills.meteor.activeUntil = now + duration;
  // spawn a visual meteor
  spawnMeteor();
}

/* Spawn a meteor visual (a falling meteor) */
function spawnMeteor() {
  const m = {
    type: 'meteorVis',
    x: W + 60,
    y: -100,
    w: Math.min(W, H) * 0.18,
    h: Math.min(W, H) * 0.18,
    vx: -1000,
    vy: 1200,
    life: 1.8
  };
  obstacles.push(m);
}

/* ---------- Spawning obstacles and pickups ---------- */
function spawnObstacle() {
  if (meteorActive) return; // no obstacles during meteor effect
  // decide cactus or bird
  const isBird = Math.random() < 0.45; // birds somewhat frequent
  if (isBird) {
    const birdH = Math.min(W, H) * 0.09;
    const y = Math.max(50, groundY() - player.h - (Math.random() * (player.h * 2) + player.h * 0.5)); // high enough to be jumped under or over
    obstacles.push({
      type: 'bird',
      x: W + 40,
      y,
      w: birdH,
      h: birdH,
      vx: -1
    });
  } else {
    const cW = Math.min(W, H) * 0.12;
    const y = groundY() - cW * 0.9;
    obstacles.push({
      type: 'cactus',
      x: W + 40,
      y,
      w: cW * 0.9,
      h: cW,
      vx: -1
    });
  }
}

function spawnPickup() {
  const isDiamond = (Math.random() < getDiamondChance());
  const spawnOnGround = Math.random() < 0.5;
  const size = Math.min(W, H) * (isDiamond ? 0.06 : 0.05);
  const y = spawnOnGround ? groundY() - size - 6 : groundY() - player.h - Math.random() * (player.h * 1.2) - size;
  pickups.push({
    type: isDiamond ? 'diamond' : 'gold',
    x: W + 40,
    y,
    w: size,
    h: size,
    vx: -1
  });
}

/* ---------- Update & draw loop ---------- */
function startGame() {
  resetState();
  running = true;
  paused = false;
  gameOver = false;
  lastTime = null;
  frameReq = requestAnimationFrame(loop);
  // schedule shop every 120s from start (we'll check elapsed)
}

function resetState() {
  elapsed = 0;
  lastSpeedIncrease = 0;
  gameSpeed = 1.0;
  money = 0;
  totalGold = 0;
  obstacles = [];
  pickups = [];
  player.y = groundY() - player.h;
  player.vy = 0;
  player.onGround = true;
  obstacleTimer = 0;
  moneyTimer = 0;
  nextObstacleInterval = getAdjustedObstacleInterval();
  nextMoneyInterval = getAdjustedMoneyInterval();
  upgrades.risk.lvl = upgrades.risk.lvl || 0;
  // skills: keep unlocks/purchased levels as persisted during session
}

/* main loop */
function loop(ts) {
  if (!lastTime) lastTime = ts;
  const dtMs = ts - lastTime;
  lastTime = ts;
  const dt = dtMs / 1000;

  if (!paused && running && !gameOver) {
    update(dt);
    render();
  }
  frameReq = requestAnimationFrame(loop);
}

/* Update game logic */
function update(dt) {
  elapsed += dt;

  // increase speed every 60s
  if (Math.floor(elapsed / 60) > lastSpeedIncrease) {
    lastSpeedIncrease = Math.floor(elapsed / 60);
    gameSpeed *= 1.07; // small increase
  }

  // check shop trigger every 120s exact (first at 120s)
  if (Math.floor(elapsed) > 0 && Math.floor(elapsed) % 120 === 0 && Math.floor(elapsed) !== 0) {
    // To avoid repeated triggers on many frames, check a stored flag
    if (!shopTriggeredAt || shopTriggeredAt !== Math.floor(elapsed)) {
      shopTriggeredAt = Math.floor(elapsed);
      openShop();
    }
  }

  // handle skill durations
  const now = elapsed;
  if (skills.timeSlow.activeUntil > now) {
    // apply slow effect by reducing effective speed multiplier
    // implemented during object updates by checking slow factor
  } else {
    // ensure timeSlow not active
  }
  if (skills.meteor.activeUntil > now) meteorActive = true;
  else meteorActive = false;

  if (skills.shield.activeUntil > now) shieldActive = true;
  else shieldActive = false;

  // Cooldown displays updated later

  // physics for player (jump)
  player.vy += player.gravity * dt;
  player.y += player.vy * dt;
  if (player.y + player.h >= groundY()) {
    player.y = groundY() - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  // spawn timers (obstacles & pickups)
  obstacleTimer += dt;
  moneyTimer += dt;

  // obstacle interval adjusts dynamically
  if (obstacleTimer >= nextObstacleInterval) {
    spawnObstacle();
    obstacleTimer = 0;
    nextObstacleInterval = getAdjustedObstacleInterval() * (0.85 + Math.random() * 0.5); // add variety
  }
  if (moneyTimer >= nextMoneyInterval) {
    spawnPickup();
    moneyTimer = 0;
    nextMoneyInterval = getAdjustedMoneyInterval() * (0.7 + Math.random());
  }

  // adjust velocities for all objects based on gameSpeed and timeSlow
  const slowMultiplier = (skills.timeSlow.activeUntil > now) ? (1 - (skills.timeSlow.slowPerLevel * skills.timeSlow.lvl)) : 1;
  const effectiveSpeed = baseSpeed * gameSpeed * slowMultiplier;

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    // meteor visual has its own vx/vy in pixels per second; others use vx = -1 scaled
    if (o.type === 'meteorVis') {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      if (o.life <= 0 || o.x + o.w < -200 || o.y > H + 200) obstacles.splice(i, 1);
      continue;
    }
    o.x -= effectiveSpeed * dt * ( (o.type === 'bird') ? 0.9 : 1.0 );
    if (o.x + o.w < -100) obstacles.splice(i, 1);
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.x -= effectiveSpeed * dt * 0.9;
    if (p.x + p.w < -100) pickups.splice(i, 1);
  }

  // collision detection: player rectangle vs obstacles / pickups
  const playerRect = {x: player.x, y: player.y, w: player.w, h: player.h};
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.type === 'meteorVis') continue; // visual only
    const r = {x:o.x, y:o.y, w:o.w, h:o.h};
    if (rectIntersects(playerRect, r)) {
      if (shieldActive) {
        // destroy obstacle if shield blocks it
        obstacles.splice(i,1);
        continue;
      } else {
        // death
        endGame();
        return;
      }
    }
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const r = {x:p.x, y:p.y, w:p.w, h:p.h};
    if (rectIntersects(playerRect, r)) {
      if (p.type === 'gold') {
        money += GOLD_VALUE;
      } else {
        money += DIAMOND_VALUE;
      }
      totalGold += (p.type === 'gold' ? 1 : 10);
      pickups.splice(i,1);
      updateUI();
    }
  }

  // skill cooldowns: store absolute times in seconds; update displayed remaining
  updateSkillCooldowns();

  // update HUD values
  updateHUD();

}

/* ---------- Rendering ---------- */
function render() {
  // clear
  ctx.clearRect(0,0,W,H);
  // background already via CSS on canvas; draw ground line
  ctx.fillStyle = "rgba(34,34,34,0.07)";
  const gY = groundY();
  ctx.fillRect(0, gY, W, H - gY);

  // draw player
  drawPlayer();

  // draw pickups
  for (const p of pickups) drawPickup(p);

  // draw obstacles
  for (const o of obstacles) drawObstacle(o);

  // draw shield indicator
  if (shieldActive) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#00f';
    ctx.beginPath();
    ctx.arc(player.x + player.w/2, player.y + player.h/2, player.w, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // draw time slow overlay if active
  if (skills.timeSlow.activeUntil > elapsed) {
    // a subtle overlay to indicate slow
    ctx.fillStyle = 'rgba(10,10,30,0.06)';
    ctx.fillRect(0,0,W,H);
  }
}

function drawPlayer() {
  if (images.dino && images.dino.complete && images.dino.naturalWidth !== 0) {
    ctx.drawImage(images.dino, player.x, player.y, player.w, player.h);
  } else {
    // placeholder rectangle (only used if image failed to load)
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#000';
    ctx.fillText('DINO', player.x + 8, player.y + 18);
  }
}

function drawObstacle(o) {
  if (o.type === 'meteorVis') {
    if (images.meteor && images.meteor.complete && images.meteor.naturalWidth !== 0) {
      ctx.drawImage(images.meteor, o.x, o.y, o.w, o.h);
    } else {
      ctx.fillStyle = '#ff8a00';
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
    // flash effect
    if (MeteorFlash) {}
    return;
  }

  if (o.type === 'cactus') {
    if (images.cactus && images.cactus.complete && images.cactus.naturalWidth !== 0) {
      ctx.drawImage(images.cactus, o.x, o.y, o.w, o.h);
    } else {
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
  } else if (o.type === 'bird') {
    if (images.bird && images.bird.complete && images.bird.naturalWidth !== 0) {
      ctx.drawImage(images.bird, o.x, o.y, o.w, o.h);
    } else {
      ctx.fillStyle = '#a29bfe';
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
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
    // diamond
    ctx.save();
    ctx.translate(p.x + p.w/2, p.y + p.h/2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#7fdbff';
    ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
    ctx.restore();
  }
}

/* ---------- Utility ---------- */
function rectIntersects(a,b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function endGame() {
  gameOver = true;
  running = false;
  cancelAnimationFrame(frameReq);
  // show game over modal
  finalTimeSpan.textContent = Math.floor(elapsed);
  finalMoneySpan.textContent = money;
  gameOverModal.classList.remove('hidden');
  gameOverModal.classList.add('visible');
}

/* ---------- HUD & UI updates ---------- */
function updateHUD() {
  moneyDisplay.textContent = `$${money}`;
  timeDisplay.textContent = `Time: ${Math.floor(elapsed)}s`;
  speedDisplay.textContent = `Speed: ${gameSpeed.toFixed(2)}x`;
  // update upgrade displays
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
  // Time Slow
  if (!skills.timeSlow.unlocked) {
    cdTimeSlow.textContent = 'Locked';
    skillButtons.timeSlow.classList.add('locked');
  } else {
    skillButtons.timeSlow.classList.remove('locked');
    const rem = Math.max(0, skills.timeSlow.cooldown - now);
    cdTimeSlow.textContent = rem > 0 ? `CD: ${Math.ceil(rem)}s` : (skills.timeSlow.activeUntil > now ? `Active` : 'Ready');
  }
  // Shield
  if (!skills.shield.unlocked) {
    cdShield.textContent = 'Locked';
    skillButtons.shield.classList.add('locked');
  } else {
    skillButtons.shield.classList.remove('locked');
    const rem = Math.max(0, skills.shield.cooldown - now);
    cdShield.textContent = rem > 0 ? `CD: ${Math.ceil(rem)}s` : (skills.shield.activeUntil > now ? `Active` : 'Ready');
  }
  // Meteor
  if (!skills.meteor.unlocked) {
    cdMeteor.textContent = 'Locked';
    skillButtons.meteor.classList.add('locked');
  } else {
    skillButtons.meteor.classList.remove('locked');
    const rem = Math.max(0, skills.meteor.cooldown - now);
    cdMeteor.textContent = rem > 0 ? `CD: ${Math.ceil(rem)}s` : (skills.meteor.activeUntil > now ? `Active` : 'Ready');
  }
}

/* update entire UI (call after shop buys) */
function updateUI() {
  updateHUD();
  updateSkillCooldowns();

  // lock/unlock skill buttons visually
  if (skills.shield.unlocked) skillButtons.shield.classList.remove('locked'); else skillButtons.shield.classList.add('locked');
  if (skills.meteor.unlocked) skillButtons.meteor.classList.remove('locked'); else skillButtons.meteor.classList.add('locked');
}

/* ---------- Shop open/close ---------- */
let shopTriggeredAt = null;
function openShop() {
  paused = true;
  shopModal.classList.remove('hidden'); shopModal.classList.add('visible');
}

function closeShop() {
  paused = false;
  shopModal.classList.remove('visible'); shopModal.classList.add('hidden');
  // reset obstacle & money timers a bit to avoid immediate spawn
  obstacleTimer = 0;
  moneyTimer = 0;
  nextObstacleInterval = getAdjustedObstacleInterval();
  nextMoneyInterval = getAdjustedMoneyInterval();
}

/* ---------- Misc utilities ---------- */
/* Make sure updates reflect true spawn chances etc */
function updateEverythingForUI() {
  // change diamondChance global
  // diamondChance = getDiamondChance();
}

/* initial UI */
updateUI();

/* end of script */
