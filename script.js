/* STATE MANAGEMENT */
const state = {
    screen: 'menu', 
    characterSet: 1, 
    characterPhase: 'a',
    isAdminUnlocked: false,
    difficulty: 'easy',
    stage: 1,
    score: 0,
    timeLeft: 60,
    streakCount: 0,
    isStreakActive: false,
    streakTimer: 0,
    gameRunning: false
};

const constants = {
    bucketSpeed: 8, // Will scale dynamically
    bucketWidthRatio: 0.15, // 15% of screen width
    bucketHeightRatio: 0.08,
    stageTargets: {
        easy: [500, 1000, 1500],
        hard: [1000, 2000, 3000]
    }
};

/* ASSETS */
const assets = {
    images: {},
    audio: {
        menu: document.getElementById('bgm-menu'),
        game: document.getElementById('bgm-game'),
        fail: document.getElementById('sfx-fail')
    }
};

const imageFiles = [
    'standby1a.png', 'standby1b.png', 'standby1c.png',
    'standby2a.png', 'standby2b.png', 'standby2c.png',
    'normal.png', 'nnormal.png', 'bomb.png', 'streak.png'
];

/* GAME OBJECTS */
let bucket = { x: 0, y: 0, width: 60, height: 40 };
let objects = []; 
let keys = { left: false, right: false }; // Updated to abstract keys/touch
let lastTime = 0;
let spawnTimer = 0;
let uiTimer = 0; 

/* DOM ELEMENTS */
const cvs = document.getElementById('game-canvas');
const ctx = cvs.getContext('2d');
const uiScore = document.getElementById('score-display');
const uiTime = document.getElementById('time-display');
const uiStage = document.getElementById('stage-display');
const uiStreak = document.getElementById('streak-display');
const charImg = document.getElementById('char-img');

/* INITIALIZATION */
function init() {
    let loaded = 0;
    imageFiles.forEach(file => {
        const img = new Image();
        img.src = `assets/${file}`;
        img.onload = () => { loaded++; };
        assets.images[file] = img;
    });

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupListeners();
    updateCharacterImage();
}

function resizeCanvas() {
    const parent = cvs.parentElement;
    cvs.width = parent.clientWidth;
    cvs.height = parent.clientHeight;
    
    // Dynamic Bucket Size
    bucket.width = cvs.width * constants.bucketWidthRatio;
    bucket.height = cvs.height * constants.bucketHeightRatio;
    bucket.y = cvs.height - bucket.height - 10;
    
    // Keep bucket inside if resize happens
    if (bucket.x > cvs.width - bucket.width) bucket.x = cvs.width - bucket.width;
}

function setupListeners() {
    // Keyboard
    window.addEventListener('keydown', e => {
        if(e.key === 'ArrowLeft') keys.left = true;
        if(e.key === 'ArrowRight') keys.right = true;
    });
    window.addEventListener('keyup', e => {
        if(e.key === 'ArrowLeft') keys.left = false;
        if(e.key === 'ArrowRight') keys.right = false;
    });

    // Touch Controls
    cvs.addEventListener('touchstart', handleTouch, {passive: false});
    cvs.addEventListener('touchmove', handleTouch, {passive: false});
    cvs.addEventListener('touchend', () => {
        keys.left = false;
        keys.right = false;
    });

    // UI Buttons
    document.getElementById('btn-play').onclick = () => showScreen('difficulty');
    document.getElementById('btn-change').onclick = switchCharacter;
    
    document.getElementById('btn-admin').onclick = () => {
        document.getElementById('admin-panel').classList.remove('hidden');
    };
    document.getElementById('btn-submit-admin').onclick = checkAdmin;
    document.getElementById('btn-hell').onclick = () => {
        document.getElementById('hell-text').classList.remove('hidden');
    };

    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.onclick = () => startGame(btn.dataset.diff);
    });

    document.getElementById('btn-menu').onclick = () => {
        playAudio('fail'); 
        showScreen('menu');
    };
}

function handleTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = cvs.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;

    // Simple Logic: Left half screen = Left, Right half screen = Right
    if (touchX < cvs.width / 2) {
        keys.left = true;
        keys.right = false;
    } else {
        keys.left = false;
        keys.right = true;
    }
}

/* LOGIC */
function showScreen(screenName) {
    document.querySelectorAll('#main-area > div, canvas').forEach(el => el.classList.add('hidden'));
    
    assets.audio.menu.pause();
    assets.audio.game.pause();
    assets.audio.menu.currentTime = 0;
    assets.audio.game.currentTime = 0;

    if (screenName === 'menu') {
        document.getElementById('menu-screen').classList.remove('hidden');
        document.getElementById('ui-info').classList.add('hidden');
        assets.audio.menu.play().catch(()=>{});
        state.characterPhase = 'a';
        updateCharacterImage();
    } else if (screenName === 'difficulty') {
        document.getElementById('difficulty-screen').classList.remove('hidden');
    } else if (screenName === 'game') {
        cvs.classList.remove('hidden');
        document.getElementById('ui-info').classList.remove('hidden');
        resizeCanvas(); // Ensure size is correct before start
        bucket.x = cvs.width / 2 - bucket.width / 2; // Center bucket
        assets.audio.game.play().catch(()=>{});
    } else if (screenName === 'end') {
        document.getElementById('end-screen').classList.remove('hidden');
        assets.audio.fail.play().catch(()=>{});
    }
}

function switchCharacter() {
    state.characterSet = state.characterSet === 1 ? 2 : 1;
    updateCharacterImage();
}

function updateCharacterImage() {
    const filename = `standby${state.characterSet}${state.characterPhase}.png`;
    charImg.src = `assets/${filename}`;
}

function checkAdmin() {
    const code = document.getElementById('admin-input').value;
    if (code === '1234') {
        document.getElementById('admin-panel').classList.add('hidden');
        document.getElementById('hell-mode').classList.remove('hidden');
    }
}

function startGame(diff) {
    state.difficulty = diff;
    state.stage = 1;
    state.score = 0;
    resetStage();
    state.gameRunning = true;
    showScreen('game');
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function resetStage() {
    state.timeLeft = 60;
    state.streakCount = 0;
    state.isStreakActive = false;
    state.streakTimer = 0;
    objects = [];
    uiScore.innerText = state.score;
    uiTime.innerText = state.timeLeft;
    uiStage.innerText = state.stage;
}

function playAudio(type) {
    if (type === 'fail') {
        assets.audio.fail.currentTime = 0;
        assets.audio.fail.play().catch(()=>{});
    }
}

/* GAME LOOP */
function gameLoop(timestamp) {
    if (!state.gameRunning) return;

    const dt = (timestamp - lastTime) / 16.66; 
    lastTime = timestamp;

    update(dt);
    draw();

    if (state.gameRunning) requestAnimationFrame(gameLoop);
}

function update(dt) {
    spawnTimer += dt;
    uiTimer += dt;
    
    if (uiTimer >= 60) { 
        state.timeLeft--;
        uiTime.innerText = state.timeLeft;
        if (state.isStreakActive) state.streakTimer += 1;
        uiTimer = 0;
    }

    const target = constants.stageTargets[state.difficulty][state.stage - 1];
    if (state.timeLeft <= 0) {
        if (state.score >= target) {
            advanceStage();
        } else {
            gameOver();
        }
    }

    // Dynamic Speed based on screen width
    const currentSpeed = (cvs.width / 100) * 1.5; // Scale speed with width

    if (keys.left && bucket.x > 0) bucket.x -= currentSpeed * dt;
    if (keys.right && bucket.x < cvs.width - bucket.width) bucket.x += currentSpeed * dt;

    if (spawnTimer > 30) { 
        attemptSpawn();
        spawnTimer = 0;
    }

    for (let i = objects.length - 1; i >= 0; i--) {
        let obj = objects[i];
        
        // Speed scaling for height
        const verticalScale = cvs.height / 600;
        obj.y += (obj.speed * verticalScale) * dt;

        if (obj.type === 'bomb') obj.rotation += 0.05 * dt;

        if (checkCollision(obj, bucket)) {
            handleCatch(obj);
            objects.splice(i, 1);
            continue;
        }

        if (obj.y > cvs.height) {
            if (obj.type !== 'bomb') resetStreak();
            objects.splice(i, 1);
        }
    }

    updateUI();
}

function attemptSpawn() {
    const totalWeight = 201;
    const r = Math.random() * totalWeight;
    
    let type = 'normal';
    if (r < 100) type = 'normal';
    else if (r < 150) type = 'nnormal';
    else if (r < 200) type = 'bomb';
    else type = 'streak';

    let newObj = createObject(type);
    let attempts = 0;
    let valid = false;

    while (attempts < 5 && !valid) {
        newObj.x = Math.random() * (cvs.width - newObj.width);
        valid = true;
        
        for (let o of objects) {
            if (o.y < 100) { 
                if (Math.abs(o.x - newObj.x) < (o.width + newObj.width)) {
                    valid = false;
                    break;
                }
            }
        }
        attempts++;
    }

    if (valid) objects.push(newObj);
}

function createObject(type) {
    // Relative scale based on screen width
    const scaleRef = cvs.width / 550; 
    
    let props = {};
    if (type === 'normal') { props = { src: 'normal.png', score: 20, spd: 3.0, w: 40 }; }
    if (type === 'nnormal') { props = { src: 'nnormal.png', score: 50, spd: 4.5, w: 32 }; }
    if (type === 'bomb') { props = { src: 'bomb.png', score: -55, spd: 2.4, w: 40 }; }
    if (type === 'streak') { props = { src: 'streak.png', score: 0, spd: 6.0, w: 20 }; }

    const size = props.w * scaleRef;

    return {
        type: type,
        x: 0, 
        y: -size - 10,
        width: size,
        height: size, 
        speed: props.spd,
        scoreVal: props.score,
        img: assets.images[props.src],
        rotation: 0
    };
}

function checkCollision(obj, bkt) {
    return (
        obj.x < bkt.x + bkt.width &&
        obj.x + obj.width > bkt.x &&
        obj.y < bkt.y + bkt.height &&
        obj.y + obj.height > bkt.y
    );
}

function handleCatch(obj) {
    if (obj.type === 'bomb') {
        state.score += obj.scoreVal;
        resetStreak();
    } else if (obj.type === 'streak') {
        state.score *= 2;
        incrementStreak();
    } else {
        let points = obj.scoreVal;
        if (state.isStreakActive) {
            const bonusPercent = Math.floor(state.streakTimer / 10) * 0.1;
            points = points * (1 + bonusPercent);
        }
        state.score += Math.floor(points);
        incrementStreak();
    }
}

function incrementStreak() {
    state.streakCount++;
    if (state.streakCount >= 3) {
        state.isStreakActive = true;
    }
}

function resetStreak() {
    state.streakCount = 0;
    state.isStreakActive = false;
    state.streakTimer = 0;
}

function updateUI() {
    uiScore.innerText = state.score;
    uiStreak.innerText = state.isStreakActive ? `ACTIVE (${Math.floor(state.streakTimer)}s)` : `${state.streakCount}/3`;
}

function advanceStage() {
    if (state.stage < 3) {
        state.stage++;
        if (state.characterPhase === 'a') state.characterPhase = 'b';
        else if (state.characterPhase === 'b') state.characterPhase = 'c';
        else state.characterPhase = 'a';
        
        updateCharacterImage();
        resetStage();
    } else {
        gameWin();
    }
}

function gameOver() {
    state.gameRunning = false;
    document.getElementById('end-title').innerText = "Stage Failed";
    document.getElementById('end-score').innerText = `Final Score: ${state.score}`;
    playAudio('fail');
    showScreen('end');
}

function gameWin() {
    state.gameRunning = false;
    document.getElementById('end-title').innerText = "All Stages Cleared!";
    document.getElementById('end-score').innerText = `Final Score: ${state.score}`;
    playAudio('fail'); 
    showScreen('end');
}

function draw() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    
    ctx.fillStyle = '#888';
    ctx.fillRect(bucket.x, bucket.y, bucket.width, bucket.height);

    objects.forEach(obj => {
        ctx.save();
        ctx.translate(obj.x + obj.width/2, obj.y + obj.height/2);
        if (obj.rotation) ctx.rotate(obj.rotation);
        
        if (obj.img) {
            ctx.drawImage(obj.img, -obj.width/2, -obj.height/2, obj.width, obj.height);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(-obj.width/2, -obj.height/2, obj.width, obj.height);
        }
        ctx.restore();
    });
}

window.onload = init;