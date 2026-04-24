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
function removeBackground(img, tint) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cctx = c.getContext("2d");
    cctx.drawImage(img, 0, 0);
    const data = cctx.getImageData(0, 0, c.width, c.height);
    const centerX = c.width / 2;
    const centerY = c.height / 2;
    const radius = Math.min(c.width, c.height) * 0.5;

    for (let i = 0; i < data.data.length; i += 4) {
        const x = (i / 4) % c.width;
        const y = Math.floor((i / 4) / c.width);
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        let r = data.data[i], g = data.data[i + 1], b = data.data[i + 2];

        // Recolor logic for clones
        if (tint === 'red') {
            data.data[i] = b; data.data[i + 1] = g * 0.5; data.data[i + 2] = r * 0.5;
            r = data.data[i]; g = data.data[i + 1]; b = data.data[i + 2];
        } else if (tint === 'green') {
            data.data[i] = r * 0.5; data.data[i + 1] = b; data.data[i + 2] = g * 0.5;
            r = data.data[i]; g = data.data[i + 1]; b = data.data[i + 2];
        }

        const isGray = Math.abs(r - g) < 15 && Math.abs(g - b) < 15;
        const isGrid = isGray && r > 100 && r < 230; // Checkered grays
        const isWhite = r > 220 && g > 220 && b > 220; // Pure whites
        const isBlack = r < 40 && g < 40 && b < 40; // Deep blacks
        
        const isBackground = isBlack || isGrid || isWhite;

        // Tightened radius to clip the grid, but more generous for bosses
        const tightRadius = radius * 0.96;

        if (dist > tightRadius || isBackground) {
            data.data[i + 3] = 0;
        } else if (dist > tightRadius * 0.95) {
            data.data[i + 3] *= (tightRadius - dist) / (tightRadius * 0.05);
        }
    }
    cctx.putImageData(data, 0, 0);
    return c;
}

// ASSETS
let loaded = 0;
const shipAssets = [];
let currentShipIndex = 0;
const shipSources = [
    { src: "assets/ship.png", tint: null },
    { src: "assets/ship.png", tint: "red" },
    { src: "assets/ship.png", tint: "green" },
    { src: "assets/ship_phoenix.png", tint: null },
    { src: "assets/ship_vanguard.png", tint: null }
];

const shipConfig = [
    { color: "#00f2ff", bulletColor: "#00f2ff", trail: "plasma", baseSpeed: 2, baseFireRate: 280, baseDamage: 1, name: "ALPHA DEFAULT" },
    { color: "#ff3333", bulletColor: "#ff3333", trail: "plasma", baseSpeed: 2.1, baseFireRate: 280, baseDamage: 1, name: "ALPHA RED" },
    { color: "#33ff33", bulletColor: "#33ff33", trail: "plasma", baseSpeed: 2.1, baseFireRate: 280, baseDamage: 1, name: "ALPHA GREEN" },
    { color: "#ff6600", bulletColor: "#ffaa00", trail: "fire", baseSpeed: 3, baseFireRate: 210, baseDamage: 1.2, name: "PHOENIX RED" },
    { color: "#888", bulletColor: "#fff", trail: "mech", baseSpeed: 1.5, baseFireRate: 450, baseDamage: 2.5, name: "VANGUARD PRO" }
];

const shipOffsets = [Math.PI, Math.PI, Math.PI, Math.PI / 2, 0];

const upgradeCosts = {
    fireRate: [500, 1000, 2000, 4000, 8000],
    speed: [750, 1500, 3000, 6000, 12000],
    damage: [1200, 2400, 4800, 9600, 19200],
    magnet: [2500, 5000, 10000, 20000, 40000]
};

const astImg = new Image();
const ast2Img = new Image();
const ast3Img = new Image();
const bgImg = new Image();

let astReady, ast2Ready, ast3Ready;
const upgradeTypes = ['fireRate', 'speed', 'damage', 'magnet'];

// Load all ships
shipSources.forEach((ship, index) => {
    const img = new Image();
    img.src = ship.src;
    img.onload = () => { shipAssets[index] = removeBackground(img, ship.tint); loaded++; };
    img.onerror = () => { console.error("Failed to load ship:", ship.src); loaded++; };
});

astImg.src = "assets/asteroid.png";
ast2Img.src = "assets/molten_asteroid.png";
ast3Img.src = "assets/crystal_asteroid.png";
bgImg.src = "assets/bg.png";

astImg.onload = () => { astReady = removeBackground(astImg); loaded++; };
ast2Img.onload = () => { ast2Ready = removeBackground(ast2Img); loaded++; };
ast3Img.onload = () => { ast3Ready = removeBackground(ast3Img); loaded++; };
bgImg.onload = () => loaded++;

astImg.onerror = ast2Img.onerror = ast3Img.onerror = bgImg.onerror = (e) => {
    console.error("Failed to load asset:", e.target.src);
    loaded++;
};

// GAME STATE
let gameStarted = false;
let world = { width: 2000, height: 1400 };
let ship = { x: 1000, y: 700, a: 0, r: 25, lastFire: 0, invulnerable: 0 };
let bullets = [];
let asteroids = [];
let particles = [];
let coins = [];
let hazards = [];
let floatingTexts = [];
let score = 0;
let displayScore = 0;
let scoreFlash = 0;
let highScore = localStorage.getItem("asteroid_highScore") || 0;
let currentStage = 1;
let stageFlash = 0;
let isPaused = false;
let cam = { x: 0, y: 0 };
let shake = 0;
let joystick = { active: false, dx: 0, dy: 0, angle: 0, dist: 0, maxDist: 75 };
let isMobileFiring = false;
let deathReason = "";
let adminActionTime = 0;
let userCredits = parseInt(localStorage.getItem("asteroid_credits")) || 0;
let userEnergy = parseInt(localStorage.getItem("asteroid_energy"));
if (isNaN(userEnergy) || userEnergy <= 0) {
    userEnergy = 50;
    localStorage.setItem("asteroid_energy", 50);
}
let lastLoginDate = localStorage.getItem("asteroid_last_login") || "";
let loginStreak = parseInt(localStorage.getItem("asteroid_login_streak")) || 0;

const DAILY_REWARDS = [100, 250, 500, 750, 1000, 1500, 3000];
const MAX_ENERGY = 50;
const ENERGY_COST = 5;
let upgrades = JSON.parse(localStorage.getItem("asteroid_upgrades")) || {
    fireRate: 0,
    speed: 0,
    damage: 0,
    magnet: 0
};

// FORCE RESET FOR TESTING (User Request)
upgrades = { fireRate: 0, speed: 0, damage: 0, magnet: 0 };
userCredits = 10000; // Give some test credits
localStorage.setItem("asteroid_upgrades", JSON.stringify(upgrades));
localStorage.setItem("asteroid_credits", userCredits);

const bossImages = {
    1: { src: "assets/boss_mothership.png", ready: null },
    2: { src: "assets/boss_lava.png", ready: null },
    3: { src: "assets/boss_crystal.png", ready: null }
};

// Initialize Boss Images
Object.keys(bossImages).forEach(key => {
    const img = new Image();
    img.src = bossImages[key].src;
    img.onload = () => bossImages[key].ready = removeBackground(img);
});

// INITIALIZE DAILY LOGIN
function checkDailyLogin() {
    const today = new Date().toDateString();
    if (lastLoginDate !== today) {
        // New day login
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastLoginDate === yesterday.toDateString()) {
            loginStreak = (loginStreak + 1) % 7;
        } else {
            loginStreak = 0;
        }

        lastLoginDate = today;
        localStorage.setItem("asteroid_last_login", lastLoginDate);
        localStorage.setItem("asteroid_login_streak", loginStreak);

        // Show reward modal
        setTimeout(() => {
            if (window.openModal) openModal('daily');
        }, 1000);
    }
}

window.claimDailyReward = function () {
    const reward = DAILY_REWARDS[loginStreak];
    userCredits += reward;
    localStorage.setItem("asteroid_credits", userCredits);
    closeModal('daily');
    syncMenuUI();
    if (window.showToast) window.showToast(`Günün ödülü alındı: ${reward} 🪙`, "success");
};

window.refillEnergy = function () {
    // Simulated Ad
    if (window.showToast) window.showToast("Reklam İzleniyor...", "success");
    setTimeout(() => {
        userEnergy = MAX_ENERGY;
        localStorage.setItem("asteroid_energy", userEnergy);
        syncMenuUI();
        if (window.showToast) window.showToast("Enerji Fullendi! ⚡", "success");
    }, 2000);
};

checkDailyLogin();

// BULLET TYPES
const bulletTypes = [
    { name: "ORIGIN", color: null, trail: null, glow: null, size: null },
    { name: "CLASSIC", color: "#00f2ff", trail: "plasma", glow: "#00f2ff", size: 4 },
    { name: "PLASMA", color: "#e100ff", trail: "fire", glow: "#e100ff", size: 6 },
    { name: "VORTEX", color: "#33ff33", trail: "plasma", glow: "#33ff33", size: 5 }
];
let currentBulletIndex = parseInt(localStorage.getItem("asteroid_bulletIndex")) || 0;

window.buyBullet = function (index, cost) {
    if (userCredits >= cost) {
        // If it's already owned, just select it
        userCredits -= cost;
        currentBulletIndex = index;
        localStorage.setItem("asteroid_credits", userCredits);
        localStorage.setItem("asteroid_bulletIndex", currentBulletIndex);
        syncMenuUI();
        return true;
    } else {
        alert("Yetersiz Coin!");
        return false;
    }
};

window.buyCoins = function (amount) {
    userCredits += amount;
    localStorage.setItem("asteroid_credits", userCredits);
    syncMenuUI();
    if (window.showToast) window.showToast(amount.toLocaleString() + " Coin Başarıyla Eklendi!", "success");
};

// (Deleted old spawnBoss version - replaced by consolidated one below)

// MISSION TRACKING
let missionProgress = JSON.parse(localStorage.getItem("asteroid_missions")) || {};
if (!missionProgress.asteroidsDestroyed) missionProgress.asteroidsDestroyed = 0;
if (!missionProgress.coinsCollected) missionProgress.coinsCollected = 0;
if (!missionProgress.totalScore) missionProgress.totalScore = 0;
if (!missionProgress.claimed) missionProgress.claimed = {};
if (!missionProgress.resetTimes) missionProgress.resetTimes = {};

// ACHIEVEMENT TRACKING
const achievementList = [
    { id: "score10k", name: "Rookie Pilot", desc: "10,000 skora ulaş", target: 10000, key: "highScore" },
    { id: "boss1", name: "Mothership Down", desc: "İlk Boss'u yok et", target: 1, key: "bossKills" },
    { id: "coins5k", name: "Treasure Hunter", desc: "Toplam 5,000 coin topla", target: 5000, key: "totalCoins" },
    { id: "stage2", name: "Molten Traveler", desc: "Stage 2'ye ulaş", target: 2, key: "maxStage" }
];
let userAchievements = JSON.parse(localStorage.getItem("asteroid_achievements")) || {
    bossKills: 0,
    totalCoins: 0,
    maxStage: 1
};
if (!localStorage.getItem("asteroid_achievements_done")) {
    localStorage.setItem("asteroid_achievements_done", JSON.stringify({}));
}
let achievementsDone = JSON.parse(localStorage.getItem("asteroid_achievements_done"));

function checkAchievements() {
    let changed = false;
    achievementList.forEach(a => {
        if (!achievementsDone[a.id]) {
            let currentVal = 0;
            if (a.key === "highScore") currentVal = highScore;
            else currentVal = userAchievements[a.key] || 0;

            if (currentVal >= a.target) {
                achievementsDone[a.id] = true;
                changed = true;
                createFloatingText(ship.x, ship.y, "🏆 BAŞARI: " + a.name, "#ffd700");
            }
        }
    });
    if (changed) {
        localStorage.setItem("asteroid_achievements_done", JSON.stringify(achievementsDone));
    }
}

const missionTargets = {
    'm-ast': { key: 'asteroidsDestroyed', target: 1000, reward: 5000, title: "Uzay Kurdu" },
    'm-coin': { key: 'coinsCollected', target: 5000, reward: 2500, title: "Hazine Avcısı" },
    'm-score': { key: 'totalScore', target: 100000, reward: 10000, title: "Efsane Pilot" }
};

function updateMission(key, amount = 1) {
    missionProgress[key] += amount;
    localStorage.setItem("asteroid_missions", JSON.stringify(missionProgress));
    syncMenuUI();
}

function spawnCoin(x, y, value) {
    coins.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        value: value,
        life: 1.0
    });
}

// SPAWN
function spawnAsteroid(x, y, r = 50, level = 3) {
    const angle = Math.random() * Math.PI * 2;
    // Speed scales with stage
    let speedMult = currentStage === 2 ? 1.0 : (currentStage === 3 ? 1.7 : 1.0);
    const speed = ((4 - level) * 0.3 + Math.random() * 0.5) * speedMult;

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

const bossConfigs = {
    1: { name: "VOID MOTHERSHIP", hp: 1000, color: "#00f2ff", r: 100 },
    2: { name: "MAGMA TITAN", hp: 2500, color: "#ff6600", r: 120 },
    3: { name: "CRYSTAL MONARCH", hp: 5000, color: "#e100ff", r: 150 }
};

function spawnBoss(type = 1) {
    const config = bossConfigs[type];
    if (!config) return;
    boss = {
        type: type,
        name: config.name,
        color: config.color,
        x: world.width / 2,
        y: -200,
        r: config.r,
        hp: config.hp,
        maxHp: config.hp,
        a: 0,
        vx: 0,
        vy: 2,
        attackTimer: 0
    };
    asteroids = [];
    bullets = [];
    stageFlash = 1.0;
    // Give player a brief invulnerability when boss spawns
    ship.invulnerable = Date.now() + 2000;
}

// Initial Spawn
const asteroidCount = Math.floor((world.width * world.height) / 60000);
function initAsteroids() {
    for (let i = 0; i < asteroidCount; i++) spawnAsteroid();
}
initAsteroids();

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
    if (gameOver) {
        if (Date.now() - adminActionTime < 1000) return;
        restartGame(); return;
    }
    const t = e.touches[0];
    touch.active = true;
    touch.x = t.clientX;
    touch.y = t.clientY;
}, { passive: false });
canvas.addEventListener("touchmove", e => { e.preventDefault(); const t = e.touches[0]; touch.x = t.clientX; touch.y = t.clientY; }, { passive: false });
canvas.addEventListener("touchend", e => { e.preventDefault(); touch.active = false; }, { passive: false });

canvas.addEventListener("mousedown", e => {
    if (gameOver) {
        if (Date.now() - adminActionTime < 1000) return;
        restartGame(); return;
    }
    mouse.active = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});
canvas.addEventListener("mousemove", e => { if (!mouse.active) return; mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener("mouseup", () => { mouse.active = false; });

window.addEventListener("keydown", e => {
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        togglePause();
        return;
    }
    if (gameOver) {
        if (Date.now() - adminActionTime < 1000) return;
        restartGame(); return;
    }
    keys[e.key] = true;
    if (e.key === " ") shoot();
});
window.addEventListener("keyup", e => { keys[e.key] = false; });

// SHOOT
function shoot() {
    if (!gameStarted || isPaused) return;
    const config = shipConfig[currentShipIndex] || shipConfig[0];

    const fireOne = (lateralOffset = 0) => {
        const forwardOffset = 30;
        const lx = Math.cos(ship.a + Math.PI / 2) * lateralOffset;
        const ly = Math.sin(ship.a + Math.PI / 2) * lateralOffset;

        let bStyle = bulletTypes[currentBulletIndex] || bulletTypes[1];
        if (bStyle.name === "ORIGIN") {
            const shipBase = shipConfig[currentShipIndex] || shipConfig[0];
            bStyle = {
                color: shipBase.bulletColor,
                trail: shipBase.trail,
                glow: shipBase.bulletColor,
                size: (shipBase.trail === 'mech') ? 4 : 4
            };
        }

        bullets.push({
            x: ship.x + Math.cos(ship.a) * forwardOffset + lx,
            y: ship.y + Math.sin(ship.a) * forwardOffset + ly,
            vx: Math.cos(ship.a) * 11,
            vy: Math.sin(ship.a) * 11,
            life: 70,
            type: bStyle.trail,
            color: bStyle.color,
            glow: bStyle.glow,
            size: bStyle.size * (1 + upgrades.damage * 0.2)
        });
        shake = 3;
    };

    if (currentShipIndex === 4) {
        // VANGUARD SPECIAL: Twin Cannons (Side-by-side)
        fireOne(-12);
        fireOne(12);
    } else {
        fireOne(0);
        // PHOENIX SPECIAL: Double Shot (Sequential)
        if (currentShipIndex === 3) {
            setTimeout(() => fireOne(0), 100);
        }
    }
}

// LOOP
function update() {
    requestAnimationFrame(update);
    if (!gameStarted) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    // --- 1. RESET & CLEAR ---
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#05050a"; // Solid space black
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

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
        // --- STAT CALCULATION ---
        const base = shipConfig[currentShipIndex] || shipConfig[0];
        ship.maxSpeed = base.baseSpeed + (upgrades.speed * 0.4);
        ship.fireDelay = base.baseFireRate - (upgrades.fireRate * 35);
        if (ship.fireDelay < 80) ship.fireDelay = 80;
        ship.damage = base.baseDamage + (upgrades.damage * 0.5);

        // Input Handling
        if (joystick.active) {
            ship.a = joystick.angle;
            let speed = (joystick.dist / joystick.maxDist) * ship.maxSpeed;
            ship.x += Math.cos(ship.a) * speed;
            ship.y += Math.sin(ship.a) * speed;
        } else if (touch.active || mouse.active) {
            let ix = touch.active ? touch.x : mouse.x; let iy = touch.active ? touch.y : mouse.y;
            let dx = (ix + cam.x) - ship.x; let dy = (iy + cam.y) - ship.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                let vx = dx * 0.1;
                let vy = dy * 0.1;
                let s = Math.sqrt(vx * vx + vy * vy);
                if (s > ship.maxSpeed) {
                    vx = (vx / s) * ship.maxSpeed;
                    vy = (vy / s) * ship.maxSpeed;
                }
                ship.x += vx;
                ship.y += vy;
                ship.a = Math.atan2(dy, dx);
            }
        }
        
        // Firing Logic
        if (keys[" "] || isMobileFiring) {
            if (Date.now() - (ship.lastFire || 0) > ship.fireDelay) {
                shoot();
                ship.lastFire = Date.now();
            }
        }

        let mx = 0, my = 0;
        if (keys["ArrowUp"] || keys["w"]) my -= 1; if (keys["ArrowDown"] || keys["s"]) my += 1;
        if (keys["ArrowLeft"] || keys["a"]) mx -= 1; if (keys["ArrowRight"] || keys["d"]) mx += 1;
        if (mx !== 0 || my !== 0) {
            const mag = Math.sqrt(mx * mx + my * my);
            ship.x += (mx / mag) * ship.maxSpeed;
            ship.y += (my / mag) * ship.maxSpeed;
            let targetA = Math.atan2(my, mx); let da = targetA - ship.a;
            while (da < -Math.PI) da += Math.PI * 2; while (da > Math.PI) da -= Math.PI * 2;
            ship.a += da * 0.2;
        }
        if (touch.active || mouse.active || keys["ArrowUp"] || keys["w"] || keys["ArrowDown"] || keys["s"] || keys["ArrowLeft"] || keys["a"] || keys["ArrowRight"] || keys["d"]) {
            // ENGINE PARTICLES
            const pCount = (base.trail === 'fire') ? 3 : 1;
            for (let i = 0; i < pCount; i++) {
                const pAngle = ship.a + Math.PI + (Math.random() - 0.5) * 0.5;
                const pSpeed = Math.random() * 3 + 2;
                particles.push({
                    x: ship.x - Math.cos(ship.a) * 20,
                    y: ship.y - Math.sin(ship.a) * 20,
                    vx: Math.cos(pAngle) * pSpeed,
                    vy: Math.sin(pAngle) * pSpeed,
                    life: 0.5 + Math.random() * 0.5,
                    color: base.color,
                    size: (base.trail === 'fire') ? Math.random() * 6 + 2 : Math.random() * 3 + 1,
                    type: base.trail
                });
            }
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
                    spawnCoin(a.x, a.y, a.r > 30 ? 5 : 2);
                    updateMission('asteroidsDestroyed', 1);
                    updateMission('totalScore', a.level * 100);
                    if (a.level > 1) { for (let k = 0; k < 2; k++) spawnAsteroid(a.x, a.y, a.r * 0.6, a.level - 1); }
                    asteroids.splice(i, 1); bullets.splice(j, 1);
                    hit = true; break;
                }
            }
            if (hit) continue;

            let sdx = a.x - ship.x, sdy = a.y - ship.y;
            const isInvulnerable = ship.invulnerable && Date.now() < ship.invulnerable;
            if (!isInvulnerable && Math.sqrt(sdx * sdx + sdy * sdy) < a.r + ship.r - 10) {
                createExplosion(ship.x, ship.y, "#00f2ff", 40); shake = 30; 
                gameOver = true; deathReason = "ASTEROID COLLISION";
            }
        }

        // Hazards Logic (Expanding Waves - Smooth Dissipation)
        for (let i = hazards.length - 1; i >= 0; i--) {
            let h = hazards[i];
            h.r += h.speed;
            h.life -= 0.015; // Slower, smoother fade

            let hdx = h.x - ship.x, hdy = h.y - ship.y;
            let dist = Math.sqrt(hdx * hdx + hdy * hdy);

            // Collision with expanding edge
            const isInvulnerable = ship.invulnerable && Date.now() < ship.invulnerable;
            if (!isInvulnerable && h.life > 0.2 && Math.abs(dist - h.r) < 15) {
                gameOver = true; deathReason = "HAZARD (STAGE 2)";
            }

            if (h.life <= 0) hazards.splice(i, 1);
        }

        // No need for regular spawning here if we move it to Logic Updates
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.02;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            let ft = floatingTexts[i]; ft.y += ft.vy; ft.life -= 0.02;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }

        // --- COIN LOGIC ---
        const magnetRange = 150 + (upgrades.magnet * 80);
        coins.forEach((c, idx) => {
            c.x += c.vx; c.y += c.vy;
            c.vx *= 0.98; c.vy *= 0.98; // Friction

            const dx = ship.x - c.x;
            const dy = ship.y - c.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < magnetRange) {
                // Pull to ship
                const pull = 0.5 + (upgrades.magnet * 0.2);
                c.vx += (dx / dist) * pull;
                c.vy += (dy / dist) * pull;
            }

            if (dist < ship.r + 10) {
                userCredits += c.value;
                userAchievements.totalCoins += c.value;
                localStorage.setItem("asteroid_credits", userCredits);
                localStorage.setItem("asteroid_achievements", JSON.stringify(userAchievements));

                updateMission('coinsCollected', c.value);
                floatingTexts.push({ x: c.x, y: c.y, vx: 0, vy: -2, text: "+" + c.value, life: 1.0 });
                coins.splice(idx, 1);
                checkAchievements();
            }
        });
    }

    // Drawing
    hazards.forEach(h => {
        ctx.save(); ctx.globalAlpha = h.life; ctx.strokeStyle = "#ff6600";
        ctx.lineWidth = h.life * 5; // Gets thinner as it fades
        ctx.shadowBlur = 15 * h.life; ctx.shadowColor = "#ff6600";
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    });

    if (!gameOver) {
        ctx.save(); ctx.translate(ship.x, ship.y);
        const offset = (typeof shipOffsets[currentShipIndex] !== 'undefined') ? shipOffsets[currentShipIndex] : Math.PI;
        ctx.rotate(ship.a + offset);
        
        // Invulnerability Blink
        if (ship.invulnerable && Date.now() < ship.invulnerable) {
            ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.02) * 0.3;
        }

        ctx.shadowBlur = 8; ctx.shadowColor = "#00f2ff";
        const currentShip = shipAssets[currentShipIndex] || shipAssets[0];
        if (currentShip) ctx.drawImage(currentShip, -ship.r, -ship.r, ship.r * 2, ship.r * 2);
        ctx.restore();
    }
    bullets.forEach(b => {
        ctx.save();
        ctx.shadowBlur = 10; ctx.shadowColor = b.glow || b.color;
        if (b.type === 'fire') {
            const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size * 1.5);
            grad.addColorStop(0, "#fff"); grad.addColorStop(0.4, b.color); grad.addColorStop(1, "transparent");
            ctx.fillStyle = grad;
        } else if (b.type === 'mech') {
            ctx.fillStyle = "#fff";
            ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
            ctx.fillRect(-6, -2, 12, 4);
        } else {
            ctx.fillStyle = b.color;
        }

        if (b.type !== 'mech') {
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size || 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    });

    if (boss) {
        ctx.save();
        ctx.translate(boss.x, boss.y);
        ctx.rotate(boss.a);
        ctx.shadowBlur = 40; ctx.shadowColor = boss.color;
        const bImg = bossImages[boss.type].ready;
        if (bImg) {
            ctx.drawImage(bImg, -boss.r, -boss.r, boss.r * 2, boss.r * 2);
        } else {
            ctx.fillStyle = boss.color;
            ctx.beginPath(); ctx.arc(0, 0, boss.r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.stroke();
        }
        ctx.restore();
    }

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
            ctx.beginPath(); ctx.arc(0, 0, a.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    });
    particles.forEach(p => {
        ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        if (p.type === 'fire') {
            ctx.shadowBlur = 15; ctx.shadowColor = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
        } else if (p.type === 'mech') {
            ctx.fillRect(p.x, p.y, p.size, p.size);
            if (Math.random() > 0.8) { // Occasional spark
                ctx.fillStyle = "#fff"; ctx.fillRect(p.x, p.y, 2, 2);
            }
        } else {
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.restore();
    });

    // --- DRAW COINS ---
    coins.forEach(c => {
        ctx.save();
        ctx.shadowBlur = 15; ctx.shadowColor = "#ffd700";
        ctx.fillStyle = "#ffd700";
        ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.fill();
        // Inner detail
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(c.x, c.y, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    });
    floatingTexts.forEach(ft => {
        ctx.save(); ctx.globalAlpha = ft.life; ctx.fillStyle = "#fff";
        ctx.font = "bold 20px sans-serif"; ctx.fillText(ft.text, ft.x, ft.y); ctx.restore();
    });

    // --- 4. LOGIC UPDATES ---
    if (!gameOver && gameStarted && !isPaused) {
        // REGULAR ASTEROID SPAWNING
        if (!boss && asteroids.length < asteroidCount) {
            spawnAsteroid();
        }

        // Stage Transitions
        if (score >= 10000 && currentStage === 1 && !boss) {
            spawnBoss();
        }

        if (boss) {
            // Boss Logic
            const dx = ship.x - boss.x;
            const dy = ship.y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            boss.vx += (dx / dist) * 0.02;
            boss.vy += (dy / dist) * 0.02;
            boss.vx *= 0.98; boss.vy *= 0.98;
            boss.x += boss.vx; boss.y += boss.vy;
            boss.a += 0.01;

            boss.attackTimer++;
            if (boss.attackTimer > 300) {
                if (asteroids.length < 40) { // PERFORMANCE LIMIT
                    for (let i = 0; i < 3; i++) {
                        const offset = (i - 1) * 0.4;
                        const ang = Math.atan2(dy, dx) + offset;
                        asteroids.push({
                            x: boss.x + Math.cos(ang) * boss.r,
                            y: boss.y + Math.sin(ang) * boss.r,
                            vx: Math.cos(ang) * 1.2,
                            vy: Math.sin(ang) * 1.2,
                            r: 25,
                            rot: Math.random() * Math.PI * 2,
                            vrot: Math.random() * 0.1 - 0.05,
                            level: 1,
                            type: boss.type
                        });
                    }
                }
                boss.attackTimer = 0;
            }


            bullets.forEach((b, bIdx) => {
                const bdx = b.x - boss.x;
                const bdy = b.y - boss.y;
                if (Math.sqrt(bdx * bdx + bdy * bdy) < boss.r) {
                    boss.hp -= (ship.damage || 1);
                    bullets.splice(bIdx, 1);
                    createExplosion(b.x, b.y, "#00f2ff", 5);

                    if (boss.hp <= 0) {
                        createExplosion(boss.x, boss.y, "#fff", 50);
                        score += 5000 * boss.type;
                        userCredits += 1000 * boss.type;
                        userAchievements.bossKills++;
                        localStorage.setItem("asteroid_achievements", JSON.stringify(userAchievements));

                        if (boss.type === 1) {
                            currentStage = 2;
                            userAchievements.maxStage = Math.max(userAchievements.maxStage, 2);
                        } else if (boss.type === 2) {
                            currentStage = 3;
                            userAchievements.maxStage = Math.max(userAchievements.maxStage, 3);
                        } else {
                            // Victory?
                        }

                        boss = null;
                        stageFlash = 1.0;
                        asteroids = [];
                        checkAchievements();
                    }
                }
            });

            const isInvulnerable = ship.invulnerable && Date.now() < ship.invulnerable;
            if (!isInvulnerable && dist < boss.r + ship.r) {
                gameOver = true; deathReason = "BOSS COLLISION";
            }
        }

        // Stage 3 Transition (Higher threshold)
        if (score >= 20000 && currentStage === 2 && !boss) {
            spawnBoss(2); // Boss for Stage 2 -> 3
        }

        if (score >= 40000 && currentStage === 3 && !boss) {
            spawnBoss(3); // Final Boss for Stage 3
        }
    }

    // --- 5. UI LAYER (SCREEN SPACE) ---
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Overlays (Drawn BEFORE HUD so they don't cover the score)
    if (isPaused) {
        // Now handled by HTML overlay
    }
    if (gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.fillStyle = "#ff0077"; ctx.font = "900 60px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("OYUN BİTTİ", window.innerWidth / 2, window.innerHeight / 2);
        ctx.fillStyle = "#fff"; ctx.font = "900 14px sans-serif";
        ctx.fillText("REASON: " + deathReason, window.innerWidth / 2, window.innerHeight / 2 + 50);
    }

    if (stageFlash > 0) {
        ctx.save(); ctx.globalAlpha = stageFlash; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "900 60px sans-serif";
        let msg = "";
        let sColor = "#fff";

        if (boss) {
            msg = "WARNING: " + boss.name;
            sColor = boss.color;
        } else {
            if (currentStage === 1) msg = "STAGE 1: DEEP SPACE";
            else if (currentStage === 2) { msg = "STAGE 2: MOLTEN SECTOR"; sColor = "#ff6600"; }
            else { msg = "STAGE 3: CRYSTAL NEBULA"; sColor = "#e100ff"; }
        }

        ctx.shadowBlur = 30; ctx.shadowColor = sColor;
        ctx.fillText(msg, window.innerWidth / 2, window.innerHeight / 2);
        ctx.restore(); stageFlash -= 0.005;
    }

    // Boss Health Bar
    if (boss) {
        const barW = 400; const barH = 10;
        const bx = window.innerWidth / 2 - barW / 2;
        const by = 40;
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = boss.color; ctx.fillRect(bx, by, (boss.hp / boss.maxHp) * barW, barH);
        ctx.strokeStyle = "#fff"; ctx.strokeRect(bx, by, barW, barH);
        ctx.fillStyle = "#fff"; ctx.font = "900 12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(boss.name, window.innerWidth / 2, by - 10);
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

    // --- DEBUG HUD (ADMIN ONLY) ---
    if (window.location.search.includes("admin=true")) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(10, 150, 200, 100);
        ctx.strokeStyle = "var(--neon-blue)"; ctx.strokeRect(10, 150, 200, 100);
        ctx.fillStyle = "#fff"; ctx.font = "10px monospace"; ctx.textAlign = "left";
        ctx.fillText("DEBUG MODE", 20, 170);
        ctx.fillText("STAGE: " + currentStage, 20, 185);
        ctx.fillText("SCORE: " + score, 20, 200);
        ctx.fillText("BOSS: " + (boss ? boss.name : "NONE"), 20, 215);
        ctx.fillText("GAMEOVER: " + gameOver, 20, 230);
        ctx.restore();
    }
}

function restartGame() {
    score = 0; displayScore = 0; asteroids = []; bullets = []; particles = []; floatingTexts = [];
    coins = []; // Clear leftover coins on death
    hazards = []; // Clear Stage 2 hazards
    boss = null; // Clear boss on death
    currentStage = 1; gameOver = false; ship.x = 1000; ship.y = 700;
    for (let i = 0; i < asteroidCount; i++) spawnAsteroid();
}

// BUY UPGRADE
window.buyUpgrade = function (type) {
    const currentLevel = upgrades[type];
    if (currentLevel >= 5) return;

    const cost = upgradeCosts[type][currentLevel];
    if (userCredits >= cost) {
        userCredits -= cost;
        upgrades[type]++;
        localStorage.setItem("asteroid_credits", userCredits);
        localStorage.setItem("asteroid_upgrades", JSON.stringify(upgrades));
        syncMenuUI();
        if (window.showToast) window.showToast(type.toUpperCase() + " Geliştirildi!", "success");
    } else {
        if (window.showToast) window.showToast("Yetersiz Coin! (Fiyat: " + cost + ")", "error");
    }
};

window.buyBullet = function (index, price) {
    let userBullets = JSON.parse(localStorage.getItem("asteroid_owned_bullets")) || [0];
    if (userBullets.includes(index)) return true; // Already owned

    if (userCredits >= price) {
        userCredits -= price;
        userBullets.push(index);
        localStorage.setItem("asteroid_credits", userCredits);
        localStorage.setItem("asteroid_owned_bullets", JSON.stringify(userBullets));
        syncMenuUI();
        if (window.showToast) window.showToast("Mermi Satın Alındı!", "success");
        return true;
    } else {
        if (window.showToast) window.showToast("Yetersiz Coin! (Fiyat: " + price + ")", "error");
        return false;
    }
};

window.buyEnergy = function (amount, cost, type) {
    if (type === 'coin') {
        if (userCredits >= cost) {
            userCredits -= cost;
            userEnergy += amount;
            localStorage.setItem("asteroid_credits", userCredits);
            localStorage.setItem("asteroid_energy", userEnergy);
            syncMenuUI();
            if (window.showToast) window.showToast(amount + " Enerji Başarıyla Alındı!", "success");
        } else {
            if (window.showToast) window.showToast("Yetersiz Coin! (Fiyat: " + cost + ")", "error");
        }
    } else if (type === 'iap') {
        // Simulated IAP Purchase
        userEnergy += amount;
        localStorage.setItem("asteroid_energy", userEnergy);
        syncMenuUI();
        if (window.showToast) window.showToast("Premium " + amount + " Enerji Hesaba Eklendi!", "success");
    }
};

// SYNC UI
function syncMenuUI() {
    if (document.getElementById("menu-highscore")) {
        document.getElementById("menu-highscore").innerText = parseInt(highScore).toLocaleString();
    }
    if (document.getElementById("user-credits")) {
        document.getElementById("user-credits").innerText = userCredits.toLocaleString();
    }
    if (document.getElementById("user-energy")) {
        document.getElementById("user-energy").innerText = userEnergy + " / " + MAX_ENERGY;
    }

    // Daily Login Modal Sync
    const dailyList = document.getElementById("daily-list");
    if (dailyList) {
        dailyList.innerHTML = "";
        DAILY_REWARDS.forEach((r, i) => {
            const active = i === loginStreak ? "active" : "";
            const claimed = i < loginStreak ? "claimed" : "";
            dailyList.innerHTML += `
                <div class="daily-item ${active} ${claimed}">
                    <div class="day-num">GÜN ${i + 1}</div>
                    <div class="day-reward">${r} 🪙</div>
                </div>
            `;
        });
    }

    // Update Achievements UI
    const achList = document.getElementById("achievements-list");
    if (achList) {
        achList.innerHTML = "";
        achievementList.forEach(a => {
            const done = achievementsDone[a.id];
            achList.innerHTML += `
                <div class="upgrade-card" style="opacity: ${done ? 1 : 0.4}; border-color: ${done ? 'var(--neon-gold)' : 'rgba(255,255,255,0.1)'}">
                    <div class="up-info">
                        <div class="up-icon" style="color: ${done ? 'var(--neon-gold)' : '#555'}">🏆</div>
                        <div>
                            <p>${a.desc}</p>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    upgradeTypes.forEach(type => {
        const modal = document.getElementById('upgrades-modal');
        if (!modal) return;
        const index = upgradeTypes.indexOf(type);
        const cards = modal.querySelectorAll('.upgrade-card');
        if (cards[index]) {
            const bars = cards[index].querySelectorAll('.up-bar');
            bars.forEach((bar, i) => {
                if (i < upgrades[type]) bar.classList.add('active');
                else bar.classList.remove('active');
            });
            const btn = cards[index].querySelector('.up-buy-btn');
            if (btn) {
                if (upgrades[type] >= 5) {
                    btn.innerText = "MAX";
                    btn.style.opacity = "0.5";
                    btn.style.pointerEvents = "none";
                } else {
                    const cost = upgradeCosts[type][upgrades[type]];
                    btn.innerText = cost.toLocaleString() + " 🪙";
                }
            }
        }
    });

    // Update Missions UI
    Object.keys(missionTargets).forEach(id => {
        const m = missionTargets[id];
        const card = document.getElementById(id + "-card");
        const inner = document.getElementById(id + "-inner");

        if (card && inner) {
            // Check for Reset
            if (missionProgress.resetTimes[id] && Date.now() > missionProgress.resetTimes[id]) {
                missionProgress.claimed[id] = false;
                missionProgress[m.key] = 0;
                delete missionProgress.resetTimes[id];
                localStorage.setItem("asteroid_missions", JSON.stringify(missionProgress));
                inner.style.display = "block"; // Restore
                if (card.querySelector(".reset-timer")) card.querySelector(".reset-timer").remove();
            }

            if (missionProgress.claimed[id]) {
                inner.style.display = "none";

                // SAFETY: If resetTime is missing for a claimed mission, set it now
                if (!missionProgress.resetTimes[id]) {
                    missionProgress.resetTimes[id] = Date.now() + 10 * 60 * 1000;
                    localStorage.setItem("asteroid_missions", JSON.stringify(missionProgress));
                }

                const timeLeft = Math.max(0, (missionProgress.resetTimes[id] || 0) - Date.now());
                const mins = Math.floor(timeLeft / 60000);
                const secs = Math.floor((timeLeft % 60000) / 1000);
                const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;

                let timerDiv = card.querySelector(".reset-timer");
                if (!timerDiv) {
                    timerDiv = document.createElement("div");
                    timerDiv.className = "reset-timer";
                    timerDiv.style.textAlign = "center";
                    timerDiv.style.padding = "20px 0";
                    card.appendChild(timerDiv);
                }
                timerDiv.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80px;">
                        <p style="font-size: 10px; color: rgba(255,255,255,0.2); font-weight: 900; letter-spacing: 3px; margin-bottom: 8px; text-transform: uppercase;">Yenileniyor</p>
                        <h2 style="color: var(--neon-blue); font-size: 32px; font-weight: 900; letter-spacing: 4px; text-shadow: 0 0 20px rgba(0,242,255,0.3);">${timerStr}</h2>
                    </div>
                `;
            } else {
                inner.style.display = "block";
                const bar = document.getElementById(id + "-bar");
                const val = document.getElementById(id + "-val");
                const statusArea = document.getElementById(id + "-status");

                let progress = (missionProgress[m.key] / m.target) * 100;
                bar.style.width = Math.min(100, progress) + "%";
                val.innerText = Math.min(m.target, missionProgress[m.key]).toLocaleString() + " / " + m.target.toLocaleString();

                if (missionProgress[m.key] >= m.target) {
                    statusArea.innerHTML = `<button class="claim-btn" onclick="claimMission('${id}')">TAMAMLA</button>`;
                    statusArea.style.pointerEvents = "auto";
                } else {
                    statusArea.innerHTML = `<div class="mission-status status-active">AKTİF</div>`;
                    statusArea.style.pointerEvents = "none";
                }
            }
        }
    });
}

window.claimMission = function (id) {
    const m = missionTargets[id];
    if (m && missionProgress[m.key] >= m.target && !missionProgress.claimed[id]) {
        missionProgress.claimed[id] = true;
        missionProgress.resetTimes[id] = Date.now() + 10 * 60 * 1000; // 10 Minutes
        userCredits += m.reward;
        localStorage.setItem("asteroid_credits", userCredits);
        localStorage.setItem("asteroid_missions", JSON.stringify(missionProgress));
        syncMenuUI();

        if (window.showToast) window.showToast(m.title + " Tamamlandı! +" + m.reward + " 🪙", "success");
    }
};
syncMenuUI();
setInterval(syncMenuUI, 1000); // Keep countdowns updated

update();

window.startGame = function () {
    if (userEnergy < ENERGY_COST) {
        if (window.showToast) window.showToast("Yetersiz Enerji! ⚡", "error");
        openModal('iap');
        return;
    }
    userEnergy -= ENERGY_COST;
    localStorage.setItem("asteroid_energy", userEnergy);
    syncMenuUI();

    // Close the mode modal explicitly
    if (window.closeModal) closeModal('mode');

    // Hide ALL menu layers
    document.getElementById("entry-screen").style.display = "none";
    if (document.getElementById("menu-bg")) document.getElementById("menu-bg").style.display = "none";
    if (document.querySelector(".grid-layer")) document.querySelector(".grid-layer").style.display = "none";
    if (document.querySelector(".overlay-effects")) document.querySelector(".overlay-effects").style.display = "none";

    // Show pause button
    const pauseBtn = document.getElementById("ingame-pause-btn");
    if (pauseBtn) pauseBtn.style.display = "flex";

    gameStarted = true;
    restartGame();

    // FORCE SHOW Mobile Controls for all devices during gameplay
    const mc = document.getElementById("mobile-controls");
    if (mc) mc.style.setProperty("display", "block", "important");
};

function togglePause() {
    if (!gameOver && gameStarted) {
        isPaused = !isPaused;
        if (document.getElementById("pause-screen")) {
            if (isPaused) document.getElementById("pause-screen").classList.remove("hidden");
            else document.getElementById("pause-screen").classList.add("hidden");
        }
    }
}

function returnToMenu() {
    gameStarted = false;
    isPaused = false;
    gameOver = false;

    // Hide pause screen
    if (document.getElementById("pause-screen")) document.getElementById("pause-screen").classList.add("hidden");

    // Restore ALL menu layers using style.display
    if (document.getElementById("entry-screen")) document.getElementById("entry-screen").style.display = "flex";
    if (document.getElementById("menu-bg")) document.getElementById("menu-bg").style.display = "block";
    if (document.querySelector(".grid-layer")) document.querySelector(".grid-layer").style.display = "block";
    if (document.querySelector(".overlay-effects")) document.querySelector(".overlay-effects").style.display = "block";

    // Hide in-game HUD
    if (document.getElementById("ingame-pause-btn")) document.getElementById("ingame-pause-btn").style.display = "none";

    restartGame();
    syncMenuUI();
}
window.returnToMenu = returnToMenu;

window.setGameShip = function (index) {
    if (index >= 0 && index < shipSources.length) {
        currentShipIndex = index;
        console.log("Ship changed to:", index);
    }
};

// START THE LOOP
requestAnimationFrame(update);
// ADMIN TOOLS
function adminPrepareGame() {
    adminActionTime = Date.now();
    gameStarted = true;
    gameOver = false;
    isPaused = false;
    deathReason = "";
    
    // Clear entities
    bullets = [];
    particles = [];
    hazards = [];
    floatingTexts = [];
    asteroids = [];
    boss = null;

    // Reset Ship State
    ship.x = 1000;
    ship.y = 700;
    ship.a = 0;
    ship.invulnerable = Date.now() + 2000; // 2 seconds of safety
    
    // Sync Camera
    cam.x = ship.x - window.innerWidth / 2;
    cam.y = ship.y - window.innerHeight / 2;

    if (window.closeModal) closeModal('mode');
    
    // FORCE SHOW Mobile Controls for all devices during gameplay
    const mc = document.getElementById("mobile-controls");
    if (mc) mc.style.setProperty("display", "block", "important");

    if (document.getElementById("entry-screen")) document.getElementById("entry-screen").style.display = "none";
    if (document.getElementById("menu-bg")) document.getElementById("menu-bg").style.display = "none";
    if (document.querySelector(".grid-layer")) document.querySelector(".grid-layer").style.display = "none";
    if (document.querySelector(".overlay-effects")) document.querySelector(".overlay-effects").style.display = "none";
    
    const pauseBtn = document.getElementById("ingame-pause-btn");
    if (pauseBtn) pauseBtn.style.display = "flex";

    syncMenuUI();
}

window.adminSetStage = function (s) {
    adminPrepareGame();
    currentStage = s;
    
    // Score thresholds (Just below the boss spawn to allow a few shots first)
    if (s === 1) score = 0;
    else if (s === 2) score = 10005; // Stage 1 Boss is dead, now in Stage 2
    else if (s === 3) score = 20005; // Stage 2 Boss is dead, now in Stage 3

    displayScore = score;
    initAsteroids();
    stageFlash = 1.0;
    console.log("Admin: Set Stage to", s);
};

window.adminSpawnBoss = function (type) {
    adminPrepareGame();
    // Ensure score is correct for the stage
    if (type === 1) { currentStage = 1; score = 10000; }
    if (type === 2) { currentStage = 2; score = 20000; }
    if (type === 3) { currentStage = 3; score = 40000; }
    
    displayScore = score;
    spawnBoss(type);
    console.log("Admin: Spawned Boss", type);
};

// MOBILE INPUT LISTENERS (Multitouch Fixed)
function initMobileInputs() {
    const joyArea = document.getElementById("joystick-area");
    const joyKnob = document.getElementById("joystick-knob");
    const fireBtn = document.getElementById("fire-btn");

    if (!joyArea || !fireBtn) return;

    let joystickPointerId = null;
    let firePointerId = null;

    joyArea.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        joystickPointerId = e.pointerId;
        joystick.active = true;
        updateJoystick(e);
    });

    window.addEventListener("pointermove", (e) => {
        if (joystick.active && e.pointerId === joystickPointerId) {
            updateJoystick(e);
        }
    });

    window.addEventListener("pointerup", (e) => {
        if (e.pointerId === joystickPointerId) {
            joystick.active = false;
            joystickPointerId = null;
            joystick.dist = 0;
            if (joyKnob) joyKnob.style.transform = `translate(0, 0)`;
        }
        if (e.pointerId === firePointerId) {
            isMobileFiring = false;
            firePointerId = null;
        }
    });

    window.addEventListener("pointercancel", (e) => {
        if (e.pointerId === joystickPointerId) {
            joystick.active = false;
            joystickPointerId = null;
            if (joyKnob) joyKnob.style.transform = `translate(0, 0)`;
        }
        if (e.pointerId === firePointerId) {
            isMobileFiring = false;
            firePointerId = null;
        }
    });

    function updateJoystick(e) {
        const rect = joyArea.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = e.clientX - centerX;
        let dy = e.clientY - centerY;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > joystick.maxDist) {
            dx = (dx / dist) * joystick.maxDist;
            dy = (dy / dist) * joystick.maxDist;
            dist = joystick.maxDist;
        }

        joystick.dx = dx;
        joystick.dy = dy;
        joystick.dist = dist;
        joystick.angle = Math.atan2(dy, dx);

        if (joyKnob) joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    const startFire = (e) => {
        e.preventDefault();
        firePointerId = e.pointerId || 999;
        isMobileFiring = true;
        fireBtn.classList.add("active");
    };

    fireBtn.addEventListener("pointerdown", startFire);
    fireBtn.addEventListener("touchstart", (e) => {
        if (!isMobileFiring) startFire(e);
    });
    fireBtn.addEventListener("touchend", (e) => {
        isMobileFiring = false;
        fireBtn.classList.remove("active");
    });

    const stopFire = (e) => {
        if (e.pointerId === firePointerId) {
            isMobileFiring = false;
            firePointerId = null;
            fireBtn.classList.remove("active");
        }
    };

    window.addEventListener("pointerup", (e) => {
        if (e.pointerId === joystickPointerId) {
            joystick.active = false;
            joystickPointerId = null;
            joystick.dist = 0;
            if (joyKnob) joyKnob.style.transform = `translate(0, 0)`;
        }
        stopFire(e);
    });

    window.addEventListener("pointercancel", (e) => {
        if (e.pointerId === joystickPointerId) {
            joystick.active = false;
            joystickPointerId = null;
            if (joyKnob) joyKnob.style.transform = `translate(0, 0)`;
        }
        stopFire(e);
    });
}

// Ensure mobile controls are hidden on return to menu
const originalReturnToMenu = window.returnToMenu;
window.returnToMenu = function() {
    if (originalReturnToMenu) originalReturnToMenu();
    const mc = document.getElementById("mobile-controls");
    if (mc) mc.style.display = "none";
    joystick.active = false;
    isMobileFiring = false;
};

document.addEventListener("DOMContentLoaded", initMobileInputs);

// Check for Admin Query (Wait for DOM)
document.addEventListener("DOMContentLoaded", () => {
    if (window.location.search.includes("admin=true")) {
        console.log("Admin Mode: Active");
        const panel = document.getElementById("admin-panel");
        if (panel) {
            panel.style.display = "block";
        } else {
            console.error("Admin Mode Error: 'admin-panel' element not found in DOM");
        }
    }
});
