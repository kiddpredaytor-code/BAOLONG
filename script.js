const gameArea = document.getElementById("game-area");
const dino = document.getElementById("dino");
const scoreText = document.getElementById("score");
const music = document.getElementById("game-music");

let velocityY = 0;
let gravity = 0.6;
let jumping = false;
let score = 0;
let obstacles = [];
let gameRunning = true;

/* MUSIC */
music.volume = 0.5;
music.play().catch(() => {});

/* INPUT */
document.addEventListener("touchstart", (e) => {
    if (!gameRunning) return;
    if (e.target.closest(".skill-button")) return;
    jump();
}, { passive: false });

/* JUMP */
function jump() {
    if (jumping) return;
    velocityY = 12;
    jumping = true;
}

/* GAME LOOP */
function update() {
    if (!gameRunning) return;

    velocityY -= gravity;
    let bottom = parseFloat(getComputedStyle(dino).bottom);

    bottom += velocityY;
    if (bottom <= 0) {
        bottom = 0;
        velocityY = 0;
        jumping = false;
    }

    dino.style.bottom = bottom + "px";

    moveObstacles();
    score++;
    scoreText.textContent = "Score: " + score;

    requestAnimationFrame(update);
}

/* OBSTACLES */
function spawnObstacle() {
    const obs = document.createElement("div");
    obs.classList.add("obstacle");

    if (Math.random() < 0.5) {
        obs.classList.add("cactus");
    } else {
        obs.classList.add("bird");
    }

    obs.style.right = "-60px";
    gameArea.appendChild(obs);
    obstacles.push(obs);
}

function moveObstacles() {
    obstacles.forEach((obs, i) => {
        let right = parseFloat(obs.style.right);
        obs.style.right = right + 5 + "px";

        if (right > gameArea.offsetWidth + 60) {
            obs.remove();
            obstacles.splice(i, 1);
        }
    });
}

/* METEOR SKILL */
document.getElementById("meteor-btn").addEventListener("click", () => {
    const meteor = document.createElement("div");
    meteor.classList.add("meteor");
    meteor.style.top = "-80px";
    meteor.style.left = "50%";
    gameArea.appendChild(meteor);

    let y = -80;
    const fall = setInterval(() => {
        y += 12;
        meteor.style.top = y + "px";
        if (y > gameArea.offsetHeight) {
            meteor.remove();
            clearInterval(fall);
        }
    }, 16);
});

/* START */
setInterval(spawnObstacle, 1800);
update();
