const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

/* ========= ASSETS ========= */
const img = {};
["dino","cactus","bird","bg","meteor"].forEach(n=>{
  img[n]=new Image();
  img[n].src=`assets/${n}.png`;
});

const music = new Audio("assets/music.mp3");
music.loop = true;

/* ========= STATE ========= */
let running=false, paused=false;
let speed=4, time=0, lastShop=0;
let money=0;

/* ========= PLAYER ========= */
const player={
  x:80,y:0,w:60,h:60,vy:0,onGround:false,shield:false
};

/* ========= OBJECTS ========= */
let obstacles=[], coins=[];
let meteorActive=false;

/* ========= INPUT ========= */
function jump(){
  if(player.onGround&&!paused){
    player.vy=-15;
    player.onGround=false;
  }
}
window.addEventListener("keydown",e=>e.code==="Space"&&jump());
canvas.addEventListener("touchstart",jump);

/* ========= SPAWN ========= */
function spawnObstacle(){
  if(meteorActive)return;
  const bird=Math.random()<0.5;
  obstacles.push({
    x:canvas.width,
    y:bird?canvas.height-180:canvas.height-80,
    w:60,h:60,
    img:bird?img.bird:img.cactus
  });
}

function spawnCoin(){
  coins.push({
    x:canvas.width,
    y:canvas.height-(Math.random()*140+80),
    v:Math.random()<0.1?10:1
  });
}

/* ========= COLLISION ========= */
const hit=(a,b)=>a.x<a.x+b.w&&a.x+a.w>b.x&&a.y<a.y+b.h&&a.y+a.h>b.y;

/* ========= SHOP ========= */
function openShop(){
  paused=true;
  document.getElementById("shopScreen").classList.remove("hidden");
  document.getElementById("moneyDisplay").innerText="$"+money;
}
document.getElementById("resumeBtn").onclick=()=>{
  paused=false;
  document.getElementById("shopScreen").classList.add("hidden");
};

/* ========= SKILLS ========= */
document.getElementById("skillTime").onclick=()=>{
  speed*=0.9;
  setTimeout(()=>speed/=0.9,3000);
};
document.getElementById("skillShield").onclick=()=>{
  player.shield=true;
  setTimeout(()=>player.shield=false,1000);
};
document.getElementById("skillMeteor").onclick=()=>{
  meteorActive=true;
  setTimeout(()=>meteorActive=false,5000);
};

/* ========= LOOP ========= */
function loop(){
  if(!running)return;
  requestAnimationFrame(loop);
  if(paused)return;

  time+=16;
  if(time-lastShop>120000){ lastShop=time; openShop(); }

  if(Math.random()<0.02)spawnObstacle();
  if(Math.random()<0.03)spawnCoin();

  ctx.drawImage(img.bg,0,0,canvas.width,canvas.height);

  player.vy+=0.8;
  player.y+=player.vy;
  if(player.y+player.h>=canvas.height-20){
    player.y=canvas.height-20-player.h;
    player.vy=0; player.onGround=true;
  }

  ctx.drawImage(img.dino,player.x,player.y,player.w,player.h);

  obstacles.forEach(o=>{
    o.x-=speed;
    ctx.drawImage(o.img,o.x,o.y,o.w,o.h);
    if(!player.shield&&hit(player,o)){
      running=false;
      document.getElementById("gameOverScreen").classList.remove("hidden");
    }
  });

  coins.forEach((c,i)=>{
    c.x-=speed;
    ctx.fillStyle=c.v===10?"cyan":"gold";
    ctx.beginPath();ctx.arc(c.x,c.y,10,0,Math.PI*2);ctx.fill();
    if(hit(player,{x:c.x,y:c.y,w:20,h:20})){
      money+=c.v; coins.splice(i,1);
    }
  });

  document.getElementById("hudMoney").innerText="$"+money;
}

/* ========= START ========= */
document.getElementById("startBtn").onclick=()=>{
  document.getElementById("startScreen").classList.add("hidden");
  music.play();
  running=true;
  loop();
};

document.getElementById("restartBtn").onclick=()=>location.reload();
