// ==========================================
// CONFIGURAÇÕES, CONSTANTES E ESTADO GLOBAL
// Zumbi 3D: Resident Evil 5 Style (B.S.A.A.)
// ==========================================

const WEAPONS = [
    { id: 'PISTOL', name: 'M93R Tática (RE5)', magSize: 15, reserveMax: 999, fireRate: 0.20, reloadTime: 1.0, damage: 38, headshotMult: 2.5, pellets: 1, spread: 0.008, recoil: 0.10, auto: false },
    { id: 'RIFLE', name: 'AK-74 Milspec Assault', magSize: 30, reserveMax: 180, fireRate: 0.11, reloadTime: 1.45, damage: 34, headshotMult: 2.3, pellets: 1, spread: 0.02, recoil: 0.14, auto: true },
    { id: 'SHOTGUN', name: 'M3 Riot Shotgun', magSize: 8, reserveMax: 56, fireRate: 0.58, reloadTime: 1.8, damage: 26, headshotMult: 1.8, pellets: 7, spread: 0.075, recoil: 0.28, auto: false },
    { id: 'RAILGUN', name: 'PSG-1 Laser Sniper', magSize: 5, reserveMax: 30, fireRate: 0.75, reloadTime: 1.9, damage: 220, headshotMult: 2.8, pellets: 1, spread: 0.001, recoil: 0.34, auto: false }
];

const CONFIG = {
    arenaSize: 95,
    playerHeight: 1.75,
    playerRadius: 0.75,
    walkSpeed: 8.6,
    sprintSpeed: 13.8,
    jumpForce: 8.8,
    gravity: 22.0,
    maxHealth: 100,
    maxStamina: 100
};

const ZOMBIE_TYPES = {
    WALKER: { name: 'Majini Comum', skinColor: 0x78350f, clothesColor: 0x451a03, eyeColor: 0xef4444, scale: 1.0, speed: 3.9, hp: 70, damage: 15, score: 100 },
    RUNNER: { name: 'Majini Corredor', skinColor: 0x92400e, clothesColor: 0x7f1d1d, eyeColor: 0xf97316, scale: 0.9, speed: 6.6, hp: 45, damage: 12, score: 150 },
    ACID: { name: 'Majini Infectado Las Plagas', skinColor: 0xb45309, clothesColor: 0x14532d, eyeColor: 0xa3e635, scale: 1.05, speed: 4.6, hp: 60, damage: 17, score: 190 },
    BRUTE: { name: 'Majini Gigante', skinColor: 0x451a03, clothesColor: 0x581c87, eyeColor: 0xd946ef, scale: 1.45, speed: 2.5, hp: 210, damage: 30, score: 300 },
    BOSS: { name: 'Majini Mutante Némesis', skinColor: 0x3b0764, clothesColor: 0x1c1917, eyeColor: 0xf43f5e, scale: 2.3, speed: 2.9, hp: 1300, damage: 45, score: 1200 }
};

const state = {
    status: 'MENU',
    score: 0,
    wave: 1,
    kills: 0,
    health: CONFIG.maxHealth,
    maxHealth: CONFIG.maxHealth,
    stamina: CONFIG.maxStamina,
    isDowned: false,
    currentWeaponIdx: 1,
    weaponsState: [{ mag: 15, reserve: 999 }, { mag: 30, reserve: 150 }, { mag: 8, reserve: 40 }, { mag: 5, reserve: 20 }],
    perks: { damageLvl: 1, speedLvl: 1, healthLvl: 1 },
    grenades: 3,
    dashCooldown: 0,
    invulnTimer: 0,
    reloadTimerId: null,
    meleeCooldown: 0,
    combo: 1,
    comboTimer: 0,
    isAiming: false,
    flashlightOn: true,
    isReloading: false,
    lastFireTime: 0,
    zombiesToSpawn: 0,
    zombiesAlive: 0,
    nextZombieUid: 1,
    spawnTimer: 0,
    crateTimer: 8,
    yaw: 0,
    pitch: 0,
    velocityY: 0,
    isGrounded: true,
    weaponRecoil: 0,
    screenShake: 0,
    walkCycle: 0
};

const net = {
    mode: 'SOLO',
    transport: null,
    bc: null,
    peer: null, conn: null, ws: null, wsReady: false,
    generation: 0, joinTimeout: null, localElectionTimer: null,
    instanceId: Math.random().toString(36).slice(2) + Date.now().toString(36),
    roomCode: '',
    connected: false,
    botActive: false,
    myName: 'Chris Redfield',
    lastSyncSent: 0,
    matchId: 0,
    ally: {
        active: false, name: 'Sheva Alomar', x: 3, y: 0, z: 0, yaw: 0, pitch: 0, hp: 120, maxHp: 120, isDowned: false, weaponIdx: 1, flashlightOn: true,
        meshGroup: null, flashlight: null, muzzleFlash: null, botFireCooldown: 0, botTargetX: 3, botTargetZ: 0
    }
};

const keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
const mouse = { isDown: false, prevX: 0, prevY: 0 };
const mobileInput = { active: false, moveX: 0, moveY: 0 };

let scene, camera, renderer, clock;
let gunGroup, weaponModels = [], muzzleFlash, muzzleLight, playerFlashlight, playerFlashlightTarget, flashlightBeam;
let obstacles = [], zombies = [], particles = [], bulletTracers = [], supplyCrates = [], dyingZombies = [], lootDrops = [];
let explosiveBarrels = [], activeGrenades = [], activeTurrets = [], shellCasings = [], groundDecals = [], shockwaves = [];
// Opções de vídeo independentes da simulação/da rede.
// pixelRatio é uma fração de pixels CSS (limitada ao DPR físico quando aplicável).
const GRAPHICS_PRESETS = Object.freeze({
    AUTO:       { label:'AUTO',     ratio:1.1, shadows:1024, details:30, hpBars:28, particles:0.75, dust:180, foliage:0.7, lamps:true, bloom:false, casings:false, rings:true, anisotropy:2 },
    ECONOMICO:  { label:'ECONÔMICO',ratio:0.65,shadows:0,    details:9,  hpBars:13, particles:0.30, dust:0,   foliage:0.15,lamps:false,bloom:false, casings:false, rings:false,anisotropy:1 },
    BAIXO:      { label:'BAIXO',    ratio:0.8, shadows:0,    details:16, hpBars:17, particles:0.45, dust:70,  foliage:0.35,lamps:false,bloom:false, casings:false, rings:false,anisotropy:1 },
    MEDIO:      { label:'MÉDIO',    ratio:1.0, shadows:512,  details:24, hpBars:22, particles:0.65, dust:140, foliage:0.60,lamps:true, bloom:false, casings:false, rings:true, anisotropy:2 },
    ALTO:       { label:'ALTO',     ratio:1.25,shadows:1024, details:38, hpBars:30, particles:0.85, dust:250, foliage:0.85,lamps:true, bloom:false, casings:true, rings:true, anisotropy:4 },
    ULTRA:      { label:'ULTRA',    ratio:1.6, shadows:2048, details:55, hpBars:36, particles:1.0,  dust:320, foliage:1.0, lamps:true, bloom:true,  casings:true, rings:true, anisotropy:8 }
});
let ambientDust = null, procTextures = {}, gfxQuality = 'AUTO', explosionFX = [];
let graphicsAutoRatio = 1.1, graphicsFpsSmoothed = 60, graphicsAutoTimer = 0;
function currentGraphicsPreset() { return GRAPHICS_PRESETS[gfxQuality] || GRAPHICS_PRESETS.AUTO; }
const raycaster = new THREE.Raycaster();

const dom = {
    container: document.getElementById('canvas-container'),
    popupsContainer: document.getElementById('damage-popups-container'),
    score: document.getElementById('score-display'),
    wave: document.getElementById('wave-display'),
    zombiesRem: document.getElementById('zombies-remaining'),
    kills: document.getElementById('kills-display'),
    combo: document.getElementById('combo-display'),
    bossHud: document.getElementById('boss-hud'),
    bossName: document.getElementById('boss-name'),
    bossHpText: document.getElementById('boss-hp-text'),
    bossHpBar: document.getElementById('boss-hp-bar'),
    scopeOverlay: document.getElementById('scope-overlay'),
    grenadesHud: document.getElementById('grenades-hud'),
    turretsHud: document.getElementById('turrets-hud'),
    healthBar: document.getElementById('health-bar'),
    healthText: document.getElementById('health-text'),
    staminaBar: document.getElementById('stamina-bar'),
    staminaText: document.getElementById('stamina-text'),
    weaponNameHud: document.getElementById('weapon-name-hud'),
    ammoCurrent: document.getElementById('ammo-current'),
    ammoReserve: document.getElementById('ammo-reserve'),
    crosshair: document.getElementById('crosshair'),
    hitmarker: document.getElementById('hitmarker'),
    damageOverlay: document.getElementById('damage-overlay'),
    healOverlay: document.getElementById('heal-overlay'),
    centerAlert: document.getElementById('center-alert'),
    centerAlertText: document.getElementById('center-alert-text'),
    meleePrompt: document.getElementById('melee-prompt'),
    waveBanner: document.getElementById('wave-banner'),
    waveBannerText: document.getElementById('wave-banner-text'),
    modal: document.getElementById('overlay-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalSubtitle: document.getElementById('modal-subtitle'),
    gameoverStats: document.getElementById('gameover-stats'),
    finalScore: document.getElementById('final-score'),
    finalWave: document.getElementById('final-wave'),
    finalKills: document.getElementById('final-kills'),
    btnStart: document.getElementById('btn-start-game'),
    btnPause: document.getElementById('btn-pause'),
    btnSound: document.getElementById('btn-sound'),
    btnShop: document.getElementById('btn-shop'),
    btnFlashlight: document.getElementById('btn-flashlight'),
    btnReloadHud: document.getElementById('btn-reload-hud'),
    shopModal: document.getElementById('shop-modal'),
    shopCredits: document.getElementById('shop-credits'),
    iconSoundOn: document.getElementById('icon-sound-on'),
    iconSoundOff: document.getElementById('icon-sound-off'),
    radarCanvas: document.getElementById('radar-canvas'),
    mobileControls: document.getElementById('mobile-controls'),
    ally3dTag: document.getElementById('ally-3d-tag'),
    allyTagName: document.getElementById('ally-tag-name')
};

const radarCtx = dom.radarCanvas ? dom.radarCanvas.getContext('2d') : null;
