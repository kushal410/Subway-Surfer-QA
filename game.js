/**
 * Frost Runner 3D - Core Engine Engine File
 */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Elements
const scoreVal = document.getElementById("scoreVal");
const coinVal = document.getElementById("coinVal");
const overlay = document.getElementById("overlay");
const screenTitle = document.getElementById("screenTitle");
const screenSubtitle = document.getElementById("screenSubtitle");
const actionBtn = document.getElementById("actionBtn");

// --- AUDIO SYNTHESIZER (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'coin') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.08); // A5
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
    } else if (type === 'jump') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'slide') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(120, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(60, audioCtx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    }
}

// --- ENGINE PERSPECTIVE CONFIGURATION ---
const LANES_X = [-150, 0, 150]; // Virtual 3D space X paths
const VANISH_Y = 250;            // Camera horizon point
const FOCUS_DEPTH = 320;         // Focal viewport compression calculation ratio

// State parameters
let gameState = "MENU"; // MENU, PLAYING, GAMEOVER
let currentLane = 1;     // Left: 0, Middle: 1, Right: 2
let score = 0;
let coinsCollected = 0;
let runVelocity = 6.0;   // Velocity standard pace
let animationClock = 0;

// Entities
let entities = [];
let scenery = [];
let particles = [];

// --- PLAYER MATRIX CLASS MODEL ---
let player = {
    worldX: LANES_X[currentLane],
    targetWorldX: LANES_X[currentLane],
    jumpZ: 0,        // Elevation off tracks
    slideTimer: 0,   // Sliding duration phase ticks
    verticalVelocity: 0,
    width: 38,
    height: 72,
    tiltAngle: 0,
    
    update() {
        // Linear lane-changing interpolation handling
        let prevX = this.worldX;
        this.worldX += (this.targetWorldX - this.worldX) * 0.2;
        this.tiltAngle = (this.worldX - prevX) * 0.08;

        // Kinematic state check constraints
        if (this.slideTimer > 0) {
            this.slideTimer--;
        }

        // Jump physics arc
        if (this.jumpZ > 0 || this.verticalVelocity !== 0) {
            this.jumpZ -= this.verticalVelocity;
            this.verticalVelocity += 0.58; // Gravity step index weight
            if (this.jumpZ <= 0) {
                this.jumpZ = 0;
                this.verticalVelocity = 0;
            }
        }
    }
};

// --- MATHEMATICAL TRANSLATION CORE ENGINE ---
function projectToViewport(worldX, worldZ, elementHeight = 0) {
    let scale = FOCUS_DEPTH / (FOCUS_DEPTH + worldZ);
    let screenX = (canvas.width / 2) + (worldX * scale);
    let screenY = VANISH_Y + (worldZ * scale) - (elementHeight * scale);
    return { x: screenX, y: screenY, scale: scale };
}

// --- SPAWNER ENGINE MANAGEMENT PIPELINE ---
function spawnTick() {
    if (Math.random() < 0.035) {
        let selectedLane = Math.floor(Math.random() * 3);
        let randVal = Math.random();
        let entityType = "barrier";

        if (randVal < 0.45) entityType = "coin";
        else if (randVal < 0.75) entityType = "arch_barrier"; // Needs sliding interaction to pass safely

        // Confirm track is currently clear to prevent messy stacking artifact loops
        if (entities.filter(e => e.lane === selectedLane && e.worldZ < 150).length === 0) {
            entities.push({
                lane: selectedLane,
                worldX: LANES_X[selectedLane],
                worldZ: 0,
                type: entityType,
                cycle: Math.random() * 10
            });
        }
    }

    // Secondary environmental ambient asset spawn chain (Snowy Evergreens)
    if (Math.random() < 0.04) {
        let pathSide = Math.random() > 0.5 ? 1 : -1;
        scenery.push({
            worldX: pathSide * (240 + Math.random() * 120),
            worldZ: 0,
            type: "pine"
        });
    }
}

function triggerStarburst(x, y, color, total) {
    for (let i = 0; i < total; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            size: Math.random() * 3 + 1.5,
            color,
            alpha: 1
        });
    }
}

// --- RUNTIME UPDATE COMPONENT ---
function updateGame() {
    if (gameState !== "PLAYING") return;

    score++;
    animationClock += 0.16;

    // Smoothly scale up difficulty pacing over time
    if (score % 400 === 0 && runVelocity < 14) {
        runVelocity += 0.25;
    }

    player.update();
    spawnTick();

    // Environment landscape progression
    scenery.forEach(item => item.worldZ += runVelocity);
    scenery = scenery.filter(item => item.worldZ < 600);

    // Track particle simulation frames
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.alpha -= 0.025;
        if (p.alpha <= 0) particles.splice(i, 1);
    }

    // Process tracking pipelines for obstacles and coins
    for (let i = entities.length - 1; i >= 0; i--) {
        let e = entities[i];
        e.worldZ += runVelocity;
        e.cycle += 0.1;

        // Depth alignment intersection mapping for collision calculations
        if (e.worldZ >= 470 && e.worldZ <= 515) {
            if (e.lane === currentLane) {
                if (e.type === "coin") {
                    coinsCollected++;
                    let proj = projectToViewport(e.worldX, e.worldZ, 25);
                    triggerStarburst(proj.x, proj.y, "#fbbf24", 12);
                    playSound('coin');
                    entities.splice(i, 1);
                    continue;
                } 
                else if (e.type === "barrier" && player.jumpZ < 35) {
                    executeCrashSequence();
                } 
                else if (e.type === "arch_barrier" && player.slideTimer === 0 && player.jumpZ < 10) {
                    executeCrashSequence();
                }
            }
        }

        if (e.worldZ > 600) entities.splice(i, 1);
    }

    // Synchronize UI parameters to real-time HUD metrics
    scoreVal.innerText = score.toString().padStart(6, '0');
    coinVal.innerText = `🪙 ${coinsCollected}`;
}

function executeCrashSequence() {
    gameState = "GAMEOVER";
    playSound('crash');
    
    screenTitle.innerText = "RUN TERMINATED";
    screenSubtitle.innerText = `You traveled a distance of ${score} meters and gathered ${coinsCollected} coins.`;
    actionBtn.innerText = "RUN AGAIN";
    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";
}

// --- RENDERING MATRIX DRAW COMPONENT ---
function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Structural environment ground drawing plane layout
    ctx.fillStyle = "#e2e8f0"; // Pristine white tundra landscape deck
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, VANISH_Y);
    ctx.lineTo(0, canvas.height);
    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();
    ctx.fill();

    // 2. Linear processing matrix for drawing tracks
    ctx.strokeStyle = "#cbd5e1";
    LANES_X.forEach(lx => {
        let ptFar = projectToViewport(lx, 0);
        let ptNear = projectToViewport(lx, 550);

        // Ground track ballast beds
        ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
        ctx.lineWidth = 16 * ptNear.scale;
        ctx.beginPath(); ctx.moveTo(ptFar.x, ptFar.y); ctx.lineTo(ptNear.x, ptNear.y); ctx.stroke();

        // High-speed mag-rail energy lines
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2 * ptNear.scale;
        ctx.beginPath(); ctx.moveTo(ptFar.x - 8 * ptFar.scale, ptFar.y); ctx.lineTo(ptNear.x - 8 * ptNear.scale, ptNear.y);
        ctx.moveTo(ptFar.x + 8 * ptFar.scale, ptFar.y); ctx.lineTo(ptNear.x + 8 * ptNear.scale, ptNear.y); ctx.stroke();
    });

    // 3. Ambient landscape prop rendering
    scenery.forEach(item => {
        let pt = projectToViewport(item.worldX, item.worldZ, 0);
        let h = 100 * pt.scale;
        let w = 45 * pt.scale;

        ctx.fillStyle = "#0f172a"; // Low-poly shadow trees
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - h);
        ctx.lineTo(pt.x + w/2, pt.y);
        ctx.lineTo(pt.x - w/2, pt.y);
        ctx.closePath();
        ctx.fill();
    });

    // 4. Object array projection logic loop
    entities.forEach(e => {
        if (e.type === "coin") {
            let bobY = 25 + Math.sin(e.cycle) * 6;
            let pt = projectToViewport(e.worldX, e.worldZ, bobY);
            let r = 11 * pt.scale;

            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.fillStyle = "#fbbf24";
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
            // Highlight inner layer
            ctx.fillStyle = "#f59e0b";
            ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        } 
        else if (e.type === "barrier") {
            let pt = projectToViewport(e.worldX, e.worldZ, 0);
            let w = 65 * pt.scale;
            let h = 35 * pt.scale;

            ctx.fillStyle = "#ef4444"; // Clean geometric barricade obstacle blocks
            ctx.fillRect(pt.x - w/2, pt.y - h, w, h);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(pt.x - w/2, pt.y - h + (h * 0.3), w, h * 0.25);
        } 
        else if (e.type === "arch_barrier") {
            let pt = projectToViewport(e.worldX, e.worldZ, 0);
            let w = 80 * pt.scale;
            let h = 85 * pt.scale;

            ctx.strokeStyle = "#f43f5e";
            ctx.lineWidth = 8 * pt.scale;
            ctx.beginPath();
            ctx.moveTo(pt.x - w/2, pt.y);
            ctx.lineTo(pt.x - w/2, pt.y - h);
            ctx.lineTo(pt.x + w/2, pt.y - h);
            ctx.lineTo(pt.x + w/2, pt.y);
            ctx.stroke();
            // Warning valence flag plate component
            ctx.fillStyle = "#1e293b";
            ctx.fillRect(pt.x - w/2, pt.y - h, w, h * 0.25);
        }
    });

    // 5. Draw dynamic burst particle buffers
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    });

    // 6. --- KINEMATIC SKELETAL CHARACTER DRAWS ---
    let pPos = projectToViewport(player.worldX, 500, player.jumpZ);
    let s = pPos.scale;

    ctx.save();
    ctx.translate(pPos.x, pPos.y);
    ctx.rotate(player.tiltAngle);

    // Compute limb movement cycles based on running state parameters
    let isSliding = player.slideTimer > 0;
    let limbCycle = Math.sin(animationClock) * 18 * s;

    let bodyH = isSliding ? player.height * 0.45 : player.height;
    let bodyW = player.width;

    if (player.jumpZ > 0) {
        limbCycle = 4 * s; // Compact structural pose tuck alignment for aerial frames
    }

    // Limbs: Legs
    ctx.fillStyle = "#334155";
    if (!isSliding) {
        ctx.fillRect(-10 * s, -20 * s, 6 * s, (20 * s) + limbCycle);
        ctx.fillRect(4 * s, -20 * s, 6 * s, (20 * s) - limbCycle);
    } else {
        ctx.fillRect(-12 * s, -8 * s, 24 * s, 8 * s); // Sliding leg layout frame
    }

    // Body Torso Structure Block Unit
    ctx.fillStyle = "#f43f5e";
    ctx.fillRect(-bodyW * 0.4 * s, -bodyH * s - (isSliding ? 4*s : 16*s), bodyW * 0.8 * s, bodyH * 0.7 * s);

    // Limbs: Arms
    ctx.fillStyle = "#e11d48";
    if (!isSliding) {
        ctx.fillRect(-15 * s, -bodyH * s - 14 * s, 4 * s, 20 * s - limbCycle);
        ctx.fillRect(11 * s, -bodyH * s - 14 * s, 4 * s, 20 * s + limbCycle);
    }

    // Face / Head sphere architecture units
    ctx.fillStyle = "#fbcfe8";
    ctx.beginPath();
    ctx.arc(0, -bodyH * s - (isSliding ? 22 * s : 30 * s), 9 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// --- EVENT ENGINE INPUT DRIVERS ---
function changeLane(direction) {
    if (direction === "LEFT" && currentLane > 0) currentLane--;
    if (direction === "RIGHT" && currentLane < 2) currentLane++;
    player.targetWorldX = LANES_X[currentLane];
}

function triggerJumpAction() {
    if (player.jumpZ === 0 && player.slideTimer === 0) {
        player.verticalVelocity = -11.5;
        player.jumpZ = 1;
        playSound('jump');
    }
}

function triggerSlideAction() {
    if (player.jumpZ === 0 && player.slideTimer === 0) {
        player.slideTimer = 45; // Sliding frames lifetime window
        playSound('slide');
    }
}

// Keyboard Input Event Mapping
window.addEventListener("keydown", (e) => {
    if (gameState !== "PLAYING") {
        if (e.key === "Enter" && (gameState === "MENU" || gameState === "GAMEOVER")) startEngineRun();
        return;
    }

    switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
            changeLane("LEFT"); break;
        case "ArrowRight":
        case "d":
        case "D":
            changeLane("RIGHT"); break;
        case "ArrowUp":
        case "w":
        case "W":
        case " ":
            triggerJumpAction(); break;
        case "ArrowDown":
        case "s":
        case "S":
            triggerSlideAction(); break;
    }
});

// Mobile Touch Gesture Swipe Mapping
let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

canvas.addEventListener("touchend", (e) => {
    if (gameState !== "PLAYING") return;

    let deltaX = e.changedTouches[0].screenX - touchStartX;
    let deltaY = e.changedTouches[0].screenY - touchStartY;
    
    // Evaluate operational vector thresholds to filter distinct directions
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > 30) {
            if (deltaX > 0) changeLane("RIGHT");
            else changeLane("LEFT");
        }
    } else {
        if (Math.abs(deltaY) > 30) {
            if (deltaY > 0) triggerSlideAction();
            else triggerJumpAction();
        }
    }
}, { passive: true });

function startEngineRun() {
    gameState = "PLAYING";
    currentLane = 1;
    player.worldX = LANES_X[currentLane];
    player.targetWorldX = LANES_X[currentLane];
    player.jumpZ = 0;
    player.slideTimer = 0;
    player.verticalVelocity = 0;
    entities = [];
    scenery = [];
    particles = [];
    score = 0;
    coinsCollected = 0;
    runVelocity = 6.0;

    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
}

actionBtn.addEventListener("click", () => {
    startEngineRun();
});

// --- TIMESTEP EXECUTION CHAIN RENDER ---
function mainLoop() {
    updateGame();
    drawGame();
    requestAnimationFrame(mainLoop);
}

// Start processing loop
mainLoop();
