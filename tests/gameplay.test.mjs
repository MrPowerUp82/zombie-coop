import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

export function createGameHarness() {
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!match) throw new Error('Could not find inline <script> in index.html');

    const elements = new Map();
    const makeEl = (id = '') => {
        const classes = new Set(['hidden']);
        const listeners = {};
        return {
            id,
            value: '',
            textContent: '',
            innerHTML: '',
            className: '',
            width: 110,
            height: 110,
            style: { width: '', opacity: '', left: '', top: '', transform: '' },
            classList: {
                add: (...c) => c.forEach(x => classes.add(x)),
                remove: (...c) => c.forEach(x => classes.delete(x)),
                contains: (c) => classes.has(c),
                toggle: (c, force) => {
                    if (force === undefined) {
                        if (classes.has(c)) classes.delete(c); else classes.add(c);
                    } else if (force) classes.add(c); else classes.delete(c);
                }
            },
            addEventListener: (ev, fn) => {
                listeners[ev] = listeners[ev] || [];
                listeners[ev].push(fn);
            },
            dispatchEvent: (ev, data) => {
                (listeners[ev] || []).forEach(fn => fn(data));
            },
            appendChild: (child) => { child.parentNode = { removeChild: () => {} }; },
            removeChild: () => {},
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
            getContext: () => ({
                fillStyle: '', strokeStyle: '', lineWidth: 1,
                fillRect: () => {}, strokeRect: () => {}, clearRect: () => {},
                beginPath: () => {}, arc: () => {}, stroke: () => {}, fill: () => {}
            }),
            requestPointerLock: () => {},
            select: () => {}
        };
    };

    const getElementById = (id) => {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
    };

    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        setY(y) { this.y = y; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        clone() { return new Vector3(this.x, this.y, this.z); }
        add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
        subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
        addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
        multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
        lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
        length() { return Math.hypot(this.x, this.y, this.z); }
        normalize() {
            const len = this.length();
            if (len > 0) this.multiplyScalar(1 / len);
            return this;
        }
        dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
        applyQuaternion() { return this; }
        applyMatrix4() { return this; }
        project() { return this; }
    }

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = { x: 0, y: 0, z: 0, order: 'YXZ', set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
            this.scale = new Vector3(1, 1, 1);
            this.quaternion = {};
            this.matrixWorld = {};
            this.children = [];
            this.userData = {};
            this.visible = true;
        }
        add(child) { if (child) this.children.push(child); }
        remove(child) {
            const idx = this.children.indexOf(child);
            if (idx !== -1) this.children.splice(idx, 1);
        }
        lookAt() {}
        traverse(cb) {
            cb(this);
            for (const c of this.children) {
                if (c && typeof c.traverse === 'function') c.traverse(cb);
            }
        }
    }

    class Mesh extends Object3D {
        constructor(geo = {}, mat = {}) {
            super();
            this.isMesh = true;
            this.geometry = { dispose: () => {}, ...geo };
            this.material = { dispose: () => {}, emissive: { setHex: () => {} }, ...mat };
        }
    }

    class Material {
        constructor(opts = {}) {
            Object.assign(this, opts);
            this.emissive = { setHex: (h) => { this.emissiveHex = h; } };
        }
        clone() { return new Material(this); }
        dispose() {}
    }

    class Geometry {
        translate() { return this; }
        rotateX() { return this; }
        setAttribute() { return this; }
        setFromPoints() { return this; }
        dispose() {}
    }

    const THREE = {
        Vector3,
        Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } },
        Object3D,
        Group: class extends Object3D {},
        Scene: class extends Object3D {},
        Mesh,
        Points: class extends Object3D {},
        Line: class extends Object3D {
            constructor(geo, mat) { super(); this.geometry = geo || new Geometry(); this.material = mat || new Material(); }
        },
        Color: class {},
        FogExp2: class {},
        PerspectiveCamera: class extends Object3D {
            constructor(fov = 74) { super(); this.fov = fov; }
            updateProjectionMatrix() {}
        },
        WebGLRenderer: class {
            constructor() {
                this.domElement = makeEl('game-canvas');
                this.shadowMap = {};
            }
            setSize() {}
            setPixelRatio() {}
            render() {}
        },
        Clock: class {
            constructor() { this.elapsed = 10; }
            getDelta() { return 0.016; }
            getElapsedTime() { return this.elapsed; }
        },
        HemisphereLight: class extends Object3D {},
        DirectionalLight: class extends Object3D {
            constructor() { super(); this.shadow = { mapSize: {}, camera: {} }; }
        },
        PointLight: class extends Object3D {},
        SpotLight: class extends Object3D {},
        SphereGeometry: Geometry,
        BoxGeometry: Geometry,
        PlaneGeometry: Geometry,
        CylinderGeometry: Geometry,
        ConeGeometry: Geometry,
        RingGeometry: Geometry,
        CircleGeometry: Geometry,
        TorusGeometry: Geometry,
        BufferGeometry: Geometry,
        BufferAttribute: class {},
        MeshBasicMaterial: Material,
        MeshStandardMaterial: Material,
        PointsMaterial: Material,
        LineBasicMaterial: Material,
        GridHelper: class extends Object3D { constructor() { super(); this.material = {}; } },
        CanvasTexture: class { constructor() { this.repeat = { set: () => {} }; } },
        Raycaster: class {
            constructor() { this.ray = { at: (dist, out) => out.set(0, 0, -dist) }; }
            setFromCamera() {}
            intersectObjects() { return []; }
        },
        MathUtils: {
            clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
            lerp: (a, b, t) => a + (b - a) * t
        },
        RepeatWrapping: 1,
        PCFSoftShadowMap: 1,
        ACESFilmicToneMapping: 1,
        sRGBEncoding: 1,
        AdditiveBlending: 1,
        DoubleSide: 1
    };

    const windowListeners = {};
    const sandbox = {
        THREE,
        Math: Object.create(Math),
        Date,
        JSON,
        Number,
        Array,
        Set,
        Map,
        Float32Array,
        console,
        setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; },
        clearTimeout,
        requestAnimationFrame: () => {},
        localStorage: { getItem: () => null, setItem: () => {} },
        BroadcastChannel: class { postMessage() {} close() {} },
        window: {
            innerWidth: 1280,
            innerHeight: 720,
            devicePixelRatio: 1,
            addEventListener: (ev, fn) => {
                windowListeners[ev] = windowListeners[ev] || [];
                windowListeners[ev].push(fn);
            },
            dispatchEvent: (ev, data) => {
                (windowListeners[ev] || []).forEach(fn => fn(data));
            }
        },
        document: {
            pointerLockElement: null,
            activeElement: null,
            body: { appendChild: () => {}, removeChild: () => {} },
            createElement: () => makeEl(),
            getElementById,
            exitPointerLock: function() { this.pointerLockElement = null; },
            execCommand: () => {}
        }
    };

    const exportedVars = `
    globalThis.__game = {
        WEAPONS, CONFIG, state, net, keys, mouse, mobileInput, dom,
        get scene() { return scene; },
        get camera() { return camera; },
        get obstacles() { return obstacles; },
        get zombies() { return zombies; },
        get dyingZombies() { return typeof dyingZombies !== 'undefined' ? dyingZombies : undefined; },
        get lootDrops() { return typeof lootDrops !== 'undefined' ? lootDrops : undefined; },
        get supplyCrates() { return supplyCrates; },
        get explosiveBarrels() { return explosiveBarrels; },
        initThreeJS, startGame, pauseGame, triggerGameOver, toggleShopModal,
        updatePlayer, performTacticalDash, reloadWeapon, switchWeapon, fireWeapon,
        takePlayerDamage, spawnZombie, updateZombies, updateCoopBotAI,
        damageZombie, killZombie, updateEffectsAndCrates, checkObstacleCollision,
        get performMeleeAttack() { return typeof performMeleeAttack !== 'undefined' ? performMeleeAttack : undefined; },
        get spawnLootDrop() { return typeof spawnLootDrop !== 'undefined' ? spawnLootDrop : undefined; },
        animate
    };`;

    vm.runInNewContext(match[1] + '\n' + exportedVars, sandbox);
    sandbox.__game.initThreeJS();
    return { game: sandbox.__game, sandbox, windowListeners };
}

test('Task 1.1: strafe_symmetry - A and D move at equal speeds and A+D cancels out', () => {
    const { game } = createGameHarness();
    game.state.status = 'PLAYING';
    game.state.yaw = 0;

    // Move right (D)
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);
    game.keys.d = true;
    game.keys.a = false;
    game.updatePlayer(0.1);
    const rightDelta = game.camera.position.x;
    assert.ok(rightDelta > 0, 'pressing D should move +X');

    // Move left (A)
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);
    game.keys.d = false;
    game.keys.a = true;
    game.updatePlayer(0.1);
    const leftDelta = game.camera.position.x;
    assert.ok(leftDelta < 0, 'pressing A should move -X');
    assert.equal(Math.abs(leftDelta), Math.abs(rightDelta), 'A and D displacement must be symmetrical');

    // Hold both A and D
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);
    game.keys.d = true;
    game.keys.a = true;
    game.updatePlayer(0.1);
    assert.equal(game.camera.position.x, 0, 'holding both A and D must produce zero horizontal movement');
});

test('Task 1.2: directional_dash_and_iframes - dash uses WASD direction and grants 0.35s invulnerability', () => {
    const { game } = createGameHarness();
    game.state.status = 'PLAYING';
    game.state.yaw = 0;
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);

    // Hold A (left) and dash
    game.keys.a = true;
    game.performTacticalDash();

    assert.ok(game.camera.position.x < -1.0, `dash while holding A should move left (-X), got x=${game.camera.position.x}`);
    assert.equal(game.state.invulnTimer, 0.35, 'dash should set state.invulnTimer to 0.35');

    const hpBefore = game.state.health;
    game.takePlayerDamage(30);
    assert.equal(game.state.health, hpBefore, 'takePlayerDamage should be ignored while invulnTimer > 0');
});

test('Task 1.3: reload_cancel_on_switch - switching weapons mid-reload cancels the pending reload timer', async () => {
    const { game } = createGameHarness();
    game.state.status = 'PLAYING';
    game.switchWeapon(1); // Rifle (magSize 30)
    game.state.weaponsState[1].mag = 5;
    game.state.perks.speedLvl = 50; // Fast reload for test (~180ms)

    game.reloadWeapon();
    assert.equal(game.state.isReloading, true);
    assert.ok(game.state.reloadTimerId, 'reloadTimerId should be stored on state');

    // Switch weapon before reload completes
    game.switchWeapon(2);
    assert.equal(game.state.isReloading, false);
    assert.equal(game.state.reloadTimerId, null, 'switching weapon must clear reloadTimerId');

    await new Promise(r => setTimeout(r, 260));
    assert.equal(game.state.weaponsState[1].mag, 5, 'cancelled reload must not refill previous weapon magazine');
});

test('Task 1.4: shop_pauses_zombies_in_solo - zombies do not move or attack while shop is open in Solo/Bot mode', () => {
    const { game } = createGameHarness();
    game.startGame();
    game.zombies.length = 0;
    const z = game.spawnZombie({ uid: 99, type: 'WALKER', x: game.camera.position.x + 1.1, z: game.camera.position.z, hp: 70 });
    const startX = z.mesh.position.x;
    const startHp = game.state.health;

    // Open shop in Solo mode
    game.toggleShopModal();
    assert.equal(game.state.status, 'SHOP');

    game.animate();
    assert.equal(z.mesh.position.x, startX, 'zombie should not move while shop is open in Solo mode');
    assert.equal(game.state.health, startHp, 'player should not take damage while shop is open in Solo mode');
});

test('Task 2.1: segmented_hitboxes_exclude_ui - body parts have hitZone and floating HP bar has no zombieRef', () => {
    const { game } = createGameHarness();
    const z = game.spawnZombie({ uid: 201, type: 'WALKER', x: 10, z: 10, hp: 70 });

    assert.equal(z.parts.head.userData.hitZone, 'HEAD');
    assert.equal(z.parts.head.userData.isHead, true);
    assert.equal(z.parts.head.userData.zombieRef, z);

    assert.equal(z.parts.torso.userData.hitZone, 'BODY');
    assert.equal(z.parts.torso.userData.zombieRef, z);

    assert.equal(z.parts.leftLeg.userData.hitZone, 'LEG');
    assert.equal(z.parts.leftLeg.userData.isLeg, true);
    assert.equal(z.parts.leftLeg.userData.zombieRef, z);

    assert.equal(z.parts.hpBg.userData.zombieRef, undefined, 'hpBg must not have zombieRef');
    assert.equal(z.parts.hpFill.userData.zombieRef, undefined, 'hpFill must not have zombieRef');
});

test('Task 2.2: safe_spawn_avoids_obstacles - natural spawns never overlap obstacles', () => {
    const { game } = createGameHarness();
    game.zombies.length = 0;
    for (let i = 0; i < 40; i++) {
        const z = game.spawnZombie();
        const collides = game.checkObstacleCollision(z.mesh.position.x, z.mesh.position.z, 0.45 * z.scale);
        assert.equal(collides, false, `Zombie ${i} spawned inside an obstacle at (${z.mesh.position.x}, ${z.mesh.position.z})`);
    }
});

test('Task 2.3: zombie_obstacle_steering - zombie blocked by crate steers laterally around it', () => {
    const { game } = createGameHarness();
    game.zombies.length = 0;
    // Crate at { x: 0, z: -26, w: 6, h: 2.2, d: 2.2 } -> minZ: -27.1, maxZ: -24.9, minX: -3, maxX: 3
    game.camera.position.set(0, game.CONFIG.playerHeight, -20);
    const z = game.spawnZombie({ uid: 202, type: 'WALKER', x: 0.2, z: -28.0, hp: 70 });

    for (let step = 0; step < 15; step++) {
        game.updateZombies(0.05, step * 0.05);
    }

    assert.ok(Math.abs(z.mesh.position.x - 0.2) > 0.3, `zombie should steer laterally around obstacle, got x=${z.mesh.position.x}`);
});

test('Task 2.4: sheva_ai_facing_revive_and_mutual_downed - Sheva faces zombie, restores HP on revive, and triggers gameover on mutual down', () => {
    const { game } = createGameHarness();
    game.startGame();
    game.net.botActive = true;
    game.net.connected = true;
    game.net.ally.active = true;
    game.net.ally.isDowned = false;
    game.net.ally.hp = 120;
    game.net.ally.maxHp = 120;
    game.net.ally.x = 0;
    game.net.ally.z = 0;

    game.zombies.length = 0;
    game.spawnZombie({ uid: 203, type: 'WALKER', x: 0, z: 10, hp: 70 });

    game.updateCoopBotAI(0.05);
    // Zombie is at +Z (zdz = +10, zdx = 0). Since avatar forward is -Z, Math.atan2(-zdx, -zdz) = Math.atan2(0, -10) = Math.PI or -Math.PI
    assert.ok(Math.abs(Math.abs(game.net.ally.yaw) - Math.PI) < 0.01, `Sheva yaw should face +Z (Math.PI), got ${game.net.ally.yaw}`);

    // Player revives downed Sheva -> HP restored to 65%
    game.net.ally.isDowned = true;
    game.net.ally.hp = 0;
    game.camera.position.set(1.0, game.CONFIG.playerHeight, 0);
    game.updatePlayer(0.016);
    assert.equal(game.net.ally.isDowned, false);
    assert.equal(game.net.ally.hp, Math.round(120 * 0.65), 'Reviving ally must restore 65% of maxHp');

    // Mutual downed -> Game Over
    game.state.isDowned = true;
    game.net.ally.isDowned = true;
    game.updatePlayer(0.016);
    assert.equal(game.state.status, 'GAMEOVER', 'Mutual downed state must trigger GAMEOVER');
});

test('Task 3.1: head_and_leg_stagger - head and leg shots trigger stagger state and pause zombie movement/attacks', () => {
    const { game, sandbox } = createGameHarness();
    game.startGame();
    game.zombies.length = 0;
    sandbox.Math.random = () => 0.1; // Deterministic stagger roll

    const zHead = game.spawnZombie({ uid: 301, type: 'WALKER', x: 0, z: -5, hp: 100 });
    game.damageZombie(zHead, 25, zHead.mesh.position.clone(), true, false, 'HEAD');
    assert.equal(zHead.staggerTimer, 2.8, 'Headshot should set staggerTimer to 2.8');
    assert.equal(zHead.staggerType, 'HEAD', 'Headshot should set staggerType to HEAD');

    const zLeg = game.spawnZombie({ uid: 302, type: 'WALKER', x: 3, z: -5, hp: 100 });
    game.damageZombie(zLeg, 25, zLeg.mesh.position.clone(), false, false, 'LEG');
    assert.equal(zLeg.staggerTimer, 2.8, 'Leg shot should set staggerTimer to 2.8');
    assert.equal(zLeg.staggerType, 'KNEE', 'Leg shot should set staggerType to KNEE');

    // Staggered zombie should not move or attack player
    zHead.mesh.position.set(game.camera.position.x + 1.0, 0, game.camera.position.z);
    const startX = zHead.mesh.position.x;
    const startHp = game.state.health;
    game.updateZombies(0.2, 1.0);
    assert.equal(zHead.mesh.position.x, startX, 'Staggered zombie must not move');
    assert.equal(game.state.health, startHp, 'Staggered zombie must not attack');
});

test('Task 3.2: melee_finisher_and_shove - performMeleeAttack executes RE5 finisher on staggered target and defensive shove otherwise', () => {
    const { game } = createGameHarness();
    game.startGame();
    game.zombies.length = 0;
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);
    game.state.yaw = 0;

    // 1. Finisher on staggered zombie within 3.8m + AoE on nearby zombie
    const zStaggered = game.spawnZombie({ uid: 303, type: 'WALKER', x: 0, z: -2.2, hp: 150 });
    zStaggered.staggerTimer = 2.5;
    zStaggered.staggerType = 'HEAD';

    const zNearby = game.spawnZombie({ uid: 304, type: 'BRUTE', x: 1.5, z: -2.5, hp: 250 });
    const scoreBefore = game.state.score;

    assert.equal(typeof game.performMeleeAttack, 'function', 'performMeleeAttack must be defined');
    const didMelee = game.performMeleeAttack();
    assert.equal(didMelee, true);
    assert.equal(game.state.invulnTimer, 0.6, 'Finisher must grant 0.6s invulnerability');
    assert.ok(zStaggered.hp <= 0, 'Primary staggered target (150 HP) must die from 180 finisher damage');
    assert.equal(zNearby.hp, 250 - 95, 'Nearby zombie within 3.8m must take 95 AoE damage');
    assert.ok(game.state.score >= scoreBefore + zStaggered.scoreValue + 75, 'Melee finisher kill must award +75 bonus score');

    // 2. Defensive shove when no staggered zombie is present
    game.zombies.length = 0;
    game.state.meleeCooldown = 0;
    const zClose = game.spawnZombie({ uid: 305, type: 'WALKER', x: 0, z: -1.8, hp: 100 });
    const zBeforeZ = zClose.mesh.position.z;
    const didShove = game.performMeleeAttack();
    assert.equal(didShove, true);
    assert.equal(zClose.hp, 65, 'Defensive shove must deal 35 damage');
    assert.ok(zClose.mesh.position.z < zBeforeZ - 0.5, 'Defensive shove must knock zombie backward');
    assert.equal(game.state.meleeCooldown, 1.8, 'Defensive shove must set 1.8s cooldown');
});

test('Task 3.3: dying_zombies_and_magnetic_loot_drops - killed zombies enter dyingZombies and spawn magnetic loot drops up to 10x combo', () => {
    const { game, sandbox } = createGameHarness();
    game.startGame();
    game.zombies.length = 0;
    sandbox.Math.random = () => 0.1; // Guaranteed drop

    const z = game.spawnZombie({ uid: 306, type: 'WALKER', x: 0, z: -2.5, hp: 50 });
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);

    game.killZombie(z, true, false);
    assert.ok(Array.isArray(game.dyingZombies) && game.dyingZombies.length === 1, 'Killed zombie must be added to dyingZombies');
    assert.equal(z.parts.head.visible, false, 'Headshot kill must hide zombie head mesh');
    assert.ok(Array.isArray(game.lootDrops) && game.lootDrops.length >= 1, 'Killed zombie must spawn a loot drop');

    const drop = game.lootDrops[0];
    drop.mesh.position.set(0, 0.5, -3.0); // Within 3.6m magnetic pull radius
    game.updateEffectsAndCrates(0.1, 1.0);
    assert.ok(drop.mesh.position.z > -3.0, 'Loot drop within 3.6m must be pulled magnetically toward player');

    // Move drop within pickup radius (< 1.3m) and test COMBO boost up to 10x
    drop.type = 'COMBO';
    game.state.combo = 9;
    drop.mesh.position.set(0, 0.5, -0.8);
    game.updateEffectsAndCrates(0.1, 1.1);
    assert.equal(game.state.combo, 10, 'COMBO drop must increase combo up to the new 10x cap');
});
