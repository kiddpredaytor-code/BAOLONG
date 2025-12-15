/* ================= CONFIG & STATE ================= */
const CONFIG = {
    // PHYSICS: Positive goes UP, Negative goes DOWN
    GRAVITY: -0.8,     
    JUMP_FORCE: 15,    
    
    // VISUALS
    VISUAL_OFFSET: 120, // Lifts the game 120px from bottom (fixes "too low" issue)
    
    BASE_SPEED: 6,
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
    gameTime: 0, 
    shopTimer: 0,
    
    // Entity Management
    obstacles: [],
    coins: [],
    
    // Dino Physics
    dinoY: 0,
    dinoVy: 0,
    isJumping: false,
    isDucking: false, // Core state for ducking
    
    // Stats
    stat_risk_lvl: 0, 
    stat_cd_lvl: 0,   
    stat_luck_lvl: 0, 
    
    // Skills
    skills: {
        1: { name: "Time Slow", unlocked: true, level: 1, active: false, cd: 0, maxCd: 15 },
        2: { name: "Shield", unlocked: false, level: 1, active: false, cd: 0, maxCd: 20 },
        3: { name: "Meteor", unlocked: false, level: 1, active: false, cd: 0, maxCd: 30 }
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
    // Keyboard Inputs
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Mobile Inputs: JUMP on general tap (outside controls)
    els.container.addEventListener('touchstart', handleTouchStart);
    
    // Mobile Inputs: DUCK Button
    const duckBtn = document.getElementById('duck-btn');
    duckBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation(); 
        STATE.isDucking = true; // Sets the state when held
    });
    duckBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        STATE.isDucking = false; // Resets the state when touch released
    });

    document.getElementById('start-screen').addEventListener('click', startGame);
    document.getElementById('close-shop').addEventListener('click', closeShop);

    updateShopUI();
    gameLoop();
}

function startGame() {
    if (STATE.isPlaying) return;
    
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
    STATE.dinoY = 0;
    STATE.dinoVy = 0;
    STATE.obstacles = [];
    STATE.coins = [];
    STATE.frames = 0;
    
    const entities = document.querySelectorAll('.obstacle, .coin, .diamond');
    entities.forEach(e => e.remove());
    
    resetSkillCooldowns();

    els.dino.src = "assets/dino.png";
    els.dino.style.transform = "rotate(0deg)";
    els.dino.style.filter = "none";
    els.effectOverlay.style.opacity = 0;
    
    draw();
}

/* ================= GAME LOOP ================= */
let lastTime = 0;
function loop(timestamp) {
    if (!STATE.isPlaying) return;
    
    const dt = timestamp - lastTime;
    
    if (!STATE.isPaused && !STATE.isGameOver) {
        if (dt > 16) { 
            update();
            draw();
            lastTime = timestamp;
        }
    }
    requestAnimationFrame(loop);
}

function update() {
    STATE.frames++;
    
    if (STATE.frames % 60 === 0) {
        STATE.timeAlive++;
        STATE.gameTime++;
        if (STATE.gameTime > 0 && STATE.gameTime % CONFIG.SHOP_INTERVAL === 0) {
            openShop();
        }
    }
    STATE.distance += (STATE.speed / 10);
    
    applyPhysics();
    moveEntities();
    spawnManager();
    checkCollisions();
    
    els.uiDist.innerText = Math.floor(STATE.distance);
    els.uiTime.innerText = STATE.timeAlive;
    els.uiMoney.innerText = STATE.money;
}

/* ================= PHYSICS & MECHANICS ================= */
function applyPhysics() {
    // Apply Velocity
    STATE.dinoY += STATE.dinoVy;
    
    // Gravity (Only if in air)
    if (STATE.dinoY > 0 || STATE.dinoVy > 0) {
        STATE.dinoVy += CONFIG.GRAVITY;
    }
    
    // Floor Collision
    if (STATE.dinoY <= 0) {
        STATE.dinoY = 0;
        STATE.dinoVy = 0;
        STATE.isJumping = false;
    }

    // Ducking Hitbox Visual (This line toggles the dino size: 60px default, 30px ducking)
    els.dino.style.height = STATE.isDucking ? "30px" : "60px";
}

function spawnManager() {
    const spawnRateMod = 1 + (STATE.stat_risk_lvl * 0.10); 
    const obsSpeedMod = 1 + (STATE.stat_risk_lvl * 0.05);

    // Obstacles
    if (Math.random() < 0.015) {
        if (STATE.obstacles.length === 0 || 
           (800 - STATE.obstacles[STATE.obstacles.length-1].x > 300)) { 
            spawnObstacle(obsSpeedMod);
        }
    }

    // Coins
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

    // Bird Heights: Low Bird (must jump): 10px; High Bird (must duck): 50px
    let obsY = 0;
    if (type === 'bird') {
        obsY = Math.random() > 0.5 ? 10 : 50;
    }

    STATE.obstacles.push({
        el: el,
        x: 900,
        y: obsY,
        w: type === 'bird' ? 40 : 30,
        h: type === 'bird' ? 30 : 50,
        type: type,
        speed: STATE.speed * speedMod
    });
}

function spawnCoin() {
    const isDiamond = Math.random() < (0.1 + (STATE.stat_luck_lvl * 0.05));
    const el = document.createElement('div');
    el.className = isDiamond ? 'diamond' : 'coin';
    el.innerText = isDiamond ? '20' : '$';
    els.world.appendChild(el);

    STATE.coins.push({
        el: el,
        x: 900,
        y: Math.random() * 100 + 40,
        w: 30,
        h: 30,
        value: isDiamond ? 20 : 1
    });
}

function moveEntities() {
    // Obstacles
    for (let i = STATE.obstacles.length - 1; i >= 0; i--) {
        let obs = STATE.obstacles[i];
        
        let moveSpeed = obs.speed;
        if (STATE.skills[1].active) { // Skill 1: Time Slow
            let slowAmt = 0.05 * STATE.skills[1].level; 
            moveSpeed = moveSpeed * (1 - slowAmt);
        }

        obs.x -= moveSpeed;
        
        if (obs.x < -100) {
            obs.el.remove();
            STATE.obstacles.splice(i, 1);
        }
    }

    // Coins
    for (let i = STATE.coins.length - 1; i >= 0; i--) {
        let c = STATE.coins[i];
        c.x -= STATE.speed;
        if (c.x < -100) {
            c.el.remove();
            STATE.coins.splice(i, 1);
        }
    }
}

function checkCollisions() {
    // Dino Hitbox (Relative to game world 0, not screen)
    const dinoRect = {
        x: 50 + 10,
        y: STATE.dinoY,
        w: 40,
        // DUCKING COLLISION: height changes when ducking
        h: STATE.isDucking ? 30 : 60
    };

    // Obstacles
    if (!STATE.skills[2].active && !STATE.skills[3].active) {
        STATE.obstacles.forEach(obs => {
            if (rectIntersect(dinoRect, obs)) {
                gameOver();
            }
        });
    }

    // Coins
    for (let i = STATE.coins.length - 1; i >= 0; i--) {
        let c = STATE.coins[i];
        if (rectIntersect(dinoRect, c)) {
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
    // Apply Visual Offset (Lifting the game up)
    const offset = CONFIG.VISUAL_OFFSET;

    els.dino.style.bottom = (STATE.dinoY + offset) + "px";

    STATE.obstacles.forEach(obs => {
        obs.el.style.left = obs.x + "px";
        obs.el.style.bottom = (obs.y + offset) + "px";
    });

    STATE.coins.forEach(c => {
        c.el.style.left = c.x + "px";
        c.el.style.bottom = (c.y + offset) + "px";
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
    
    if (e.code === 'ArrowDown') {
        STATE.isDucking = true; // Set duck state on key down
    }
    
    if (e.code === 'Digit1') useSkill(1);
    if (e.code === 'Digit2') useSkill(2);
    if (e.code === 'Digit3') useSkill(3);
}

function handleKeyUp(e) {
    if (e.code === 'ArrowDown') STATE.isDucking = false; // Reset duck state on key up
}

function handleTouchStart(e) {
    // Ignore taps on the skill and duck buttons
    if (STATE.isShopOpen || e.target.closest('#skills-container') || e.target.id === 'duck-btn') return;
    jump();
}

function jump() {
    // Can only jump if near ground (tolerance 5px)
    if (Math.abs(STATE.dinoY) < 5) {
        STATE.dinoVy = CONFIG.JUMP_FORCE;
        STATE.isJumping = true;
    }
}

/* ================= SKILLS & SHOP ================= */
function useSkill(id) {
    const skill = STATE.skills[id];
    if (!skill.unlocked || skill.active || skill.cd > 0) return;

    skill.active = true;
    skill.cd = skill.maxCd * (1 - Math.min(0.75, STATE.stat_cd_lvl * 0.05));

    activateSkillEffect(id);
    startCooldownUI(id, skill.cd);
}

function activateSkillEffect(id) {
    const skill = STATE.skills[id];
    let durationSec = 1 + skill.level;

    if (id === 1) { // Slow
        els.effectOverlay.style.background = "rgba(100, 255, 100, 0.2)";
        els.effectOverlay.style.opacity = 1;
        setTimeout(() => {
            skill.active = false;
            els.effectOverlay.style.opacity = 0;
        }, 5000); 
    } 
    else if (id === 2) { // Shield
        els.dino.style.filter = "drop-shadow(0 0 10px cyan)";
        setTimeout(() => {
            skill.active = false;
            els.dino.style.filter = "none";
        }, durationSec * 1000);
    } 
    else if (id === 3) { // Meteor
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
    void overlay.offsetWidth; 
    overlay.style.height = '0%';
    
    setTimeout(() => { STATE.skills[id].cd = 0; }, seconds * 1000);
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
    lastTime = performance.now(); 
}

function updateShopUI() {
    const costRisk = 100 + (STATE.stat_risk_lvl * 10);
    document.getElementById('buy-risk').innerText = `Buy $${costRisk}`;
    
    const costCd = 150 + (STATE.stat_cd_lvl * 20);
    const cdBtn = document.getElementById('buy-cd');
    cdBtn.innerText = STATE.stat_cd_lvl >= 15 ? "MAX" : `Buy $${costCd}`;
    cdBtn.disabled = STATE.stat_cd_lvl >= 15;

    const costLuck = 200 + (STATE.stat_luck_lvl * 10);
    const luckBtn = document.getElementById('buy-luck');
    luckBtn.innerText = STATE.stat_luck_lvl >= 10 ? "MAX" : `Buy $${costLuck}`;
    luckBtn.disabled = STATE.stat_luck_lvl >= 10;

    const s1 = STATE.skills[1];
    document.getElementById('upg-skill-1').innerText = `Lvl ${s1.level+1} ($50)`;

    const s2 = STATE.skills[2];
    document.getElementById('upg-skill-2').innerText = s2.unlocked ? `Lvl ${s2.level+1} ($100)` : `Unlock ($200)`;

    const s3 = STATE.skills[3];
    document.getElementById('upg-skill-3').innerText = s3.unlocked ? `Lvl ${s3.level+1} ($200)` : `Unlock ($300)`;
}

window.buyStat = function(type) {
    let cost = 0;
    if (type === 'risk') {
        cost = 100 + (STATE.stat_risk_lvl * 10);
        if (STATE.money >= cost) { STATE.money -= cost; STATE.stat_risk_lvl++; }
    } else if (type === 'cd') {
        if (STATE.stat_cd_lvl >= 15) return;
        cost = 150 + (STATE.stat_cd_lvl * 20);
        if (STATE.money >= cost) { STATE.money -= cost; STATE.stat_cd_lvl++; }
    } else if (type === 'luck') {
        if (STATE.stat_luck_lvl >= 10) return;
        cost = 200 + (STATE.stat_luck_lvl * 10);
        if (STATE.money >= cost) { STATE.money -= cost; STATE.stat_luck_lvl++; }
    }
    updateShopUI();
    els.uiMoney.innerText = STATE.money;
};

window.upgradeSkill = function(id) {
    const skill = STATE.skills[id];
    let cost = 0;

    if (id === 1) cost = 50;
    else if (id === 2) cost = skill.unlocked ? 100 : 200;
    else if (id === 3) cost = skill.unlocked ? 200 : 300;

    if (STATE.money >= cost) {
        STATE.money -= cost;
        if ((id === 2 || id === 3) && !skill.unlocked) {
            skill.unlocked = true;
            document.getElementById(`btn-skill-${id}`).classList.remove('locked');
        } else {
            skill.level++;
        }
    }
    updateShopUI();
    els.uiMoney.innerText = STATE.money;
};

init();