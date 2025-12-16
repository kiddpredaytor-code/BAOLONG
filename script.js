const state = {
    screen: 'menu',
    characterSet: 1,
    characterPhase: 'a',
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
    bucketSpeed: 10,
    bucketAccel: 0.8,
    bucketDecel: 0.82,
    stageTargets: {
        easy: [500, 1000, 1500],
        hard: [1000, 2000, 3000]
    }
};

let bucket = { x: 0, y: 0, width: 80, height: 50, velocity: 0 };
let objects = [];
let keys = { left: false, right: false };
let lastTime = 0, spawnTimer = 0, uiTimer = 0;

const cvs = document.getElementById('game-canvas');
const ctx = cvs.getContext('2d');
const assets = { images: {}, audio: {} };

const imageFiles = [
    'standby1a.png', 'standby1b.png', 'standby1c.png',
    'standby2a.png', 'standby2b.png', 'standby2c.png',
    'normal.png', 'nnormal.png', 'bomb.png', 'streak.png',
    'gbg.png', 'mbg.png', 'bucket.png'
];

function init() {
    imageFiles.forEach(file => {
        const img = new Image();
        img.src = `assets/${file}`;
        assets.images[file] = img;
    });

    assets.audio.menu = document.getElementById('bgm-menu');
    assets.audio.game = document.getElementById('bgm-game');
    assets.audio.fail = document.getElementById('sfx-fail');

    setupListeners();
    resize();
}

function setupListeners() {
    window.addEventListener('keydown', e => {
        if(e.key === 'ArrowLeft') keys.left = true;
        if(e.key === 'ArrowRight') keys.right = true;
    });
    window.addEventListener('keyup', e => {
        if(e.key === 'ArrowLeft') keys.left = false;
        if(e.key === 'ArrowRight') keys.right = false;
    });

    cvs.addEventListener('touchstart', e => {
        const touchX = e.touches[0].clientX - cvs.getBoundingClientRect().left;
        keys.left = touchX < cvs.width / 2;
        keys.right = touchX >= cvs.width / 2;
    });
    cvs.addEventListener('touchend', () => { keys.left = false; keys.right = false; });

    document.getElementById('btn-play').onclick = () => showScreen('difficulty');
    document.getElementById('btn-change').onclick = () => {
        state.characterSet = state.characterSet === 1 ? 2 : 1;
        updateChar();
    };
    document.getElementById('btn-admin').onclick = () => document.getElementById('admin-panel').classList.remove('hidden');
    document.getElementById('btn-submit-admin').onclick = () => {
        if(document.getElementById('admin-input').value === '1234') document.getElementById('hell-mode').classList.remove('hidden');
    };
    document.getElementById('btn-hell').onclick = () => document.getElementById('hell-text').classList.remove('hidden');
    document.querySelectorAll('.diff-btn').forEach(btn => btn.onclick = () => startGame(btn.dataset.diff));
    document.getElementById('btn-menu').onclick = () => showScreen('menu');
}

function resize() {
    cvs.width = cvs.parentElement.clientWidth;
    cvs.height = cvs.parentElement.clientHeight;
    bucket.width = cvs.width * 0.18;
    bucket.height = bucket.width * 0.6;
    bucket.y = cvs.height - bucket.height - 10;
}

function updateChar() {
    document.getElementById('char-img').src = `assets/standby${state.characterSet}${state.characterPhase}.png`;
}

function showScreen(name) {
    document.querySelectorAll('#main-area > div, canvas').forEach(el => el.classList.add('hidden'));
    assets.audio.menu.pause(); assets.audio.game.pause();

    if (name === 'menu') {
        document.getElementById('menu-screen').classList.remove('hidden');
        document.getElementById('ui-info').classList.add('hidden');
        assets.audio.menu.play();
        state.characterPhase = 'a'; updateChar();
    } else if (name === 'difficulty') {
        document.getElementById('difficulty-screen').classList.remove('hidden');
    } else if (name === 'game') {
        cvs.classList.remove('hidden');
        document.getElementById('ui-info').classList.remove('hidden');
        assets.audio.game.play();
    } else if (name === 'end') {
        document.getElementById('end-screen').classList.remove('hidden');
        assets.audio.fail.play();
    }
}

function startGame(diff) {
    state.difficulty = diff;
    state.stage = 1; state.score = 0; state.timeLeft = 60;
    state.gameRunning = true;
    showScreen('game');
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function gameLoop(t) {
    if (!state.gameRunning) return;
    const dt = (t - lastTime) / 16.66;
    lastTime = t;
    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    uiTimer += dt;
    if (uiTimer >= 60) { state.timeLeft--; uiTimer = 0; if(state.isStreakActive) state.streakTimer++; }

    // Smooth Movement
    if (keys.left) bucket.velocity -= constants.bucketAccel * dt;
    else if (keys.right) bucket.velocity += constants.bucketAccel * dt;
    else bucket.velocity *= Math.pow(constants.bucketDecel, dt);

    bucket.x += bucket.velocity * dt;
    bucket.x = Math.max(0, Math.min(cvs.width - bucket.width, bucket.x));

    // Spawn Logic
    spawnTimer += dt;
    if (spawnTimer > 35) { spawnObject(); spawnTimer = 0; }

    objects.forEach((obj, i) => {
        obj.y += obj.speed * dt;
        if (obj.type === 'bomb') obj.rot += 0.1 * dt;

        if (obj.y + obj.h > bucket.y && obj.x < bucket.x + bucket.width && obj.x + obj.w > bucket.x) {
            handleCatch(obj); objects.splice(i, 1);
        } else if (obj.y > cvs.height) {
            if (obj.type !== 'bomb') resetStreak();
            objects.splice(i, 1);
        }
    });

    const target = constants.stageTargets[state.difficulty][state.stage - 1];
    document.getElementById('target-display').innerText = target;
    document.getElementById('score-display').innerText = state.score;
    document.getElementById('time-display').innerText = state.timeLeft;
    document.getElementById('stage-display').innerText = state.stage;
    document.getElementById('streak-display').innerText = state.isStreakActive ? `Active (${state.streakTimer}s)` : `${state.streakCount}/3`;

    if (state.timeLeft <= 0) {
        if (state.score >= target) advance(); else showScreen('end');
    }
}

function spawnObject() {
    const r = Math.random() * 201;
    let type = 'normal', spd = 3, sc = 25, w = 40;
    if (r > 100 && r < 150) { type = 'nnormal'; spd = 4.5; sc = 50; w = 35; }
    else if (r >= 150 && r < 200) { type = 'bomb'; spd = 2.5; sc = -55; w = 40; }
    else if (r >= 200) { type = 'streak'; spd = 6; sc = 0; w = 25; }

    objects.push({
        type, speed: spd, score: sc, rot: 0,
        w: w * (cvs.width/550), h: w * (cvs.width/550),
        x: Math.random() * (cvs.width - 40), y: -50,
        img: assets.images[`${type}.png`]
    });
}

function handleCatch(obj) {
    if (obj.type === 'bomb') { state.score += obj.score; resetStreak(); }
    else if (obj.type === 'streak') { state.score *= 2; state.streakCount++; }
    else {
        let p = obj.score;
        if (state.isStreakActive) p *= (1 + Math.floor(state.streakTimer/10) * 0.1);
        state.score += Math.round(p);
        state.streakCount++;
    }
    if (state.streakCount >= 3) state.isStreakActive = true;
}

function resetStreak() { state.streakCount = 0; state.isStreakActive = false; state.streakTimer = 0; }

function advance() {
    if (state.stage < 3) {
        state.stage++; state.timeLeft = 60; objects = [];
        state.characterPhase = state.stage === 2 ? 'b' : 'c';
        updateChar();
    } else { state.gameRunning = false; showScreen('end'); document.getElementById('end-title').innerText = "Clear!"; }
}

function draw() {
    ctx.drawImage(assets.images['gbg.png'], 0, 0, cvs.width, cvs.height);
    ctx.drawImage(assets.images['bucket.png'], bucket.x, bucket.y, bucket.width, bucket.height);
    objects.forEach(obj => {
        ctx.save();
        ctx.translate(obj.x + obj.w/2, obj.y + obj.h/2);
        ctx.rotate(obj.rot);
        ctx.drawImage(obj.img, -obj.w/2, -obj.h/2, obj.w, obj.h);
        ctx.restore();
    });
}

window.onload = init;