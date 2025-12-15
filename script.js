// --- Game State Variables ---
const gameState = {
    isGameRunning: false,
    isPaused: false,
    isGameOver: false,
    score: 0,
    money: 0,
    gameSpeed: 6, // Initial pixels per frame
    speedMultiplier: 1,
    timeElapsed: 0, // In seconds, for shop and speed increase
    lastShopTime: 0,
    lastSpeedIncrease: 0,
    isInvincible: false,
    isMeteorActive: false,
    isSlowActive: false,
    slowdownFactor: 1, // 1 is normal speed. >1 is slow.
};

// --- DOM Elements ---
const dom = {
    gameScreen: document.getElementById('game-screen'),
    player: document.getElementById('player'),
    gameObjects: document.getElementById('game-objects'),
    scoreDisplay: document.getElementById('score-display'),
    moneyDisplay: document.getElementById('money-display'),
    titleScreen: document.getElementById('title-screen'),
    gameOverScreen: document.getElementById('game-over-screen'),
    shopScreen: document.getElementById('shop-screen'),
    shopMoney: document.getElementById('shop-money'),
    upgradesList: document.getElementById('upgrades-list'),
    skillsList: document.getElementById('skills-list'),
    music: document.getElementById('game-music'),
    meteorFlash: document.getElementById('meteor-flash'),

    // Buttons for Listener Check
    startGameBtn: document.getElementById('start-game-btn'),
    restartGameBtn: document.getElementById('restart-game-btn'),
    resumeGameBtn: document.getElementById('resume-game-btn'),
};

// --- Player/Jump Constants ---
const playerSize = 0.08 * window.innerHeight; // 8vh
const groundHeight = 0.20 * window.innerHeight; // 20vh
const jumpVelocity = 25; // Initial upward velocity
const gravity = 1.5;
let playerY = 0; // Current Y offset from ground (in px)
let playerVy = 0; // Vertical velocity (in px/frame)

// --- Game Loop and Object Management ---
let gameLoopInterval;
let spawnTimer = 0; 
let spawnRate = 90; // Frames between object spawns (lower is faster)
let lastFrameTime = performance.now();

// --- Upgrade/Skill Data (Levels, Costs, Effects) ---
const UPGRADES = {
    riskReward: { level: 0, costBase: 100, costMult: 2, effect: { obstacleRate: 0.05, moneyRate: 0.1 } },
    cooldownReduction: { level: 0, costBase: 150, costMult: 3, effect: { reduction: 0.05, maxCap: 0.75 } },
    luck: { level: 0, costBase: 50, costMult: 1.5, effect: { diamondChance: 0.01, maxCap: 0.25 } }
};

const SKILLS = {
    slow: { 
        id: 'slow', 
        name: 'Time Slow', 
        level: 1, 
        unlocked: true,
        costBase: 100, 
        costIncrement: 100, 
        cooldown: 60, 
        currentCooldown: 0,
        effect: { slow: 0.10, duration: 5 }
    },
    shield: { 
        id: 'shield', 
        name: 'Shield', 
        level: 0, 
        unlocked: false, 
        unlockCost: 150,
        costBase: 150, 
        costIncrement: 150, 
        cooldown: 60, 
        currentCooldown: 0,
        effect: { baseDuration: 1, durationIncrement: 0.5 } 
    },
    meteor: { 
        id: 'meteor', 
        name: 'Meteor Call', 
        level: 0, 
        unlocked: false, 
        unlockCost: 500,
        costBase: 150, 
        costIncrement: 150, 
        cooldown: 120, 
        currentCooldown: 0,
        effect: { baseDuration: 5, durationIncrement: 1 } 
    }
};

// --- Initialization ---

function initGame() {
    setupEventListeners();
    dom.player.style.width = playerSize + 'px';
    dom.player.style.height = playerSize + 'px';
    resetGame();
}

function setupEventListeners() {
    // CRITICAL LISTENER CHECK: Using the DOM element directly
    if (dom.startGameBtn) dom.startGameBtn.addEventListener('click', startGame);
    if (dom.restartGameBtn) dom.restartGameBtn.addEventListener('click', startGame);
    if (dom.resumeGameBtn) dom.resumeGameBtn.addEventListener('click', resumeGame);
    
    // Jump Listeners
    dom.gameScreen.addEventListener('click', handleJump);
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) {
            handleJump();
        }
    });

    // Skill Buttons
    document.getElementById('skill-slow').addEventListener('click', () => activateSkill('slow'));
    document.getElementById('skill-shield').addEventListener('click', () => activateSkill('shield'));
    document.getElementById('skill-meteor').addEventListener('click', () => activateSkill('meteor'));
}

function resetGame() {
    gameState.score = 0;
    gameState.money = 0;
    gameState.gameSpeed = 6;
    gameState.speedMultiplier = 1;
    gameState.timeElapsed = 0;
    gameState.lastShopTime = 0;
    gameState.lastSpeedIncrease = 0;
    gameState.isGameOver = false;
    gameState.isInvincible = false;
    gameState.isMeteorActive = false;
    gameState.isSlowActive = false;
    gameState.slowdownFactor = 1;
    spawnRate = 90;
    playerY = 0;
    playerVy = 0;
    
    dom.gameObjects.innerHTML = '';
    
    for(const skillId in SKILLS) {
        SKILLS[skillId].currentCooldown = 0;
    }

    updateUI();
    updatePlayerPosition();
    updateSkillButtons();
}

// --- CRITICAL FUNCTION: startGame ---
function startGame() {
    resetGame();
    gameState.isGameRunning = true;
    
    // CRITICAL: Ensure all overlay screens are removed and game screen is implicitly active
    if (dom.titleScreen) dom.titleScreen.classList.remove('active');
    if (dom.gameOverScreen) dom.gameOverScreen.classList.remove('active');
    if (dom.shopScreen) dom.shopScreen.classList.remove('active'); 
    
    // Play music and start the loop
    dom.music.play().catch(e => console.warn("Music auto-play prevented:", e));
    lastFrameTime = performance.now();
    gameLoopInterval = requestAnimationFrame(gameLoop);
}

// --- Game Loop ---

function gameLoop(timestamp) {
    if (gameState.isPaused || gameState.isGameOver) {
        cancelAnimationFrame(gameLoopInterval);
        return;
    }

    const deltaTime = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    const effectiveSpeed = gameState.gameSpeed * gameState.speedMultiplier / gameState.slowdownFactor;

    updatePlayer(deltaTime);
    moveObjects(effectiveSpeed);
    spawnObjects(deltaTime, effectiveSpeed);
    checkCollision();
    updateGameStats(deltaTime);
    updateSkillCooldowns(deltaTime);

    if (gameState.timeElapsed - gameState.lastShopTime >= 120) {
        pauseGameForShop();
    }
    
    if (gameState.timeElapsed - gameState.lastSpeedIncrease >= 60) {
        increaseGameSpeed();
    }

    updateUI();
    gameLoopInterval = requestAnimationFrame(gameLoop);
}

// --- Player Logic ---

function handleJump() {
    if (!gameState.isGameRunning || gameState.isPaused || gameState.isGameOver || playerY > 0) {
        return;
    }
    playerVy = jumpVelocity;
}

function updatePlayer(deltaTime) {
    if (playerY > 0 || playerVy > 0) {
        playerVy -= gravity; 
        playerY += playerVy;
        
        if (playerY <= 0) {
            playerY = 0;
            playerVy = 0;
        }
        updatePlayerPosition();
    }
}

function updatePlayerPosition() {
    dom.player.style.transform = `translateY(-${playerY}px)`;
}

// --- Object Spawning & Movement ---

function spawnObjects(deltaTime, effectiveSpeed) {
    const frameApproximation = deltaTime * 60; 
    spawnTimer += frameApproximation;

    const rrBonus = UPGRADES.riskReward.level * UPGRADES.riskReward.effect.obstacleRate;
    const dynamicSpawnRate = spawnRate / (1 + rrBonus); 

    if (gameState.isMeteorActive) return;

    if (spawnTimer >= dynamicSpawnRate) {
        spawnTimer = 0;

        const isObstacle = Math.random() < 0.7; 
        
        let newObject;
        if (isObstacle) {
            newObject = Math.random() < 0.5 ? createCactus() : createBird();
        } else {
            const luckBonus = UPGRADES.luck.level * UPGRADES.luck.effect.diamondChance;
            const diamondChance = Math.min(0.1 + luckBonus, 0.25);
            newObject = Math.random() < diamondChance ? createDiamond() : createCoin();
        }

        dom.gameObjects.appendChild(newObject);
    }
}

function createCactus() {
    const cactus = document.createElement('div');
    cactus.className = 'game-object obstacle cactus';
    cactus.dataset.type = 'obstacle';
    return cactus;
}

function createBird() {
    const bird = document.createElement('div');
    bird.className = 'game-object obstacle bird';
    bird.dataset.type = 'obstacle';
    
    const birdY = groundHeight + playerSize * (1.5 + Math.random() * 0.5); 
    bird.style.bottom = birdY + 'px';
    return bird;
}

function createCoin() {
    const coin = document.createElement('div');
    coin.className = 'game-object currency coin';
    coin.dataset.value = '1';
    
    let coinY = Math.random() < 0.5 
        ? groundHeight
        : groundHeight + playerSize * (0.5 + Math.random() * 1.5);
    coin.style.bottom = coinY + 'px';
    return coin;
}

function createDiamond() {
    const diamond = document.createElement('div');
    diamond.className = 'game-object currency diamond';
    diamond.dataset.value = '10';
    
    const diamondY = groundHeight + playerSize * (1 + Math.random() * 2);
    diamond.style.bottom = diamondY + 'px';
    return diamond;
}


function moveObjects(effectiveSpeed) {
    const objects = dom.gameObjects.children;
    const gameScreenW = dom.gameScreen.offsetWidth;

    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        
        let currentX = parseFloat(obj.style.right) || 0;
        
        currentX += effectiveSpeed;
        obj.style.right = currentX + 'px';

        if (currentX > gameScreenW) {
            obj.remove();
        }
    }
}

// --- Collision Detection ---

function checkCollision() {
    if (gameState.isInvincible) return;

    const playerRect = dom.player.getBoundingClientRect();
    // Using a slightly smaller hitbox for fairness, as defined in previous code
    const playerHitBox = {
        left: playerRect.left + playerRect.width * 0.1,
        right: playerRect.right - playerRect.width * 0.1,
        top: playerRect.top + playerRect.height * 0.1,
        bottom: playerRect.bottom - playerRect.height * 0.1,
    };

    const objects = dom.gameObjects.children;

    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        const objRect = obj.getBoundingClientRect();

        const isColliding = (
            playerHitBox.left < objRect.right &&
            playerHitBox.right > objRect.left &&
            playerHitBox.top < objRect.bottom &&
            playerHitBox.bottom > objRect.top
        );

        if (isColliding) {
            if (obj.dataset.type === 'obstacle') {
                gameOver();
                return;
            } else if (obj.dataset.value) {
                gameState.money += parseInt(obj.dataset.value);
                gameState.score += 5; 
                obj.remove();
            }
        }
    }
}

// --- Game Flow Control ---

function updateGameStats(deltaTime) {
    gameState.timeElapsed += deltaTime;
    // Score increases based on speed
    gameState.score += Math.ceil(gameState.gameSpeed * gameState.speedMultiplier / 10); 
}

function increaseGameSpeed() {
    gameState.speedMultiplier += 0.1;
    gameState.lastSpeedIncrease = gameState.timeElapsed;
    console.log(`Speed increased! Multiplier: ${gameState.speedMultiplier.toFixed(2)}`);
}

function gameOver() {
    gameState.isGameRunning = false;
    gameState.isGameOver = true;
    dom.music.pause();
    dom.music.currentTime = 0;
    cancelAnimationFrame(gameLoopInterval);

    document.getElementById('final-score').textContent = gameState.score;
    document.getElementById('final-money').textContent = gameState.money;
    dom.gameOverScreen.classList.add('active');
}

function pauseGameForShop() {
    if (!gameState.isGameRunning || gameState.isPaused || gameState.isGameOver) return;
    
    gameState.isPaused = true;
    cancelAnimationFrame(gameLoopInterval);
    dom.music.pause();
    
    updateShopUI();
    dom.shopScreen.classList.add('active');
}

function resumeGame() {
    gameState.isPaused = false;
    gameState.lastShopTime = gameState.timeElapsed;
    dom.shopScreen.classList.remove('active');
    dom.music.play().catch(e => console.warn("Music resume failed:", e));
    
    lastFrameTime = performance.now();
    gameLoopInterval = requestAnimationFrame(gameLoop);
}

// --- UI Updates and Shop Logic ---

function updateUI() {
    dom.scoreDisplay.textContent = `Score: ${gameState.score}`;
    dom.moneyDisplay.textContent = `💰 $${gameState.money}`;
    updateSkillCooldownUI();
}

function updateShopUI() {
    dom.shopMoney.textContent = gameState.money;
    dom.upgradesList.innerHTML = '<h2>Upgrades (Stats)</h2>';
    dom.skillsList.innerHTML = '<h2>Skills (Active)</h2>';

    // 1. Render Upgrades
    for (const key in UPGRADES) {
        const upgrade = UPGRADES[key];
        const nextLevel = upgrade.level + 1;
        const currentCost = upgrade.costBase * Math.pow(upgrade.costMult, upgrade.level);
        const canAfford = gameState.money >= currentCost;
        const effectDesc = getUpgradeEffectDescription(key, upgrade);

        const itemDiv = document.createElement('div');
        itemDiv.className = 'shop-item';
        itemDiv.innerHTML = `
            <div class="item-info">
                <strong>${formatUpgradeName(key)} (Lvl ${upgrade.level}) → (Lvl ${nextLevel})</strong>
                <p>${effectDesc}</p>
            </div>
            <button data-type="upgrade" data-id="${key}" ${!canAfford ? 'disabled' : ''}>
                Buy ($${Math.round(currentCost)})
            </button>
        `;
        itemDiv.querySelector('button').addEventListener('click', () => buyUpgrade(key, currentCost));
        dom.upgradesList.appendChild(itemDiv);
    }

    // 2. Render Skills
    for (const key in SKILLS) {
        const skill = SKILLS[key];
        const nextLevel = skill.level + 1;
        
        let buttonText, currentCost, canAfford, buttonAction, isLocked = false;
        
        if (!skill.unlocked) {
            currentCost = skill.unlockCost;
            canAfford = gameState.money >= currentCost;
            buttonText = `Unlock ($${skill.unlockCost})`;
            buttonAction = () => unlockSkill(key);
            isLocked = true;
        } else {
            currentCost = skill.costBase + skill.level * skill.costIncrement;
            canAfford = gameState.money >= currentCost;
            buttonText = `Upgrade ($${Math.round(currentCost)})`;
            buttonAction = () => upgradeSkill(key, currentCost);
        }

        const effectDesc = getSkillEffectDescription(key, skill);

        const itemDiv = document.createElement('div');
        itemDiv.className = 'shop-item';
        itemDiv.innerHTML = `
            <div class="item-info">
                <strong>${skill.name} (Lvl ${skill.level}) ${isLocked ? '(LOCKED)' : `→ (Lvl ${nextLevel})`}</strong>
                <p>Cooldown: ${skill.cooldown}s. ${effectDesc}</p>
            </div>
            <button data-type="skill" data-id="${key}" ${!canAfford ? 'disabled' : ''}>
                ${buttonText}
            </button>
        `;
        itemDiv.querySelector('button').addEventListener('click', buttonAction);
        dom.skillsList.appendChild(itemDiv);
    }
}

function formatUpgradeName(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

function getUpgradeEffectDescription(key, upgrade) {
    switch(key) {
        case 'riskReward':
            const obs = (0.05 + upgrade.level * 0.05) * 100;
            const mon = (0.10 + upgrade.level * 0.10) * 100;
            return `Current: Obstacle +${obs.toFixed(0)}%, Money +${mon.toFixed(0)}%`;
        case 'cooldownReduction':
            const max = upgrade.effect.maxCap * 100;
            const current = upgrade.level * upgrade.effect.reduction;
            return `Current: ${Math.min(current * 100, max).toFixed(0)}% CD Reduction (Max ${max}%)`;
        case 'luck':
            const currentChance = (0.1 + upgrade.level * upgrade.effect.diamondChance) * 100;
            const luckMax = upgrade.effect.maxCap * 100;
            return `Current Diamond Chance: ${Math.min(currentChance, luckMax).toFixed(1)}% (Base 10%)`;
        default: return '';
    }
}

function getSkillEffectDescription(key, skill) {
    switch(key) {
        case 'slow':
            const slow = (0.1 + (skill.level - 1) * 0.1) * 100;
            return `Effect: Slows game by ${slow.toFixed(0)}% for 5s.`;
        case 'shield':
            const duration = skill.effect.baseDuration + skill.level * skill.effect.durationIncrement;
            return `Effect: Invincible for ${duration.toFixed(1)}s.`;
        case 'meteor':
            const meteorDuration = skill.effect.baseDuration + skill.level * skill.effect.durationIncrement;
            return `Effect: Stop spawns for ${meteorDuration.toFixed(0)}s.`;
        default: return '';
    }
}

function buyUpgrade(key, cost) {
    if (gameState.money >= cost) {
        gameState.money -= cost;
        UPGRADES[key].level++;
        updateShopUI();
        updateUI();
    }
}

function unlockSkill(key) {
    const skill = SKILLS[key];
    if (gameState.money >= skill.unlockCost) {
        gameState.money -= skill.unlockCost;
        skill.unlocked = true;
        skill.level = 1;
        updateShopUI();
        updateUI();
        updateSkillButtons();
    }
}

function upgradeSkill(key, cost) {
    const skill = SKILLS[key];
    if (gameState.money >= cost) {
        gameState.money -= cost;
        skill.level++;
        updateShopUI();
        updateUI();
        updateSkillButtons();
    }
}

function updateSkillButtons() {
    for (const key in SKILLS) {
        const skill = SKILLS[key];
        const button = document.getElementById(`skill-${key}`);
        
        button.dataset.unlocked = skill.unlocked;
        button.disabled = !skill.unlocked || skill.currentCooldown > 0 || gameState.isPaused;
        
        if (skill.unlocked) {
            button.textContent = `${skill.name} (Lvl ${skill.level})`;
        } else {
            button.textContent = `${skill.name} (Lvl 0) - Lock`;
        }
    }
}

function getEffectiveCooldown(skill) {
    const reductionEffect = UPGRADES.cooldownReduction.level * UPGRADES.cooldownReduction.effect.reduction;
    const maxReduction = UPGRADES.cooldownReduction.effect.maxCap;
    const totalReduction = Math.min(reductionEffect, maxReduction);
    return skill.cooldown * (1 - totalReduction);
}

function activateSkill(skillId) {
    const skill = SKILLS[skillId];
    if (!skill.unlocked || skill.currentCooldown > 0 || !gameState.isGameRunning || gameState.isPaused) return;

    skill.currentCooldown = getEffectiveCooldown(skill);
    updateSkillButtons();

    switch(skillId) {
        case 'slow':
            activateSlow(skill);
            break;
        case 'shield':
            activateShield(skill);
            break;
        case 'meteor':
            activateMeteor(skill);
            break;
    }
}

function updateSkillCooldowns(deltaTime) {
    let allReady = true;
    for (const key in SKILLS) {
        const skill = SKILLS[key];
        if (skill.currentCooldown > 0) {
            skill.currentCooldown -= deltaTime;
            if (skill.currentCooldown < 0) {
                skill.currentCooldown = 0;
            }
            allReady = false;
        }
    }
    if (!allReady) {
        updateSkillButtons();
    }
}

// --- CRITICAL FIX: updateSkillCooldownUI ---
function updateSkillCooldownUI() {
    for (const key in SKILLS) {
        const skill = SKILLS[key];
        const button = document.getElementById(`skill-${key}`);
        
        // CRITICAL CHECK: Ensure the button element exists
        if (!button) continue; 
        
        const overlay = button.querySelector('.cooldown-overlay');

        // CRITICAL CHECK: Ensure the overlay element exists before accessing its style
        if (overlay) { 
            if (skill.unlocked) {
                const effectiveCD = getEffectiveCooldown(skill);
                const percentage = (skill.currentCooldown / effectiveCD) * 100;
                overlay.style.transform = `translateY(${percentage.toFixed(0)}%)`;
            } else {
                overlay.style.transform = `translateY(100%)`;
            }
        }
    }
}
// --- END CRITICAL FIX ---


function activateSlow(skill) {
    if (gameState.isSlowActive) return;
    
    gameState.isSlowActive = true;
    const slowEffect = 0.10 + (skill.level - 1) * 0.10;
    gameState.slowdownFactor = 1 / (1 - slowEffect);
    
    setTimeout(() => {
        gameState.isSlowActive = false;
        gameState.slowdownFactor = 1;
    }, skill.effect.duration * 1000);
}

function activateShield(skill) {
    if (gameState.isInvincible) return;

    const duration = skill.effect.baseDuration + skill.level * skill.effect.durationIncrement;

    gameState.isInvincible = true;
    dom.player.style.outline = '3px solid gold'; // Visual shield indicator

    setTimeout(() => {
        gameState.isInvincible = false;
        dom.player.style.outline = 'none';
    }, duration * 1000);
}

function activateMeteor(skill) {
    if (gameState.isMeteorActive) return;

    const duration = skill.effect.baseDuration + skill.level * skill.effect.durationIncrement;
    
    gameState.isMeteorActive = true;
    
    dom.meteorFlash.classList.add('flash-active');
    
    setTimeout(() => {
        dom.meteorFlash.classList.remove('flash-active');
    }, 500);


    setTimeout(() => {
        gameState.isMeteorActive = false;
    }, duration * 1000);
}

document.addEventListener('DOMContentLoaded', initGame);