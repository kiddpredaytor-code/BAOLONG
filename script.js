/**
 * Bảo Long - Final Robust Runner Game Script
 * Fixes included: DeltaTime for smoothness, Time Slow function reset, Negative Score bug, and Initialization order.
 */

// --- DOM ELEMENTS ---
const gameContainer = document.getElementById('game-container');
const titleScreen = document.getElementById('title-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const shopScreen = document.getElementById('shop-screen');
const gameArea = document.getElementById('game-area');
const dino = document.getElementById('dino');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const resumeButton = document.getElementById('resume-button');
const scoreText = document.getElementById('score-text');
const moneyText = document.getElementById('money-text');
const finalScore = document.getElementById('final-score');
const finalMoney = document.getElementById('final-money');
const shopMoneyAmount = document.getElementById('shop-money-amount');
const upgradesSection = document.getElementById('upgrades-section');
const skillsSection = document.getElementById('skills-section');
const skillButtonsContainer = document.getElementById('skill-buttons-container');
const meteorCallEffect = document.getElementById('meteor-call-effect');
const meteorCallVisual = document.getElementById('meteor-call-visual');
const gameMusic = document.getElementById('game-music');

// --- GAME STATE VARIABLES ---
let gameState = {
    isRunning: false,
    isJumping: false,
    isPaused: false,
    isInvincible: false,
    isTimeSlowed: false, 
    timeSlowFactor: 1.0, 
    timeSlowDuration: 5000, // 5 seconds
    timeSlowTimer: 0,
    obstacleFreeTime: 0,
};

let playerStats = {
    money: 0,
    score: 0,
    dinoBottom: 0,
    jumpHeight: 120,
    gravity: 0.6,
    jumpSpeed: 10,
    vY: 0,
};

let gameSpeed = 5; 
const baseSpeed = 5;
const targetFrameRate = 60;
const msPerFrame = 1000 / targetFrameRate;

let speedIncreaseInterval = 60000; 
let shopInterval = 120000;
let animationFrameId;

let gameTimer = 0;
let speedTimer = 0;
let shopTimer = 0;
let obstacleSpawnTimer = 0;
let moneySpawnTimer = 0;

let obstacleSpawnRate = 1200; 
let moneySpawnRate = 800; 

// --- UPGRADE/SKILL SYSTEM DATA ---
const UPGRADES = [
    { id: 'riskReward', name: 'Risk & Reward', level: 0, costBase: 100, costMult: 2, desc: (l) => `Obstacle/Money rate: +${l * 5}% / +${l * 10}%` },
    { id: 'cooldownReduction', name: 'Cooldown Reduction', level: 0, costBase: 150, costMult: 3, cap: 0.75, desc: (l) => `Skill Cooldown: -${Math.min(l * 5, 75)}%` },
    { id: 'luck', name: 'Luck', level: 0, costBase: 50, costMult: 1.5, cap: 25, desc: (l) => `Diamond Chance: +${Math.min(l * 1, 25)}% (Total: ${l}%)` },
];

const SKILLS = [
    { id: 'timeSlow', name: 'Time Slow', unlocked: true, level: 1, cooldownBase: 60, costBase: 100, costInc: 100, currentCooldown: 0, desc: (l) => `Slows game by ${10 + (l - 1) * 10}% for 5s` },
    { id: 'shield', name: 'Shield', unlocked: false, level: 0, cooldownBase: 60, costUnlock: 150, costInc: 150, currentCooldown: 0, desc: (l) => `Invincible for ${1 + l * 0.5}s` },
    { id: 'meteorCall', name: 'Meteor Call', unlocked: false, level: 0, cooldownBase: 120, costUnlock: 500, costInc: 150, currentCooldown: 0, desc: (l) => `No Obstacles for ${5 + l}s` },
];

/** Resets all states and variables. */
function initGame() {
    gameState.isRunning = false;
    gameState.isJumping = false;
    gameState.isPaused = false;
    gameState.isInvincible = false;
    gameState.isTimeSlowed = false;
    gameState.timeSlowFactor = 1.0;
    gameState.timeSlowTimer = 0;
    gameState.obstacleFreeTime = 0;

    // FIX: Ensure Score and Game Timer are reset together
    playerStats.money = 0;
    playerStats.score = 0; 
    
    gameSpeed = baseSpeed;
    gameTimer = 0;
    speedTimer = 0;
    shopTimer = 0;
    obstacleSpawnTimer = 0;
    moneySpawnTimer = 0;

    SKILLS.forEach(skill => skill.currentCooldown = 0);

    gameArea.innerHTML = '';
    gameArea.appendChild(dino);

    dino.style.bottom = `0px`;
    dino.classList.remove('jumping');
    dino.classList.remove('running');
    gameContainer.classList.remove('slowed');

    updateHUD();
    titleScreen.classList.add('active');
    gameOverScreen.classList.remove('active');
    shopScreen.classList.remove('active');
    gameMusic.pause();
    gameMusic.currentTime = 0;
}

/** Starts the main game loop. */
function startGame() {
    titleScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    gameState.isRunning = true;
    dino.classList.add('running');
    gameMusic.play().catch(e => console.log("Music auto-play prevented. User interaction required."));
    gameLoop(performance.now());
}

/** Pauses the game (used for Shop and Game Over). */
function pauseGame() {
    if (!gameState.isRunning) return;
    gameState.isRunning = false;
    gameState.isPaused = true;
    cancelAnimationFrame(animationFrameId);
    gameMusic.pause();
}

/** Handles the game over state. */
function gameOver() {
    pauseGame();
    // FIX: Score is final upon death
    finalScore.textContent = playerStats.score; 
    finalMoney.textContent = playerStats.money;
    gameOverScreen.classList.add('active');
    dino.classList.remove('running');
}

/** Main game loop. */
function gameLoop(timestamp) {
    if (!gameState.isRunning) return;

    // FIX: Delta Time for smoother motion
    const rawDeltaTime = timestamp - (gameLoop.lastTime || timestamp);
    gameLoop.lastTime = timestamp;
    const deltaTime = rawDeltaTime * gameState.timeSlowFactor;
    const speedFactor = deltaTime / msPerFrame; // Scales movement based on frame time

    if (!gameState.isPaused) {
        // --- TIMERS & SPEED ---
        gameTimer += deltaTime;
        playerStats.score = Math.floor(gameTimer / 100); 
        
        speedTimer += deltaTime;
        if (speedTimer >= speedIncreaseInterval) {
            gameSpeed += 0.5;
            speedTimer = 0;
        }

        shopTimer += deltaTime;
        if (shopTimer >= shopInterval) {
            shopTimer = 0;
            openShop();
            return;
        }

        // --- TIME SLOW DURATION COUNTDOWN ---
        if (gameState.isTimeSlowed) {
            gameState.timeSlowTimer -= deltaTime;
            if (gameState.timeSlowTimer <= 0) {
                gameState.isTimeSlowed = false;
                gameState.timeSlowFactor = 1.0; 
                gameContainer.classList.remove('slowed');
            }
        }

        // --- SKILL COUNTDOWNS ---
        if (gameState.obstacleFreeTime > 0) {
            gameState.obstacleFreeTime -= deltaTime;
        }
        updateCooldowns(rawDeltaTime);

        // --- DINO JUMP PHYSICS ---
        if (gameState.isJumping) {
            playerStats.vY -= playerStats.gravity * speedFactor;
            playerStats.dinoBottom += playerStats.vY * speedFactor;

            if (playerStats.dinoBottom <= 0) {
                playerStats.dinoBottom = 0;
                gameState.isJumping = false;
                playerStats.vY = 0;
                dino.classList.remove('jumping');
            }
            dino.style.bottom = `${playerStats.dinoBottom}px`;
        }

        // --- OBJECT GENERATION & MOVEMENT ---
        obstacleSpawnTimer += deltaTime;
        moveObjects(speedFactor); 
        
        const obstacleRateModifier = 1 + (UPGRADES.find(u => u.id === 'riskReward').level * 0.05);
        if (obstacleSpawnTimer > obstacleSpawnRate / obstacleRateModifier && gameState.obstacleFreeTime <= 0) {
            spawnObject('obstacle');
            obstacleSpawnTimer = 0;
        }

        const moneyRateModifier = 1 + (UPGRADES.find(u => u.id === 'riskReward').level * 0.1);
        const chanceToSpawn = (deltaTime / 1000) * (1 / (moneySpawnRate / 1000)) * moneyRateModifier;
        if (Math.random() < chanceToSpawn) {
             spawnObject('money');
        }

        // --- COLLISION CHECK ---
        checkCollisions();

        // --- HUD UPDATE ---
        updateHUD();
    }

    animationFrameId = requestAnimationFrame(gameLoop);
}
gameLoop.lastTime = 0;

/** Handles player jump on click/tap/space. */
function jump() {
    if (!gameState.isRunning || gameState.isJumping) return;

    gameState.isJumping = true;
    playerStats.vY = playerStats.jumpSpeed;
    dino.classList.add('jumping');
}

/** Handles all movement logic for objects in the game area. */
function moveObjects(speedFactor) {
    const objects = gameArea.querySelectorAll('.obstacle, .coin');
    const moveAmount = gameSpeed * speedFactor;

    objects.forEach(obj => {
        const currentRight = parseFloat(obj.style.right) || 0;
        obj.style.right = `${currentRight + moveAmount}px`;

        if (currentRight > gameArea.clientWidth) {
            obj.remove();
        }
    });
}

/** Spawns a new game object (Obstacle or Money). */
function spawnObject(type) {
    const object = document.createElement('div');
    object.classList.add('game-object');

    const areaHeight = gameArea.clientHeight;

    if (type === 'obstacle') {
        const isBird = Math.random() > 0.6;
        if (isBird) {
            object.classList.add('obstacle', 'bird');
            const birdHeight = Math.floor(Math.random() * (areaHeight * 0.4 - 80) + 80); 
            object.style.bottom = `${birdHeight}px`;
        } else {
            object.classList.add('obstacle', 'cactus');
            object.style.bottom = '0px';
        }
    } else if (type === 'money') {
        const luckLevel = UPGRADES.find(u => u.id === 'luck').level;
        const diamondChance = 0.1 + (luckLevel * 0.01); 
        const isDiamond = Math.random() < diamondChance;
        
        object.classList.add('coin', isDiamond ? 'diamond' : 'gold');
        object.dataset.value = isDiamond ? 10 : 1;

        const coinHeight = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * (playerStats.jumpHeight * 0.8) + 30);
        object.style.bottom = `${coinHeight}px`;
    }

    gameArea.appendChild(object);
}

/** Checks for collisions between Dino and other objects. */
function checkCollisions() {
    const dinoRect = dino.getBoundingClientRect();
    const objects = gameArea.querySelectorAll('.obstacle, .coin');

    objects.forEach(obj => {
        const objRect = obj.getBoundingClientRect();

        const horizontalOverlap = dinoRect.left < objRect.right && dinoRect.right > objRect.left;
        const verticalOverlap = dinoRect.bottom > objRect.top && dinoRect.top < objRect.bottom;

        if (horizontalOverlap && verticalOverlap) {
            if (obj.classList.contains('obstacle')) {
                if (!gameState.isInvincible) {
                    gameOver();
                } else {
                    obj.remove();
                }
            } else if (obj.classList.contains('coin')) {
                collectMoney(parseInt(obj.dataset.value));
                obj.remove();
            }
        }
    });
}

/** Updates the HUD with current score and money. */
function updateHUD() {
    scoreText.textContent = `Score: ${playerStats.score}`;
    moneyText.textContent = `$${playerStats.money}`;
}

/** Adds money to player's total. */
function collectMoney(amount) {
    playerStats.money += amount;
}

/** Opens the shop menu. */
function openShop() {
    pauseGame();
    shopScreen.classList.add('active');
    shopMoneyAmount.textContent = playerStats.money;
    renderShop();
}

/** Renders the shop content based on current player stats. */
function renderShop() {
    // Render Upgrades (Logic remains the same)
    upgradesSection.innerHTML = '<h3>Passive Upgrades</h3>';
    UPGRADES.forEach(upgrade => {
        const nextLevel = upgrade.level + 1;
        const currentCost = upgrade.costBase * Math.pow(upgrade.costMult, upgrade.level);
        
        const item = document.createElement('div');
        item.classList.add('upgrade-item');
        item.innerHTML = `
            <div>
                <strong>${upgrade.name} (Lvl ${upgrade.level})</strong>
                <p class="description">${upgrade.desc(nextLevel)}</p>
            </div>
            <button data-id="${upgrade.id}" ${playerStats.money < currentCost ? 'disabled' : ''}>
                Buy Lvl ${nextLevel} ($${Math.round(currentCost)})
            </button>
        `;
        upgradesSection.appendChild(item);
    });

    // Render Skills (Logic remains the same)
    skillsSection.innerHTML = '<h3>Active Skills</h3>';
    SKILLS.forEach(skill => {
        const nextLevel = skill.level + 1;
        const isUnlocked = skill.unlocked;
        let cost, buttonText, buttonDisabled;

        if (!isUnlocked) {
            cost = skill.costUnlock;
            buttonText = `Unlock ($${cost})`;
            buttonDisabled = playerStats.money < cost;
        } else {
            cost = skill.costBase + (skill.costInc * (skill.level - 1));
            buttonText = `Upgrade Lvl ${nextLevel} ($${cost})`;
            buttonDisabled = playerStats.money < cost;
        }

        const item = document.createElement('div');
        item.classList.add('skill-item');
        item.innerHTML = `
            <div>
                <strong>${skill.name} (Lvl ${skill.level}${!isUnlocked ? ' - Locked' : ''})</strong>
                <p class="description">${skill.desc(nextLevel)}</p>
                <p>Cooldown: ${getSkillCooldown(skill)}s</p>
            </div>
            <button data-id="${skill.id}" data-type="${isUnlocked ? 'upgrade' : 'unlock'}" ${buttonDisabled ? 'disabled' : ''}>
                ${buttonText}
            </button>
        `;
        skillsSection.appendChild(item);
    });

    // Attach event listeners to new buttons
    upgradesSection.querySelectorAll('button').forEach(btn => btn.addEventListener('click', handleUpgradePurchase));
    skillsSection.querySelectorAll('button').forEach(btn => btn.addEventListener('click', handleSkillPurchase));
}

/** Calculates the skill's effective cooldown based on Cooldown Reduction upgrade. */
function getSkillCooldown(skill) {
    const cdrLevel = UPGRADES.find(u => u.id === 'cooldownReduction').level;
    const cdrFactor = Math.min(cdrLevel * 0.05, 0.75);
    return Math.round(skill.cooldownBase * (1 - cdrFactor));
}

/** Handles the purchase of an upgrade. */
function handleUpgradePurchase(e) {
    const upgradeId = e.currentTarget.dataset.id;
    const upgrade = UPGRADES.find(u => u.id === upgradeId);
    if (!upgrade) return;

    const cost = Math.round(upgrade.costBase * Math.pow(upgrade.costMult, upgrade.level));
    if (playerStats.money >= cost) {
        playerStats.money -= cost;
        upgrade.level++;
        shopMoneyAmount.textContent = playerStats.money;
        renderShop();
    }
}

/** Handles the purchase/upgrade of a skill. */
function handleSkillPurchase(e) {
    const skillId = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type;
    const skill = SKILLS.find(s => s.id === skillId);
    if (!skill) return;

    let cost;
    if (type === 'unlock') {
        cost = skill.costUnlock;
    } else {
        cost = skill.costBase + (skill.costInc * (skill.level - 1));
    }

    if (playerStats.money >= cost) {
        playerStats.money -= cost;
        if (type === 'unlock') {
            skill.unlocked = true;
            skill.level = 1;
        } else {
            skill.level++;
        }
        shopMoneyAmount.textContent = playerStats.money;
        renderShop();
        updateSkillButtons();
    }
}

/** Generates and updates the UI buttons for active skills. */
function updateSkillButtons() {
    skillButtonsContainer.innerHTML = '';
    SKILLS.filter(s => s.unlocked).forEach(skill => {
        const btn = document.createElement('button');
        btn.id = `skill-${skill.id}`;
        btn.classList.add('skill-button', 'unlocked');
        btn.dataset.id = skill.id;
        btn.innerHTML = `${skill.name.split(' ').map(w => w[0]).join('')}<div class="skill-cooldown-overlay" style="height: 0%"></div>`;
        btn.addEventListener('click', () => activateSkill(skill.id));
        skillButtonsContainer.appendChild(btn);
    });
}

/** Updates the cooldown timers and UI for skills. */
function updateCooldowns(rawDeltaTime) {
    const cdrFactor = 1 - Math.min(UPGRADES.find(u => u.id === 'cooldownReduction').level * 0.05, 0.75);

    SKILLS.filter(s => s.unlocked).forEach(skill => {
        if (skill.currentCooldown > 0) {
            skill.currentCooldown -= rawDeltaTime / 1000; 
            if (skill.currentCooldown < 0) skill.currentCooldown = 0;

            const button = document.getElementById(`skill-${skill.id}`);
            if (button) {
                const effectiveCD = skill.cooldownBase * cdrFactor;
                const percent = (skill.currentCooldown / effectiveCD) * 100;
                const overlay = button.querySelector('.skill-cooldown-overlay');
                
                overlay.style.height = `${percent}%`;
                if (skill.currentCooldown === 0) {
                    button.classList.remove('disabled');
                    overlay.style.opacity = 0;
                } else {
                    button.classList.add('disabled');
                    overlay.style.opacity = 1;
                }
            }
        }
    });
}

/** Activates the corresponding skill. */
function activateSkill(skillId) {
    const skill = SKILLS.find(s => s.id === skillId);
    if (!skill || skill.currentCooldown > 0 || !gameState.isRunning) return;

    const cdrFactor = 1 - Math.min(UPGRADES.find(u => u.id === 'cooldownReduction').level * 0.05, 0.75);
    skill.currentCooldown = skill.cooldownBase * cdrFactor;

    switch (skillId) {
        case 'timeSlow':
            const slowPercent = 0.1 + (skill.level - 1) * 0.1;
            gameState.timeSlowFactor = 1.0 - slowPercent;
            gameState.isTimeSlowed = true;
            gameState.timeSlowTimer = gameState.timeSlowDuration; 
            
            gameContainer.classList.add('slowed');
            break;

        case 'shield':
            const duration = 1 + skill.level * 0.5;
            gameState.isInvincible = true;
            dino.style.border = '2px dashed yellow';
            
            setTimeout(() => {
                gameState.isInvincible = false;
                dino.style.border = 'none';
            }, duration * 1000); 
            break;

        case 'meteorCall':
            const safeDuration = 5 + skill.level;
            gameState.obstacleFreeTime = safeDuration * 1000;
            
            meteorCallEffect.style.opacity = 1;
            setTimeout(() => meteorCallEffect.style.opacity = 0, 100);

            meteorCallVisual.classList.add('meteor-falling');
            meteorCallVisual.style.display = 'block';
            setTimeout(() => {
                meteorCallVisual.classList.remove('meteor-falling');
                meteorCallVisual.style.display = 'none';
                meteorCallVisual.style.top = '-100px';
            }, 1000);
            break;
    }
    updateCooldowns(0); 
}

// --- EVENT LISTENERS AND INITIALIZATION ---
function initializeGame() {
    // FIX: Ensure skill buttons are set up before initGame is called
    updateSkillButtons();
    initGame();
}

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', initGame);
resumeButton.addEventListener('click', resumeGame);

// Shop Tabs
document.getElementById('tab-upgrades').addEventListener('click', () => {
    document.getElementById('tab-upgrades').classList.add('active');
    document.getElementById('tab-skills').classList.remove('active');
    upgradesSection.classList.add('active');
    skillsSection.classList.remove('active');
});
document.getElementById('tab-skills').addEventListener('click', () => {
    document.getElementById('tab-skills').classList.add('active');
    document.getElementById('tab-upgrades').classList.remove('active');
    skillsSection.classList.add('active');
    upgradesSection.classList.remove('active');
});

// Jump Controls
gameContainer.addEventListener('touchstart', (e) => {
    if (e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        jump();
    }
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (!gameState.isRunning && titleScreen.classList.contains('active')) {
            startGame();
        } else {
            jump();
        }
    }
});

// Start the setup process
initializeGame();