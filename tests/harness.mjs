import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

export function createGameHarness() {
    const jsFiles = ['config.js', 'audio.js', 'network.js', 'entities.js', 'shots.js', 'visuals.js', 'main.js'];
    const jsCode = jsFiles.map(file => fs.readFileSync(path.resolve(process.cwd(), 'js', file), 'utf8')).join('\n;\n');

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
                beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {}, stroke: () => {}, fill: () => {}
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
            this.quaternion = { setFromUnitVectors: () => this.quaternion };
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
        get renderer() { return renderer; },
        get gfxQuality() { return gfxQuality; },
        get shotFX() { return shotFX; },
        get bulletTracers() { return bulletTracers; },
        get muzzleFlash() { return muzzleFlash; },
        get muzzleLight() { return muzzleLight; },
        createBulletTracer, emitShotImpact, emitShotSmoke, updateShotEffects, clearShotEffects, activateLocalMuzzle,
        get graphicsAutoRatio() { return graphicsAutoRatio; },
        get shadersPrewarmed() { return shadersPrewarmed; },
        currentGraphicsPreset, applyGraphicsQuality, toggleGraphicsQuality,
        updateGraphicsPerformance, prewarmGameShaders,
        get camera() { return camera; },
        get obstacles() { return obstacles; },
        get zombies() { return zombies; },
        get dyingZombies() { return typeof dyingZombies !== 'undefined' ? dyingZombies : undefined; },
        get lootDrops() { return typeof lootDrops !== 'undefined' ? lootDrops : undefined; },
        get supplyCrates() { return supplyCrates; },
        get explosiveBarrels() { return explosiveBarrels; },
        initThreeJS, startGame, pauseGame, triggerGameOver, toggleShopModal,
        updatePlayer, performTacticalDash, reloadWeapon, switchWeapon, fireWeapon,
        takePlayerDamage, spawnZombie, updateZombies, updateCoopBotAI, toggleCoopBot, updateNetworkSync,
        damageZombie, killZombie, updateEffectsAndCrates, checkObstacleCollision,
        get performMeleeAttack() { return typeof performMeleeAttack !== 'undefined' ? performMeleeAttack : undefined; },
        get spawnLootDrop() { return typeof spawnLootDrop !== 'undefined' ? spawnLootDrop : undefined; },
        animate, initHostP2P, joinRoomP2P, initLocalTabSync, sendNetMessage, handleNetMessage, resetNetworkSession
    };`;

    vm.runInNewContext(jsCode + '\n' + exportedVars, sandbox);
    sandbox.__game.initThreeJS();
    return { game: sandbox.__game, sandbox, windowListeners };
}

