/**
 * Bảo Long - Mobile-First Runner Game Script
 * Fixes: Smoother motion, Time Slow function, Negative Score Bug, PNG compatibility.
 */

// --- DOM ELEMENTS ---
// (Elements remain the same)
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
    // Fix 2: Time Slow variables
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
const targetFrameRate = 60; // Target FPS for smooth delta time calculation
const msPerFrame = 1000 / targetFrameRate;

let speedIncreaseInterval = 60000; 
let shopInterval = 120000;
let animationFrameId;

let gameTimer = 0; // Total time survived (ms)
let speedTimer = 0;
let shopTimer = 0;
let obstacleSpawnTimer = 0;
let moneySpawnTimer = 0;

let obstacleSpawnRate = 1200; 
let moneySpawnRate = 800; 

// --- UPGRADE/SKILL SYSTEM DATA ---
// (Data remains the same)
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


/** Initializes the game, resetting all states and variables. */
function initGame() {
    gameState.isRunning = false;
    gameState.isJumping = false;
    gameState.isPaused = false;
    gameState.isInvincible = false;
    gameState.isTimeSlowed = false; // Reset Time Slow state
    gameState.timeSlowFactor = 1.0;
    gameState.timeSlowTimer = 0;
    gameState.obstacleFreeTime = 0;

    // Fix 4: Ensure Score and Money are completely reset
    playerStats.money = 0;
    playerStats.score = 0; 
    
    // ... (other resets) ...
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
    updateSkillButtons();
    titleScreen.classList.add('active');
    gameOverScreen.classList.remove('active');
    shopScreen.classList.remove('active');
    gameMusic.pause();
    gameMusic.currentTime = 0; // Reset music to the start
}

/** Starts the main game loop. */
function startGame() {
    titleScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    gameState.isRunning = true;
    dino.classList.add('running');
    gameMusic.play().catch(e => console.log("Music auto-play prevented. User interaction required."));
    // Fix 1: Pass the current timestamp to start the smooth loop
    gameLoop(performance.now());
}

/** Handles the game over state. */
function gameOver() {
    pauseGame();
    // Fix 4: The score is final upon death and cannot go negative
    finalScore.textContent = playerStats.score; 
    finalMoney.textContent = playerStats.money;
    gameOverScreen.classList.add('active');
    dino.classList.remove('running');
}

/** Main game loop. */
function gameLoop(timestamp) {
    if (!gameState.isRunning) return;

    // Fix 1: Calculate Delta Time relative to the target FPS (60FPS) for smooth, frame-rate independent movement
    const rawDeltaTime = timestamp - (gameLoop.lastTime || timestamp);
    gameLoop.lastTime = timestamp;

    // Apply Time Slow factor to Delta Time
    // A smaller timeSlowFactor means a slower game
    const deltaTime = rawDeltaTime * gameState.timeSlowFactor; 

    // Time independent factor for gravity, movement etc. 
    // This scales the movement to be consistent across different frame rates.
    const speedFactor = deltaTime / msPerFrame;


    if (!gameState.isPaused) {
        // --- TIMERS & SPEED ---
        gameTimer += deltaTime;
        // Score calculation uses the true game time passed
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

        // --- TIME SLOW DURATION COUNTDOWN (Fix 2) ---
        if (gameState.isTimeSlowed) {
            gameState.timeSlowTimer -= deltaTime;
            if (gameState.timeSlowTimer <= 0) {
                gameState.isTimeSlowed = false;
                gameState.timeSlowFactor = 1.0; // Revert speed
                gameContainer.classList.remove('slowed');
            }
        }

        // --- SKILL COUNTDOWNS ---
        if (gameState.obstacleFreeTime > 0) {
            gameState.obstacleFreeTime -= deltaTime;
        }
        updateCooldowns(rawDeltaTime); // Cooldowns should tick at real-world time (rawDeltaTime)

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
        moneySpawnTimer += deltaTime;
        moveObjects(speedFactor); 
        
        const obstacleRateModifier = 1 + (UPGRADES.find(u => u.id === 'riskReward').level * 0.05);
        if (obstacleSpawnTimer > obstacleSpawnRate / obstacleRateModifier && gameState.obstacleFreeTime <= 0) {
            spawnObject('obstacle');
            obstacleSpawnTimer = 0;
        }

        // Money Spawn is probability-based to ensure consistency regardless of speed
        const moneyRateModifier = 1 + (UPGRADES.find(u => u.id === 'riskReward').level * 0.1);
        const chanceToSpawn = (deltaTime / 1000) * (1 / (moneySpawnRate / 1000)) * moneyRateModifier; // P(spawn) = (time elapsed / spawn rate target) * modifier
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

/** Handles all movement logic for objects in the game area. */
function moveObjects(speedFactor) {
    const objects = gameArea.querySelectorAll('.obstacle, .coin');
    const moveAmount = gameSpeed * speedFactor; // Move amount is scaled by speedFactor

    objects.forEach(obj => {
        const currentRight = parseFloat(obj.style.right) || 0;
        obj.style.right = `${currentRight + moveAmount}px`;

        if (currentRight > gameArea.clientWidth) {
            obj.remove();
        }
    });
}

// ... (spawnObject, checkCollisions, updateHUD, collectMoney remain mostly the same) ...

/** Updates the cooldown timers and UI for skills. */
function updateCooldowns(rawDeltaTime) {
    const cdrFactor = 1 - Math.min(UPGRADES.find(u => u.id === 'cooldownReduction').level * 0.05, 0.75);

    SKILLS.filter(s => s.unlocked).forEach(skill => {
        if (skill.currentCooldown > 0) {
            // Cooldown ticks down using real-world time (rawDeltaTime)
            skill.currentCooldown -= rawDeltaTime / 1000; 
            if (skill.currentCooldown < 0) skill.currentCooldown = 0;

            // ... (UI update logic remains the same) ...
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

    // Calculate cooldown using CDR upgrade
    const cdrFactor = 1 - Math.min(UPGRADES.find(u => u.id === 'cooldownReduction').level * 0.05, 0.75);
    skill.currentCooldown = skill.cooldownBase * cdrFactor;

    switch (skillId) {
        case 'timeSlow':
            // Fix 2: Implement fixed duration Time Slow
            const slowPercent = 0.1 + (skill.level - 1) * 0.1;
            gameState.timeSlowFactor = 1.0 - slowPercent; // e.g., 0.9 for 10% slow
            gameState.isTimeSlowed = true;
            gameState.timeSlowTimer = gameState.timeSlowDuration; // 5000ms
            
            gameContainer.classList.add('slowed');
            console.log(`Time Slow Activated: ${slowPercent * 100}% for 5s`);
            break;

        case 'shield':
            const duration = 1 + skill.level * 0.5;
            gameState.isInvincible = true;
            dino.style.border = '2px dashed yellow';
            
            // Shield duration must use real-world time (setTimeout is not affected by timeSlowFactor)
            setTimeout(() => {
                gameState.isInvincible = false;
                dino.style.border = 'none';
            }, duration * 1000); 
            break;

        case 'meteorCall':
            const safeDuration = 5 + skill.level;
            gameState.obstacleFreeTime = safeDuration * 1000;
            
            // Visual Effect: Screen flash (uses real-world time for duration)
            meteorCallEffect.style.opacity = 1;
            setTimeout(() => meteorCallEffect.style.opacity = 0, 100);

            // Visual Effect: Meteor Drop (uses real-world time for duration)
            meteorCallVisual.classList.add('meteor-falling');
            meteorCallVisual.style.display = 'block';
            setTimeout(() => {
                meteorCallVisual.classList.remove('meteor-falling');
                meteorCallVisual.style.display = 'none';
                meteorCallVisual.style.top = '-100px';
            }, 1000);
            
            console.log(`Meteor Call Activated: ${safeDuration}s obstacle-free`);
            break;
    }
    updateCooldowns(0); 
}


// ... (Event Listeners remain the same) ...

// Initialize the game state when the script loads
updateSkillButtons();
initGame();