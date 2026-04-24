const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

document.body.style.touchAction = "none";

// RESPONSIVE
function resizeCanvas() {
    const DPR = window.devicePixelRatio || 1;

    canvas.width = window.innerWidth * DPR;
    canvas.height = window.innerHeight * DPR;

    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// REMOVE BLACK
// REMOVE BACKGROUND (Ultra-Aggressive Circular Mask & Color Filter)
function removeBackground(img) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cctx = c.getContext("2d");
    cctx.drawImage(img, 0, 0);
    const data = cctx.getImageData(0, 0, c.width, c.height);
    const centerX = c.width / 2;
    const centerY = c.height / 2;
    const radius = Math.min(c.width, c.height) * 0.38; // Even tighter to remove all halos

    for (let i = 0; i < data.data.length; i += 4) {
        const x = (i / 4) % c.width;
        const y = Math.floor((i / 4) / c.width);
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        
        const r = data.data[i], g = data.data[i+1], b = data.data[i+2];

        // 1. Tighter Circle Cut
        if (dist > radius) {
            data.data[i + 3] = 0;
        } else {
            // 2. More aggressive grey/white/checkerboard removal
            const isGrey = Math.abs(r - g) < 20 && Math.abs(g - b) < 20;
            if (isGrey && r > 140) { // Lowered threshold to catch more white bits
                data.data[i + 3] = 0;
            }
            // 3. Remove dark artifacts
            if (r < 40 && g < 40 && b < 40) {
                data.data[i + 3] = 0;
            }
            // 4. Smooth Alpha Falloff at edges
            if (dist > radius * 0.9) {
                data.data[i+3] *= (radius - dist) / (radius * 0.1);
            }
        }
    }
    cctx.putImageData(data, 0, 0);
    return c;
}

// ASSETS
let loaded = 0;
const shipImg = new Image();
const astImg = new Image();
const ast2Img = new Image();
const ast3Img = new Image();
const bgImg = new Image();

let shipReady, astReady, ast2Ready, ast3Ready;

shipImg.src = "assets/ship.png";
astImg.src = "assets/asteroid.png";
ast2Img.src = "assets/molten_asteroid.png"; 
ast3Img.src = "assets/crystal_asteroid.png";
bgImg.src = "assets/bg.png";

shipImg.onload = () => { shipReady = removeBackground(shipImg); loaded++; };
astImg.onload = () => { astReady = removeBackground(astImg); loaded++; };
ast2Img.onload = () => { ast2Ready = removeBackground(ast2Img); loaded++; };
ast3Img.onload = () => { ast3Ready = removeBackground(ast3Img); loaded++; };
bgImg.onload = () => loaded++;

shipImg.onerror = astImg.onerror = ast2Img.onerror = ast3Img.onerror = bgImg.onerror = (e) => {
    console.error("Failed to load asset:", e.target.src);
    loaded++; // Still increment to prevent stuck loading, but it will fall back to safe drawing
};

// GAME STATE
let gameStarted = false;
let world = { width: 2000, height: 1400 };
let ship = { x: 1000, y: 700, a: 0, r: 25 };
let bullets = [];
let asteroids = [];
let particles = [];
let floatingTexts = [];
let score = 0;
let displayScore = 0; // For animated counter
let highScore = localStorage.getItem("asteroid_highScore") || 0;
let shake = 0;
let gameOver = false;
let isPaused = false;
let scoreFlash = 0; // For pulse effect
let currentStage = 1;
let stageFlash = 0;
let cam = { x: 1000 - window.innerWidth / 2, y: 700 - window.innerHeight / 2 };
let hazards = []; // NEW: For Stage 2 lava pools

// SPAWN
function spawnAsteroid(x, y, r = 50, level = 3) {
    const angle = Math.random() * Math.PI * 2;
    // Speed scales with stage
    let speedMult = currentStage === 2 ? 1.0 : (currentStage === 3 ? 2.2 : 1.0);
    const speed = ((4 - level) * 0.8 + Math.random() * 1.2) * speedMult;

    let astType = currentStage;

    // Prevent spawning on player (Only for new random spawns, not splits)
    if (x === undefined) {
        x = Math.random() * world.width;
        y = Math.random() * world.height;
        if (Math.abs(x - ship.x) < 300 && Math.abs(y - ship.y) < 300) {
            x = (x + world.width / 2) % world.width;
            y = (y + world.height / 2) % world.height;
        }
    }

    asteroids.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: r,
        level: level,
        type: astType,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.1
    });
}

function createHazard(x, y) {
    hazards.push({ x, y, r: 0, maxR: 60, speed: 2.5, life: 1.0 }); // Expanding shockwave
}

// Initial Spawn (Scaled to world size - Increased Density)
const asteroidCount = Math.floor((world.width * world.height) / 60000);
for (let i = 0; i < asteroidCount; i++) spawnAsteroid();

// PARTICLE SYSTEM
function createExplosion(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            color: color,
            size: Math.random() * 3 + 2
        });
    }
}

function createFloatingText(x, y, text) {
    floatingTexts.push({ x, y, text, life: 1.0 });
}

// INPUT
let touch = { active: false, x: 0, y: 0 };
let mouse = { active: false, x: 0, y: 0 };
let keys = {};

// INPUT LISTENERS
canvas.addEventListener("touchstart", e => {
    e.preventDefault();
    if (gameOver) { restartGame(); return; }
    const t = e.touches[0];
    touch.active = true;
    touch.x = t.clientX;
    touch.y = t.clientY;
    shoot();
}, { passive: false });
canvas.addEventListener("touchmove", e => { e.preventDefault(); const t = e.touches[0]; touch.x = t.clientX; touch.y = t.clientY; }, { passive: false });
canvas.addEventListener("touchend", e => { e.preventDefault(); touch.active = false; }, { passive: false });

canvas.addEventListener("mousedown", e => {
    if (gameOver) { restartGame(); return; }
    mouse.active = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    shoot();
});
canvas.addEventListener("mousemove", e => { if (!mouse.active) return; mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener("mouseup", () => { mouse.active = false; });

window.addEventListener("keydown", e => {
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        togglePause();
        return;
    }
    if (gameOver) { restartGame(); return; }
    keys[e.key] = true;
    if (e.key === " ") shoot();
});
window.addEventListener("keyup", e => { keys[e.key] = false; });

// SHOOT
function shoot() {
    if (!gameStarted || isPaused) return;
    const offset = 30;
    bullets.push({
        x: ship.x + Math.cos(ship.a) * offset,
        y: ship.y + Math.sin(ship.a) * offset,
        vx: Math.cos(ship.a) * 9, // Reduced from 12
        vy: Math.sin(ship.a) * 9, // Reduced from 12
        life: 70 // Increased life slightly to compensate for speed
    });
    shake = 3;
}

// LOOP
function update() {
    requestAnimationFrame(update);

    // Initial check: Don't do anything until game is started
    if (!gameStarted) return;

    // Safety check: Wait for essential assets (Ship, Base Asteroid, Background)
    // We can at least start the loop if 3 core assets are ready, then add others
    if (loaded < 3) {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText("YÜKLENİYOR... (" + loaded + "/5)", window.innerWidth / 2, window.innerHeight / 2);
        return;
    }

    // --- 1. RESET & CLEAR ---
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.globalAlpha = 1.0; ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    ctx.fillStyle = "#0a0a0f"; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    // --- 2. CAMERA ---
    if (!isPaused && !gameOver) {
        let targetCamX = ship.x - window.innerWidth / 2;
        let targetCamY = ship.y - window.innerHeight / 2;
        targetCamX = Math.max(0, Math.min(world.width - window.innerWidth, targetCamX));
        targetCamY = Math.max(0, Math.min(world.height - window.innerHeight, targetCamY));
        cam.x += (targetCamX - cam.x) * 0.1; cam.y += (targetCamY - cam.y) * 0.1;
    }

    // --- 3. WORLD DRAWING ---
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    if (!isPaused && shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.9; }

    // Background Tiling
    ctx.globalAlpha = 0.3;
    for (let x = 0; x < world.width; x += 1000) {
        for (let y = 0; y < world.height; y += 1000) { ctx.drawImage(bgImg, x, y, 1000, 1000); }
    }
    ctx.globalAlpha = 1.0;

    // Grid & Barriers
    ctx.save();
    ctx.globalAlpha = 0.05; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
    for (let x = 0; x <= world.width; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.height); ctx.stroke(); }
    for (let y = 0; y <= world.height; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.width, y); ctx.stroke(); }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = `rgba(0, 242, 255, ${0.1 + Math.sin(Date.now() * 0.005) * 0.1})`;
    ctx.lineWidth = 10; ctx.shadowBlur = 20; ctx.shadowColor = "#00f2ff";
    ctx.strokeRect(0, 0, world.width, world.height);
    ctx.restore();

    // --- 4. GAME LOGIC ---
    if (!isPaused && !gameOver) {
        // Input Handling
        if (touch.active || mouse.active) {
            let ix = touch.active ? touch.x : mouse.x; let iy = touch.active ? touch.y : mouse.y;
            let dx = (ix + cam.x) - ship.x; let dy = (iy + cam.y) - ship.y;
            if (Math.sqrt(dx * dx + dy * dy) > 10) { ship.x += dx * 0.06; ship.y += dy * 0.06; ship.a = Math.atan2(dy, dx); }
        }
        let mx = 0, my = 0;
        if (keys["ArrowUp"] || keys["w"]) my -= 1; if (keys["ArrowDown"] || keys["s"]) my += 1;
        if (keys["ArrowLeft"] || keys["a"]) mx -= 1; if (keys["ArrowRight"] || keys["d"]) mx += 1;
        if (mx !== 0 || my !== 0) {
            ship.x += mx * 4; ship.y += my * 4;
            let targetA = Math.atan2(my, mx); let da = targetA - ship.a;
            while (da < -Math.PI) da += Math.PI * 2; while (da > Math.PI) da -= Math.PI * 2;
            ship.a += da * 0.2;
        }
        if (ship.x < ship.r) ship.x = ship.r; if (ship.x > world.width - ship.r) ship.x = world.width - ship.r;
        if (ship.y < ship.r) ship.y = ship.r; if (ship.y > world.height - ship.r) ship.y = world.height - ship.r;

        // Bullets (Reverse Loop)
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i]; b.x += b.vx; b.y += b.vy; b.life--;
            if (b.life <= 0) bullets.splice(i, 1);
        }

        // Asteroids (Reverse Loop)
        for (let i = asteroids.length - 1; i >= 0; i--) {
            let a = asteroids[i]; a.x += a.vx; a.y += a.vy; a.rot += a.rotV;
            if (a.x < -a.r) a.x = world.width + a.r; if (a.x > world.width + a.r) a.x = -a.r;
            if (a.y < -a.r) a.y = world.height + a.r; if (a.y > world.height + a.r) a.y = -a.r;

            let hit = false;
            for (let j = bullets.length - 1; j >= 0; j--) {
                let b = bullets[j]; let dx = a.x - b.x, dy = a.y - b.y;
                if (Math.sqrt(dx * dx + dy * dy) < a.r) {
                    let particleColor = "#fff";
                    if (a.type === 2) { particleColor = "#ff6600"; createHazard(a.x, a.y); }
                    if (a.type === 3) particleColor = "#e100ff";

                    createExplosion(a.x, a.y, particleColor, a.level * 5);
                    createFloatingText(a.x, a.y, "+" + (a.level * 100));
                    shake = a.level * 4; score += a.level * 100; scoreFlash = 1.0;
                    if (a.level > 1) { for (let k = 0; k < 2; k++) spawnAsteroid(a.x, a.y, a.r * 0.6, a.level - 1); }
                    asteroids.splice(i, 1); bullets.splice(j, 1);
                    hit = true; break;
                }
            }
            if (hit) continue;

            let sdx = a.x - ship.x, sdy = a.y - ship.y;
            if (Math.sqrt(sdx * sdx + sdy * sdy) < a.r + ship.r - 10) {
                createExplosion(ship.x, ship.y, "#00f2ff", 40); shake = 30; gameOver = true;
            }
        }
        
        // Hazards Logic (Expanding Waves - Smooth Dissipation)
        for (let i = hazards.length - 1; i >= 0; i--) {
            let h = hazards[i];
            h.r += h.speed;
            h.life -= 0.015; // Slower, smoother fade
            
            let hdx = h.x - ship.x, hdy = h.y - ship.y;
            let dist = Math.sqrt(hdx*hdx + hdy*hdy);
            
            // Collision with expanding edge
            if (h.life > 0.2 && Math.abs(dist - h.r) < 15) {
                gameOver = true;
            }
            
            if (h.life <= 0) hazards.splice(i, 1);
        }

        // Maintain Asteroid Population
        while (asteroids.length < asteroidCount) spawnAsteroid();

        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.02;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            let ft = floatingTexts[i]; ft.y -= 1; ft.life -= 0.02;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }
    }

    // Drawing
    hazards.forEach(h => {
        ctx.save(); ctx.globalAlpha = h.life; ctx.strokeStyle = "#ff6600";
        ctx.lineWidth = h.life * 5; // Gets thinner as it fades
        ctx.shadowBlur = 15 * h.life; ctx.shadowColor = "#ff6600";
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
    });

    if (!gameOver) {
        ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.a + Math.PI);
        ctx.shadowBlur = 15; ctx.shadowColor = "#00f2ff";
        ctx.drawImage(shipReady, -ship.r, -ship.r, ship.r * 2, ship.r * 2);
        ctx.restore();
    }
    bullets.forEach(b => { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); });
    asteroids.forEach(a => {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
        
        let img = astReady;
        if (a.type === 2) img = ast2Ready;
        if (a.type === 3) img = ast3Ready;

        if (a.type === 3) {
            ctx.shadowBlur = 15; ctx.shadowColor = "#e100ff";
            if (Math.random() > 0.8) createExplosion(a.x, a.y, "#e100ff", 1);
        }

        // Support both Image and Canvas (from removeBlack)
        if (img) {
            ctx.drawImage(img, -a.r, -a.r, a.r * 2, a.r * 2);
        } else {
            // High-visibility geometric fallback
            ctx.fillStyle = (a.type === 2) ? "#ff4400" : ((a.type === 3) ? "#aa00ff" : "#555");
            ctx.beginPath(); ctx.arc(0, 0, a.r, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    });
    particles.forEach(p => {
        ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size); ctx.restore();
    });
    floatingTexts.forEach(ft => {
        ctx.save(); ctx.globalAlpha = ft.life; ctx.fillStyle = "#fff";
        ctx.font = "bold 20px sans-serif"; ctx.fillText(ft.text, ft.x, ft.y); ctx.restore();
    });

    // --- 4. LOGIC UPDATES ---
    if (!gameOver && gameStarted && !isPaused) {
        if (score >= 10000 && currentStage < 2) { 
            currentStage = 2; stageFlash = 1.0; 
            asteroids = []; for (let i = 0; i < asteroidCount; i++) spawnAsteroid();
        }
        if (score >= 30000 && currentStage < 3) { 
            currentStage = 3; stageFlash = 1.0; 
            asteroids = []; for (let i = 0; i < asteroidCount; i++) spawnAsteroid();
        }
    }

    // --- 5. UI LAYER (SCREEN SPACE) ---
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);

    // Overlays (Drawn BEFORE HUD so they don't cover the score)
    if (isPaused) {
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.fillStyle = "#fff"; ctx.font = "900 60px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("DURAKLATILDI", window.innerWidth / 2, window.innerHeight / 2);
    }
    if (gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.fillStyle = "#ff0077"; ctx.font = "900 60px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("OYUN BİTTİ", window.innerWidth / 2, window.innerHeight / 2);
    }

    if (stageFlash > 0) {
        ctx.save(); ctx.globalAlpha = stageFlash; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "900 60px sans-serif";
        let msg = (currentStage === 2) ? "STAGE 2: MOLTEN SECTOR" : "STAGE 3: CRYSTAL NEBULA";
        ctx.shadowBlur = 30; ctx.shadowColor = (currentStage === 2) ? "#ff6600" : "#e100ff";
        ctx.fillText(msg, window.innerWidth / 2, window.innerHeight / 2);
        ctx.restore(); stageFlash -= 0.005;
    }

    // Score Logic
    if (displayScore < score) displayScore += Math.ceil((score - displayScore) * 0.1);
    else if (displayScore > score) displayScore = score;
    if (score > highScore) { highScore = score; localStorage.setItem("asteroid_highScore", highScore); }

    // HUD (Drawn LAST with absolute coordinates)
    ctx.save();
    ctx.textAlign = "left"; // Force left align to prevent shifting
    ctx.shadowBlur = scoreFlash * 20; ctx.shadowColor = "#00f2ff";
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "900 14px sans-serif"; ctx.fillText("SCORE", 40, 50);
    ctx.fillStyle = "#fff"; ctx.font = "900 42px sans-serif"; ctx.fillText(displayScore.toLocaleString(), 40, 95);
    ctx.fillStyle = "rgba(255, 215, 0, 0.6)"; ctx.font = "900 14px sans-serif"; ctx.fillText("BEST: " + parseInt(highScore).toLocaleString(), 40, 120);
    ctx.restore();
    if (scoreFlash > 0) scoreFlash -= 0.05;
}

function restartGame() {
    score = 0; displayScore = 0; asteroids = []; bullets = []; particles = []; floatingTexts = [];
    hazards = []; // Clear Stage 2 hazards
    currentStage = 1; gameOver = false; ship.x = 1000; ship.y = 700;
    for (let i = 0; i < asteroidCount; i++) spawnAsteroid();
}

// SYNC UI
function syncMenuUI() {
    if (document.getElementById("menu-highscore")) {
        document.getElementById("menu-highscore").innerText = parseInt(highScore).toLocaleString();
    }
}
syncMenuUI();

update();

// START
const startBtn = document.getElementById("start-btn");
if (startBtn) {
    startBtn.onclick = () => {
        gameStarted = true;
        document.getElementById("entry-screen").classList.add("hidden");
        // Update highscore one last time before start
        syncMenuUI();
    };
}

function togglePause() {
    if (!gameOver && gameStarted) isPaused = !isPaused;
}