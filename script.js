/* ================= CONFIG & STATE ================= */
const CONFIG = {
    GRAVITY: 0.6,
    JUMP_FORCE: -10, // Negative goes up
    GROUND_Y: 20,    // px from bottom
    BASE_SPEED: 5,
    SHOP_INTERVAL: 60, // Seconds
};

const STATE = {
    isPlaying: false,
    isPaused: false,
    isGameOver: false,
    frames: 0,
    timeAlive: 0,
    distance: 0,
    money: 0,
    speed: CONFIG.BASE_SPEED,
    gameTime: 0, // Tracks actual gameplay seconds for shop
    shopTimer: 0,
    
    // Entity Management
    obstacles: [],
    coins: [],
    
    // Dino Physics
    dinoY: CONFIG.GROUND_Y,
    dinoVy: 0,
    isJumping: false,
    isDucking: false,
    
    // Stats / Shop
    stat_risk_lvl: 0, // Costs 100 + 10*lvl
    stat_cd_lvl: 0,   // Costs 150 + 20*lvl
    stat_luck_lvl: 0, // Costs 200 + 10*lvl
    
    // Skills
    skills: {
        1: { name: "Time Slow", unlocked: true, level: 1, active: false, cd: 0, maxCd: 15, duration: 300 }, // Duration in frames
        2: { name: "Shield", unlocked: false, level: 1, active: false, cd: 0, maxCd: 20, duration: 60 },
        3: { name: "Meteor", unlocked: false, level: 1, active: false, cd: 0, maxCd: 30, duration: 60 }
    }
};

/* ================= DOM ELEMENTS ================= */
const els = {
    container: document.getElementById('game-container'),
    dino: document.getElementById('dino'),
    world: document.getElementById('world'),
    uiDist: document.getElementById('ui-dist'),
    uiTime: document.getElementById('ui-time'),
    uiMoney: document.getElementById('ui-money'),
    shop: document.getElementById('shop-overlay'),
    startScreen: document.getElementById('start-screen'),
    startTitle: document.getElementById('start-title'),
    effectOverlay: document.getElementById('effect-overlay'),
    bgm: document.getElementById('bgm'),
    sfxDead: document.getElementById('sfx-dead')
};

/* ================= INITIALIZATION ================= */
function init() {
    // Inputs
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Mobile Inputs
    els.container.addEventListener('touchstart', handleTouchStart);
    els.container.addEventListener('touchend', handleTouchEnd);
    document.getElementById('duck-btn').addEventListener('touchstart', (e) => {
        e.stopPropagation(); // Prevent jumping
        STATE.isDucking = true;
    });
    document.getElementById('duck-btn').addEventListener('touchend', (e) => {
        e.stopPropagation();
        STATE.isDucking = false;
    });

    document.getElementById('start-screen').addEventListener('click', startGame);
    document.getElementById('close-shop').addEventListener('click', closeShop);

    updateShopUI();
    gameLoop();
}

function startGame() {
    if (STATE.isPlaying) return;
    
    // Audio Context unlock
    els.bgm.play().catch(e => console.log("Audio requires interaction"));
    
    resetGame();
    STATE.isPlaying = true;
    els.startScreen.classList.add('hidden');
    lastTime = performance.now();
    requestAnimationFrame(loop);
}

function resetGame() {
    STATE.isGameOver = false;
    STATE.isPaused = false;
    STATE.timeAlive = 0;
    STATE.distance = 0;
    STATE.money = 0;
    STATE.gameTime = 0;
    STATE.speed = CONFIG.BASE_SPEED;
    STATE.dinoY = CONFIG.GROUND_Y;
    STATE.dinoVy = 0;
    STATE.obstacles = [];
    STATE.coins = [];
    STATE.frames = 0;
    
    // Clear DOM entities
    const entities = document.querySelectorAll('.obstacle, .coin, .diamond');
    entities.forEach(e => e.remove());
    
    // Reset Skills
    resetSkillCooldowns();

    // Reset Visuals
    els.dino.src = "assets/dino.png";
    els.dino.style.transform = "rotate(0deg)";
    els.dino.style.bottom = CONFIG.GROUND_Y + "px";
    els.effectOverlay.style.opacity = 0;
    els.effectOverlay.style.background = "transparent";
}

/* ================= GAME LOOP ================= */
let lastTime = 0;
function loop(timestamp) {
    if (!STATE.isPlaying) return;
    
    const dt = timestamp - lastTime;
    
    if (!STATE.isPaused && !STATE.isGameOver) {
        if (dt > 16) { // Cap at ~60fps logic
            update();
            draw();
            lastTime = timestamp;
        }
    }
    
    requestAnimationFrame(loop);
}

function update() {
    STATE.frames++;
    
    // Time & Distance
    if (STATE.frames % 60 === 0) {
        STATE.timeAlive++;
        STATE.gameTime++;
        
        // Shop Trigger
        if (STATE.gameTime > 0 && STATE.gameTime % CONFIG.SHOP_INTERVAL === 0) {
            openShop();
        }
    }
    STATE.distance += (STATE.speed / 10);
    
    // Physics
    applyGravity();
    handleSkills();
    moveEntities();
    spawnManager();
    checkCollisions();
    
    // HUD
    els.uiDist.innerText = Math.floor(STATE.distance);
    els.uiTime.innerText = STATE.timeAlive;
    els.uiMoney.innerText = STATE.money;
}

/* ================= PHYSICS & MECHANICS ================= */
function applyGravity() {
    // Jump Logic
    if (STATE.dinoY > CONFIG.GROUND_Y || STATE.isJumping) {
        STATE.dinoY += STATE.dinoVy;
        STATE.dinoVy += CONFIG.GRAVITY;
    }
    
    // Floor Collision
    if (STATE.dinoY <= CONFIG.GROUND_Y) {
        STATE.dinoY = CONFIG.GROUND_Y;
        STATE.dinoVy = 0;
        STATE.isJumping = false;
    }

    // Ducking Visual
    if (STATE.isDucking) {
        els.dino.style.height = "30px"; // Visual duck
    } else {
        els.dino.style.height = "60px";
    }
}

function spawnManager() {
    // Risk Reward Stats
    const spawnRateMod = 1 + (STATE.stat_risk_lvl * 0.10); // +10% money spawn
    const obsSpeedMod = 1 + (STATE.stat_risk_lvl * 0.05); // +5% speed

    // Obstacle Spawning
    // Base chance per frame approx 1-2%
    if (Math.random() < 0.015) {
        if (STATE.obstacles.length === 0 || 
           (800 - STATE.obstacles[STATE.obstacles.length-1].x > 250)) { // Min distance
            spawnObstacle(obsSpeedMod);
        }
    }

    // Coin Spawning
    if (Math.random() < (0.01 * spawnRateMod)) {
        spawnCoin();
    }
}

function spawnObstacle(speedMod) {
    const type = Math.random() > 0.7 ? 'bird' : 'cactus';
    const el = document.createElement('img');
    el.className = `obstacle ${type}`;
    el.src = type === 'bird' ? 'assets/bird.png' : 'assets/cactus.png';
    els.world.appendChild(el);

    STATE.obstacles.push({
        el: el,
        x: 800, // Start off screen right
        y: type === 'bird' ? (Math.random() > 0.5 ? 20 : 60) : CONFIG.GROUND_Y,
        w: type === 'bird' ? 40 : 30,
        h: type === 'bird' ? 30 : 50,
        type: type,
        speed: STATE.speed * speedMod
    });
}

function spawnCoin() {
    const isDiamond = Math.random() < (0.1 + (STATE.stat_luck_lvl * 0.05)); // Luck Stat
    const el = document.createElement('div');
    el.className = isDiamond ? 'diamond' : 'coin';
    el.innerText = isDiamond ? '20' : '$';
    els.world.appendChild(el);

    STATE.coins.push({
        el: el,
        x: 800,
        y: Math.random() * 100 + 40, // Air spawn
        w: 30,
        h: 30,
        value: isDiamond ? 20 : 1
    });
}

function moveEntities() {
    // Obstacles
    for (let i = STATE.obstacles.length - 1; i >= 0; i--) {
        let obs = STATE.obstacles[i];
        
        // Skill 1: Time Slow
        let moveSpeed = obs.speed;
        if (STATE.skills[1].active) {
            let slowAmt = 0.05 * STATE.skills[1].level; // 5% per level
            moveSpeed = moveSpeed * (1 - slowAmt);
        }

        obs.x -= moveSpeed;
        
        if (obs.x < -50) {
            obs.el.remove();
            STATE.obstacles.splice(i, 1);
        }
    }

    // Coins
    for (let i = STATE.coins.length - 1; i >= 0; i--) {
        let c = STATE.coins[i];
        c.x -= STATE.speed; // Coins move with world speed
        if (c.x < -50) {
            c.el.remove();
            STATE.coins.splice(i, 1);
        }
    }
}

function checkCollisions() {
    // Dino Hitbox
    const dinoRect = {
        x: 50 + 10, // Padding
        y: STATE.dinoY,
        w: 40,
        h: STATE.isDucking ? 30 : 60
    };

    // Obstacles
    if (!STATE.skills[2].active && !STATE.skills[3].active) { // Not Invincible
        STATE.obstacles.forEach(obs => {
            if (rectIntersect(dinoRect, {x: obs.x, y: obs.y, w: obs.w, h: obs.h})) {
                gameOver();
            }
        });
    }

    // Coins
    for (let i = STATE.coins.length - 1; i >= 0; i--) {
        let c = STATE.coins[i];
        // Visual hitbox for coin is slightly larger
        if (rectIntersect(dinoRect, {x: c.x, y: c.y, w: c.w, h: c.h})) {
            STATE.money += c.value;
            c.el.remove();
            STATE.coins.splice(i, 1);
        }
    }
}

function rectIntersect(r1, r2) {
    return !(r2.x > r1.x + r1.w || 
             r2.x + r2.w < r1.x || 
             r2.y > r1.y + r1.h || 
             r2.y + r2.h < r1.y);
}

function draw() {
    // Draw Dino
    els.dino.style.bottom = STATE.dinoY + "px";

    // Draw Obstacles
    STATE.obstacles.forEach(obs => {
        obs.el.style.left = obs.x + "px";
        obs.el.style.bottom = obs.y + "px";
    });

    // Draw Coins
    STATE.coins.forEach(c => {
        c.el.style.left = c.x + "px";
        c.el.style.bottom = c.y + "px";
    });
}

function gameOver() {
    STATE.isPlaying = false;
    STATE.isGameOver = true;
    els.bgm.pause();
    els.sfxDead.play();
    els.startTitle.innerText = "GAME OVER";
    els.startScreen.classList.remove('hidden');
}

/* ================= INPUTS ================= */
function handleKeyDown(e) {
    if (STATE.isShopOpen) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') jump();
    if (e.code === 'ArrowDown') STATE.isDucking = true;
    if (e.code === 'Digit1') useSkill(1);
    if (e.code === 'Digit2') useSkill(2);
    if (e.code === 'Digit3') useSkill(3);
}

function handleKeyUp(e) {
    if (e.code === 'ArrowDown') STATE.isDucking = false;
}

function handleTouchStart(e) {
    if (STATE.isShopOpen) return;
    // Simple logic: tap top half jump, bottom half? No, button for duck provided.
    jump();
}
function handleTouchEnd(e) {}

function jump() {
    if (STATE.dinoY === CONFIG.GROUND_Y) {
        STATE.dinoVy = CONFIG.JUMP_FORCE;
        STATE.isJumping = true;
    }
}

/* ================= SKILLS SYSTEM ================= */
function useSkill(id) {
    const skill = STATE.skills[id];
    if (!skill.unlocked || skill.active || skill.cd > 0) return;

    skill.active = true;
    skill.cd = skill.maxCd;
    
    // Apply CD Reduction Stat
    const cdReduction = Math.min(0.75, STATE.stat_cd_lvl * 0.05);
    skill.cd = skill.cd * (1 - cdReduction);

    activateSkillEffect(id);
    startCooldownUI(id, skill.cd);
}

function activateSkillEffect(id) {
    const skill = STATE.skills[id];
    let durationSec = 0;

    if (id === 1) {
        // Slow
        els.effectOverlay.style.background = "rgba(100, 255, 100, 0.2)";
        els.effectOverlay.style.opacity = 1;
        setTimeout(() => {
            skill.active = false;
            els.effectOverlay.style.opacity = 0;
        }, 5000); // 5 sec visual duration, logic handled in moveEntities
    } 
    else if (id === 2) {
        // Shield
        durationSec = 1 + skill.level;
        els.dino.style.filter = "drop-shadow(0 0 10px cyan)";
        setTimeout(() => {
            skill.active = false;
            els.dino.style.filter = "none";
        }, durationSec * 1000);
    } 
    else if (id === 3) {
        // Meteor
        durationSec = 1 + skill.level;
        const speedBoost = 0.5 + (0.1 * skill.level);
        
        els.dino.src = "assets/metor.png";
        const oldSpeed = STATE.speed;
        STATE.speed = STATE.speed * (1 + speedBoost);
        
        setTimeout(() => {
            skill.active = false;
            els.dino.src = "assets/dino.png";
            STATE.speed = oldSpeed;
        }, durationSec * 1000);
    }
}

function startCooldownUI(id, seconds) {
    const btn = document.getElementById(`btn-skill-${id}`);
    const overlay = btn.querySelector('.cooldown-overlay');
    overlay.style.transition = `height ${seconds}s linear`;
    overlay.style.height = '100%';
    
    // Force reflow
    void overlay.offsetWidth; 
    
    overlay.style.height = '0%';
    
    setTimeout(() => {
        STATE.skills[id].cd = 0;
    }, seconds * 1000);
}

function handleSkills() {
    // Logic mostly handled in activation or update loop, 
    // but cooldown timers are automated via CSS/Timeouts for simplicity here
}

function resetSkillCooldowns() {
    for(let k in STATE.skills) {
        STATE.skills[k].cd = 0;
        STATE.skills[k].active = false;
        const overlay = document.getElementById(`btn-skill-${k}`).querySelector('.cooldown-overlay');
        overlay.style.transition = 'none';
        overlay.style.height = '0%';
    }
}

/* ================= SHOP SYSTEM ================= */
function openShop() {
    STATE.isPaused = true;
    STATE.isShopOpen = true;
    els.shop.classList.remove('hidden');
    els.bgm.pause();
    updateShopUI();
}

function closeShop() {
    STATE.isPaused = false;
    STATE.isShopOpen = false;
    els.shop.classList.add('hidden');
    els.bgm.play();
    lastTime = performance.now(); // Prevent large delta jump
}

function updateShopUI() {
    // Update button texts and disabled states
    const costRisk = 100 + (STATE.stat_risk_lvl * 10);
    document.getElementById('buy-risk').innerText = `Buy $${costRisk}`;
    
    const costCd = 150 + (STATE.stat_cd_lvl * 20);
    const cdBtn = document.getElementById('buy-cd');
    cdBtn.innerText = STATE.stat_cd_lvl >= 15 ? "MAX" : `Buy $${costCd}`;
    if (STATE.stat_cd_lvl >= 15) cdBtn.disabled = true;

    const costLuck = 200 + (STATE.stat_luck_lvl * 10);
    const luckBtn = document.getElementById('buy-luck');
    luckBtn.innerText = STATE.stat_luck_lvl >= 10 ? "MAX" : `Buy $${costLuck}`; // 50% max
    if (STATE.stat_luck_lvl >= 10) luckBtn.disabled = true;

    // Skills
    const s1 = STATE.skills[1];
    document.getElementById('upg-skill-1').innerText = `Lvl ${s1.level+1} ($50)`;

    const s2 = STATE.skills[2];
    document.getElementById('upg-skill-2').innerText = s2.unlocked ? `Lvl ${s2.level+1} ($100)` : `Unlock ($200)`;

    const s3 = STATE.skills[3];
    document.getElementById('upg-skill-3').innerText = s3.unlocked ? `Lvl ${s3.level+1} ($200)` : `Unlock ($300)`;
}

window.buyStat = function(type) {
    if (type === 'risk') {
        const cost = 100 + (STATE.stat_risk_lvl * 10);
        if (STATE.money >= cost) {
            STATE.money -= cost;
            STATE.stat_risk_lvl++;
        }
    } else if (type === 'cd') {
        if (STATE.stat_cd_lvl >= 15) return;
        const cost = 150 + (STATE.stat_cd_lvl * 20);
        if (STATE.money >= cost) {
            STATE.money -= cost;
            STATE.stat_cd_lvl++;
        }
    } else if (type === 'luck') {
        if (STATE.stat_luck_lvl >= 10) return;
        const cost = 200 + (STATE.stat_luck_lvl * 10);
        if (STATE.money >= cost) {
            STATE.money -= cost;
            STATE.stat_luck_lvl++;
        }
    }
    updateShopUI();
    els.uiMoney.innerText = STATE.money;
};

window.upgradeSkill = function(id) {
    const skill = STATE.skills[id];
    let cost = 0;

    if (id === 1) {
        cost = 50;
        if (STATE.money >= cost) {
            STATE.money -= cost;
            skill.level++;
        }
    } 
    else if (id === 2) {
        cost = skill.unlocked ? 100 : 200;
        if (STATE.money >= cost) {
            STATE.money -= cost;
            if (!skill.unlocked) {
                skill.unlocked = true;
                document.getElementById('btn-skill-2').classList.remove('locked');
            } else {
                skill.level++;
            }
        }
    } 
    else if (id === 3) {
        cost = skill.unlocked ? 200 : 300;
        if (STATE.money >= cost) {
            STATE.money -= cost;
            if (!skill.unlocked) {
                skill.unlocked = true;
                document.getElementById('btn-skill-3').classList.remove('locked');
            } else {
                skill.level++;
            }
        }
    }
    updateShopUI();
    els.uiMoney.innerText = STATE.money;
};

// Start
init();