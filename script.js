/* ==========================================================================
   MY PERFECT DELIVERY — script.js

   SECTIONS:
   1. Setup + config
   2. The map (grid of roads / buildings)
   3. Player (grid-based movement, animated between tiles)
   4. Orders (random delivery targets)
   5. Sky timer (this IS the countdown — same crossfade idea as the sky
      slider project, but driven by elapsed time instead of a slider)
   6. Drawing (everything is drawn on the canvas every frame)
   7. Game loop
   8. Start / end / restart
   9. Small helpers: confetti + a tiny "ding" sound
   ========================================================================== */


/* =============================================================
   1. SETUP + CONFIG
============================================================= */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 8;
const ROWS = 8;
const TILE = canvas.width / COLS; // 400 / 8 = 50px per tile

const TOTAL_TIME = 60;       // seconds until the sun fully sets
const MAX_ACTIVE_ORDERS = 3; // how many packages are on the map at once
const MOVE_DURATION = 150;   // ms it takes to slide one tile over

// Colors used for drawing on the canvas (canvas can't read CSS variables,
// so this is a plain JS palette that matches style.css by eye).
const PALETTE = {
  roadA: "#fdf6ff",
  roadB: "#f6ecfb",
  building: "#c9b8e0",
  window: "#fdf3fb",
  player: "#ff8fc7",
};

const ORDER_EMOJIS = ["📦", "🧋", "🎀", "🍰", "🌷"];

let state = {
  running: false,
  startTime: 0,
  elapsed: 0,
  delivered: 0,
  score: 0,
  stepsTaken: 0,
};


/* =============================================================
   2. THE MAP
   0 = open road, 1 = building (blocked). This is just a fixed
   layout — feel free to redraw this grid to make your own map.
============================================================= */

const mapLayout = [
  [0,0,0,1,0,0,0,0],
  [0,1,0,1,0,1,1,0],
  [0,1,0,0,0,1,0,0],
  [0,1,1,1,0,0,0,1],
  [0,0,0,1,0,1,0,0],
  [1,1,0,1,0,1,0,1],
  [0,0,0,0,0,1,0,0],
  [0,1,1,1,0,0,0,0],
];

function isBlocked(col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
  return mapLayout[row][col] === 1;
}

function getRandomOpenTile(avoid = []) {
  let tile;
  do {
    tile = {
      col: Math.floor(Math.random() * COLS),
      row: Math.floor(Math.random() * ROWS),
    };
  } while (
    isBlocked(tile.col, tile.row) ||
    avoid.some(a => a.col === tile.col && a.row === tile.row)
  );
  return tile;
}


/* =============================================================
   3. PLAYER
   Grid-based movement: the player only ever "lives" on one tile
   at a time, but we animate the pixel position smoothly between
   the old tile and the new one so it doesn't just teleport.
============================================================= */

const player = {
  col: 0,
  row: 0,
  pixelX: 0,
  pixelY: 0,
  moving: false,
  moveStart: 0,
  fromX: 0,
  fromY: 0,
  toX: 0,
  toY: 0,
};

function tileCenter(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function resetPlayer() {
  player.col = 0;
  player.row = 0;
  const center = tileCenter(0, 0);
  player.pixelX = center.x;
  player.pixelY = center.y;
  player.moving = false;
}

function tryMove(dCol, dRow) {
  if (!state.running || player.moving) return; // ignore input mid-slide or before start

  const targetCol = player.col + dCol;
  const targetRow = player.row + dRow;
  if (isBlocked(targetCol, targetRow)) return;

  const from = tileCenter(player.col, player.row);
  const to = tileCenter(targetCol, targetRow);

  player.fromX = from.x; player.fromY = from.y;
  player.toX = to.x;     player.toY = to.y;
  player.moving = true;
  player.moveStart = performance.now();

  player.col = targetCol;
  player.row = targetRow;
  state.stepsTaken++;
}

// Smoothly slides the player from its old tile to its new one.
// Called every frame while player.moving is true.
function updatePlayerAnimation(now) {
  if (!player.moving) return;

  const t = Math.min(1, (now - player.moveStart) / MOVE_DURATION);
  player.pixelX = player.fromX + (player.toX - player.fromX) * t;
  player.pixelY = player.fromY + (player.toY - player.fromY) * t;

  if (t >= 1) {
    player.moving = false;
    checkForDelivery();
  }
}


/* =============================================================
   4. ORDERS
============================================================= */

let orders = [];

function spawnOrder() {
  const occupied = [{ col: player.col, row: player.row }, ...orders];
  const tile = getRandomOpenTile(occupied);
  const emoji = ORDER_EMOJIS[Math.floor(Math.random() * ORDER_EMOJIS.length)];
  orders.push({ ...tile, emoji });
}

function fillOrders() {
  while (orders.length < MAX_ACTIVE_ORDERS) spawnOrder();
}

function checkForDelivery() {
  const index = orders.findIndex(o => o.col === player.col && o.row === player.row);
  if (index === -1) return;

  orders.splice(index, 1);
  state.delivered++;
  state.score += 10;
  document.getElementById("deliveredCount").textContent = state.delivered;
  document.getElementById("scoreCount").textContent = state.score;

  playDing();
  burstConfettiAtTile(player.col, player.row);

  if (state.running) spawnOrder();
}


/* =============================================================
   5. SKY TIMER
   Same idea as the sky-slider project: 3 gradient layers, crossfaded.
   Instead of a slider value, "progress" here comes from elapsed game time.
============================================================= */

const skyNoon = document.querySelector(".sky-noon");
const skyDusk = document.querySelector(".sky-dusk");
const skyNight = document.querySelector(".sky-night");
const stars = document.getElementById("stars");
const timerFill = document.getElementById("timerFill");

function peakOpacity(value, peak, spread) {
  return Math.max(0, 1 - Math.abs(value - peak) / spread);
}

function updateSky(progress) {
  // progress goes from 0 (start, noon) to 1 (end, full night)
  const value = progress * 100;
  skyNoon.style.opacity = peakOpacity(value, 0, 45);
  skyDusk.style.opacity = peakOpacity(value, 55, 35);
  const nightOpacity = Math.max(0, (value - 65) / 35);
  skyNight.style.opacity = nightOpacity;
  stars.style.opacity = nightOpacity;

  const remaining = Math.max(0, 1 - progress);
  timerFill.style.width = `${remaining * 100}%`;
  if (remaining < 0.15) {
    timerFill.classList.add("urgent");
  }
}


/* =============================================================
   6. DRAWING
   Everything visual is redrawn from scratch every single frame —
   that's the standard way canvas games work.
============================================================= */

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // --- map tiles ---
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * TILE;
      const y = row * TILE;

      if (mapLayout[row][col] === 1) {
        ctx.fillStyle = PALETTE.building;
        ctx.fillRect(x, y, TILE, TILE);
        // a little "window" so buildings read as buildings, not blank blocks
        ctx.fillStyle = PALETTE.window;
        ctx.fillRect(x + TILE * 0.3, y + TILE * 0.3, TILE * 0.4, TILE * 0.4);
      } else {
        ctx.fillStyle = (row + col) % 2 === 0 ? PALETTE.roadA : PALETTE.roadB;
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }

  // --- orders ---
  ctx.font = `${TILE * 0.5}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  orders.forEach(order => {
    const center = tileCenter(order.col, order.row);
    ctx.fillText(order.emoji, center.x, center.y);
  });

  // --- player (scooter emoji) ---
  ctx.font = `${TILE * 0.6}px sans-serif`;
  ctx.fillText("🛵", player.pixelX, player.pixelY);
}


/* =============================================================
   7. GAME LOOP
============================================================= */

function loop(now) {
  if (state.running) {
    state.elapsed = (now - state.startTime) / 1000;
    const progress = Math.min(1, state.elapsed / TOTAL_TIME);
    updateSky(progress);

    if (progress >= 1) {
      endGame();
    }
  }

  updatePlayerAnimation(now);
  draw();
  requestAnimationFrame(loop);
}


/* =============================================================
   8. START / END / RESTART
============================================================= */

const startScreen = document.getElementById("startScreen");
const endScreen = document.getElementById("endScreen");

document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("restartBtn").addEventListener("click", startGame);

function startGame() {
  state = { running: true, startTime: performance.now(), elapsed: 0, delivered: 0, score: 0, stepsTaken: 0 };
  orders = [];
  resetPlayer();
  fillOrders();

  document.getElementById("deliveredCount").textContent = 0;
  document.getElementById("scoreCount").textContent = 0;
  timerFill.classList.remove("urgent");
  timerFill.style.width = "100%";

  startScreen.classList.add("hidden");
  endScreen.classList.add("hidden");
}

function endGame() {
  state.running = false;

  let tier = "the vibes were off today 🫠";
  if (state.delivered >= 8) tier = "main character delivery legend 🌟";
  else if (state.delivered >= 4) tier = "certified delivery girlie 💫";

  document.getElementById("endStats").textContent =
    `you delivered ${state.delivered} order(s) and scored ${state.score}, in ${state.stepsTaken} steps.`;
  document.getElementById("endTier").textContent = tier;

  endScreen.classList.remove("hidden");
}


/* =============================================================
   9. INPUT: keyboard + on-screen D-pad
============================================================= */

window.addEventListener("keydown", (e) => {
  const keyMap = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  };
  if (keyMap[e.key]) {
    e.preventDefault(); // stop the page itself from scrolling
    tryMove(keyMap[e.key][0], keyMap[e.key][1]);
  }
});

document.querySelectorAll(".dpad-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const dirMap = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dCol, dRow] = dirMap[btn.dataset.dir];
    tryMove(dCol, dRow);
  });
});


/* =============================================================
   HELPERS: confetti + sound
============================================================= */

const confettiLayer = document.getElementById("confettiLayer");
const CONFETTI_COLORS = ["#ff8fb1", "#ffe066", "#b8a6ff", "#b5ead7"];

function burstConfettiAtTile(col, row) {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.width;
  const originX = rect.left + (col * TILE + TILE / 2) * scale;
  const originY = rect.top + (row * TILE + TILE / 2) * scale;

  for (let i = 0; i < 14; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const size = 5 + Math.random() * 5;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    piece.style.left = `${originX + (Math.random() - 0.5) * 60}px`;
    piece.style.top = `${originY}px`;
    piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.animationDuration = `${0.8 + Math.random() * 0.6}s`;
    confettiLayer.appendChild(piece);
    piece.addEventListener("animationend", () => piece.remove());
  }
}

// A tiny synthesized "ding" — no audio file needed. Wrapped in try/catch
// because a few older browsers don't support the Web Audio API at all.
function playDing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctxAudio = new AudioCtx();
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctxAudio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctxAudio.currentTime + 0.3);
    osc.connect(gain).connect(ctxAudio.destination);
    osc.start();
    osc.stop(ctxAudio.currentTime + 0.3);
  } catch (err) {
    // silently skip sound if unsupported — not essential to gameplay
  }
}


/* =============================================================
   KICK EVERYTHING OFF
============================================================= */

resetPlayer();
draw();
requestAnimationFrame(loop);
