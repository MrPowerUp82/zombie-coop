// ==========================================
// ENTIDADES, MESHES 3D, PROCEDURAL & SPAWNERS
// Modelagem procedural, zumbis, colisões, partículas e itens
// ==========================================

function checkObstacleCollision(x, z, radius) {
    const limit = CONFIG.arenaSize - 1.5;
    if (x < -limit || x > limit || z < -limit || z > limit) return true;
    for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (x + radius > o.minX && x - radius < o.maxX && z + radius > o.minZ && z - radius < o.maxZ) return true;
    }
    return false;
}

function steerEntityMove(x, z, dirX, dirZ, stepDist, radius) {
    const nx = x + dirX * stepDist;
    const nz = z + dirZ * stepDist;
    if (!checkObstacleCollision(nx, nz, radius)) return { x: nx, z: nz };

    const angles = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, -(3 * Math.PI) / 4];
    for (let i = 0; i < angles.length; i++) {
        const a = angles[i];
        const cosA = Math.cos(a), sinA = Math.sin(a);
        const rx = dirX * cosA - dirZ * sinA;
        const rz = dirX * sinA + dirZ * cosA;
        const tx = x + rx * stepDist;
        const tz = z + rz * stepDist;
        if (!checkObstacleCollision(tx, tz, radius)) return { x: tx, z: tz };
    }

    let sx = x, sz = z;
    if (!checkObstacleCollision(nx, z, radius)) sx = nx;
    if (!checkObstacleCollision(sx, nz, radius)) sz = nz;
    return { x: sx, z: sz };
}

// Texturas PBR desenhadas no navegador: sem downloads de assets de terceiros.
function generateProceduralTextures() {
    function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        draw(ctx, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        tex.encoding = THREE.sRGBEncoding;
        if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
            tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        }
        return tex;
    }
    const asphaltTex = canvasTexture(512, (c, n) => {
        c.fillStyle = '#615749'; c.fillRect(0, 0, n, n);
        for (let i = 0; i < 27000; i++) {
            const x = Math.random() * n, y = Math.random() * n;
            const v = 64 + Math.random() * 72;
            c.fillStyle = `rgba(${v+13},${v+3},${v-12},${0.13 + Math.random() * 0.55})`;
            const r = 0.4 + Math.random() * 3.5;
            c.fillRect(x, y, r, r);
        }
        for (let i = 0; i < 22; i++) {
            c.beginPath(); c.moveTo(Math.random()*n, Math.random()*n);
            for (let j = 0; j < 4; j++) c.lineTo(Math.random()*n, Math.random()*n);
            c.strokeStyle = 'rgba(26,23,20,0.13)'; c.lineWidth = 0.45+Math.random()*1.1; c.stroke();
        }
    }, 30, 30);
    const containerTex = canvasTexture(512, (c, n) => {
        c.fillStyle = '#a0a19a'; c.fillRect(0, 0, n, n);
        for (let x = 0; x < n; x += 32) {
            c.fillStyle = 'rgba(21,23,25,0.30)'; c.fillRect(x, 0, 5, n);
            c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x+7, 0, 4, n);
        }
        for (let i=0; i<5500; i++) {
            const x=Math.random()*n, y=Math.random()*n;
            c.fillStyle = Math.random()>0.5 ? 'rgba(82,34,17,.13)' : 'rgba(245,227,202,.12)';
            c.fillRect(x,y,Math.random()*6+1,Math.random()*3+1);
        }
        for(let y=12;y<n;y+=96) for(let x=12;x<n;x+=64) {
            c.fillStyle='rgba(28,22,20,.5)';c.beginPath();c.arc(x,y,2.4,0,Math.PI*2);c.fill();
        }
    }, 2, 1);
    const crateTex = canvasTexture(512, (c,n) => {
        c.fillStyle='#996638';c.fillRect(0,0,n,n);
        for (let i=0;i<24;i++) {
            const y=i*n/24; c.fillStyle=i%2?'rgba(40,24,14,.13)':'rgba(241,195,119,.12)';
            c.fillRect(0,y,n,n/24);
        }
        for(let i=0;i<160;i++) {
            c.fillStyle='rgba(44,25,13,.12)';c.fillRect(Math.random()*n,Math.random()*n,Math.random()*100+8,1);
        }
        c.strokeStyle='#443021';c.lineWidth=22;c.strokeRect(14,14,n-28,n-28);
        c.strokeStyle='rgba(252,205,131,.6)';c.lineWidth=4;c.strokeRect(28,28,n-56,n-56);
        for(let x of [38,n-38])for(let y of [38,n-38]) {
            c.fillStyle='#27221e';c.beginPath();c.arc(x,y,5,0,Math.PI*2);c.fill();
        }
    });
    procTextures = { asphaltTex, containerTex, crateTex };
}

function setupLights() {
    const hemiLight = new THREE.HemisphereLight(0xc9d5db, 0x4b2919, 1.00); // Luz solar escaldante Kijuju RE5
    hemiLight.position.set(0, 55, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffd8a1, 2.05);
    sunLight.position.set(45, 65, -35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 175;
    sunLight.shadow.bias = -0.00022;
    sunLight.shadow.normalBias = 0.035;
    const d = 78;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);
    scene.userData.sunLight = sunLight;

    const sunGeo = new THREE.SphereGeometry(7.5, 40, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffedd5 });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(65, 82, -85);
    scene.add(sunMesh);

    const haloGeo = new THREE.SphereGeometry(14.5, 32, 24);
    const haloMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.copy(sunMesh.position);
    scene.add(haloMesh);

    const dustCount = 320;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
        dustPos[i * 3] = (Math.random() - 0.5) * 130;
        dustPos[i * 3 + 1] = 0.4 + Math.random() * 9;
        dustPos[i * 3 + 2] = (Math.random() - 0.5) * 130;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
        color: 0xfbbf24, size: 0.15, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending
    });
    ambientDust = new THREE.Points(dustGeo, dustMat);
    scene.add(ambientDust);
}

function buildEnvironment() {
    const floorGeo = new THREE.PlaneGeometry(CONFIG.arenaSize * 2, CONFIG.arenaSize * 2, 20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
        map: procTextures.asphaltTex,
        bumpMap: procTextures.asphaltTex,
        bumpScale: 0.10,
        color: 0xb7a58b,
        roughness: 0.94,
        metalness: 0.02
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(CONFIG.arenaSize * 2, 40, 0xf59e0b, 0x78350f);
    grid.position.y = 0.02;
    grid.material.opacity = 0.22;
    grid.material.transparent = true;
    grid.visible = false; // A grade artificial dava aparência de protótipo.
    scene.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({
        map: procTextures.containerTex, color: 0x928272, roughness: 0.90, metalness: 0.08
    });
    const wallHeight = 7.5;
    const limit = CONFIG.arenaSize;

    const walls = [
        { x: 0, z: -limit, w: limit * 2, d: 2 },
        { x: 0, z: limit, w: limit * 2, d: 2 },
        { x: -limit, z: 0, w: 2, d: limit * 2 },
        { x: limit, z: 0, w: 2, d: limit * 2 }
    ];

    walls.forEach(w => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, wallHeight, w.d), wallMat);
        mesh.position.set(w.x, wallHeight / 2, w.z);
        mesh.receiveShadow = true; mesh.castShadow = true;
        scene.add(mesh);
    });

    obstacles = [];
    const crateMat = new THREE.MeshStandardMaterial({
        map: procTextures.crateTex, bumpMap: procTextures.crateTex, bumpScale: 0.05, color: 0xd2ae80, roughness: 0.84, metalness: 0.04
    });
    const containerRedMat = new THREE.MeshStandardMaterial({
        map: procTextures.containerTex, bumpMap: procTextures.containerTex, bumpScale: 0.05, color: 0xbe7770, roughness: 0.52, metalness: 0.35
    });
    const containerRustMat = new THREE.MeshStandardMaterial({
        map: procTextures.containerTex, bumpMap: procTextures.containerTex, bumpScale: 0.05, color: 0xa57b58, roughness: 0.62, metalness: 0.25
    });
    const pillarMat = new THREE.MeshStandardMaterial({
        map: procTextures.asphaltTex, color: 0xb0a597, roughness: 0.96, metalness: 0.04
    });

    const layout = [
        { x: -18, z: -16, w: 4.5, h: 3.5, d: 9, mat: containerRedMat },
        { x: 20, z: -18, w: 9, h: 3.5, d: 4.5, mat: containerRustMat },
        { x: -22, z: 20, w: 8, h: 3.5, d: 4.5, mat: containerRustMat },
        { x: 18, z: 22, w: 4.5, h: 3.5, d: 9, mat: containerRedMat },
        { x: 0, z: -26, w: 6, h: 2.2, d: 2.2, mat: crateMat },
        { x: 0, z: 26, w: 6, h: 2.2, d: 2.2, mat: crateMat },
        { x: -28, z: 0, w: 2.5, h: 2.5, d: 6, mat: crateMat },
        { x: 28, z: 0, w: 2.5, h: 2.5, d: 6, mat: crateMat },
        { x: -42, z: -42, w: 5, h: 6, d: 5, mat: pillarMat },
        { x: 42, z: -42, w: 5, h: 6, d: 5, mat: pillarMat },
        { x: -42, z: 42, w: 5, h: 6, d: 5, mat: pillarMat },
        { x: 42, z: 42, w: 5, h: 6, d: 5, mat: pillarMat },
        { x: -10, z: 8, w: 2.5, h: 2.0, d: 2.5, mat: crateMat },
        { x: 11, z: -7, w: 2.5, h: 2.0, d: 2.5, mat: crateMat }
    ];

    layout.forEach(item => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(item.w, item.h, item.d), item.mat);
        mesh.position.set(item.x, item.h / 2, item.z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        const trim = new THREE.MeshStandardMaterial({ color: 0x292b2c, roughness: 0.68, metalness: 0.72 });
        if (item.h > 3 && (item.w >= 8 || item.d >= 8)) {
            // Reforços corrugados, rebites e vigas laterais dos contêineres.
            const alongX = item.w >= item.d;
            const span = alongX ? item.w : item.d;
            const count = Math.min(16, Math.floor(span / 0.55));
            for (let k = 0; k < count; k++) {
                const t = -span / 2 + (k + 0.5) * span / count;
                for (const face of [-1, 1]) {
                    const rib = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.065 : item.w + 0.016, item.h - 0.36, alongX ? item.d + 0.016 : 0.065), trim);
                    if (alongX) rib.position.set(t, 0, face * (item.d/2 + 0.013));
                    else rib.position.set(face * (item.w/2 + 0.013), 0, t);
                    // Nas faces longas, apenas a largura fina da nervura é exibida.
                    if (alongX) rib.geometry = new THREE.BoxGeometry(0.055, item.h - 0.35, 0.075);
                    else rib.geometry = new THREE.BoxGeometry(0.075, item.h - 0.35, 0.055);
                    mesh.add(rib);
                }
            }
        } else if (item.h <= 2.6) {
            // Quinas metálicas nas caixas de madeira.
            for (const face of [-1, 1]) {
                const strap = new THREE.Mesh(new THREE.BoxGeometry(item.w + 0.018, 0.10, item.d + 0.018), trim);
                strap.position.y = face * (item.h * 0.36);
                mesh.add(strap);
            }
        }
        obstacles.push({
            mesh, minX: item.x - item.w / 2, maxX: item.x + item.w / 2, minZ: item.z - item.d / 2, maxZ: item.z + item.d / 2
        });
    });

    const lampPositions = [[-14, -12], [16, -14], [-16, 16], [14, 18]];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x451a03, metalness: 0.75, roughness: 0.3 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const coneVolMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b, transparent: true, opacity: 0.065, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    });

    scene.userData.localLights = [];
    lampPositions.forEach(([lx, lz]) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 6.5, 8), poleMat);
        pole.position.set(lx, 3.25, lz); pole.castShadow = true;
        scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), bulbMat);
        bulb.position.set(lx, 6.5, lz);
        scene.add(bulb);
        const lightCone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 6.5, 12, 1, true), coneVolMat);
        lightCone.position.set(lx, 3.25, lz);
        scene.add(lightCone);
        const pLight = new THREE.PointLight(0xf59e0b, 1.25, 28);
        pLight.position.set(lx, 6.2, lz);
        scene.add(pLight);
        scene.userData.localLights.push(pLight);
    });

    buildSceneryDetails();
    spawnExplosiveBarrels();
}

// Objetos instanciados: centenas de pedras/vegetação com apenas alguns draw calls.
function buildSceneryDetails() {
    if (typeof THREE.InstancedMesh !== 'function' || typeof THREE.DodecahedronGeometry !== 'function') return;
    const stone = new THREE.InstancedMesh(
        new THREE.DodecahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ color: 0x8d7d68, roughness: 1, flatShading: true }), 300
    );
    const grass = new THREE.InstancedMesh(
        new THREE.ConeGeometry(0.18, 0.65, 5),
        new THREE.MeshStandardMaterial({ color: 0x6e6b3b, roughness: 1, side: THREE.DoubleSide }), 200
    );
    const dummy = new THREE.Object3D();
    scene.userData.foliage = [{mesh:stone,total:300},{mesh:grass,total:200}];
    for (const [instanced, count, range] of [[stone, 300, 1], [grass, 200, 0.7]]) {
        for (let i = 0; i < count; i++) {
            let x = 0, z = 0;
            for (let j = 0; j < 12; j++) {
                x = (Math.random()-0.5)*(CONFIG.arenaSize*1.86);
                z = (Math.random()-0.5)*(CONFIG.arenaSize*1.86);
                if (!checkObstacleCollision(x,z,0.7)) break;
            }
            const sz = 0.12+Math.random()*range;
            dummy.position.set(x, instanced === stone ? sz * 0.18 : sz * 0.18, z);
            dummy.scale.set(sz, sz * (instanced === stone ? 0.3 : 0.85), sz);
            dummy.rotation.set(Math.random()*0.2,Math.random()*Math.PI*2,Math.random()*0.2);
            dummy.updateMatrix();
            instanced.setMatrixAt(i,dummy.matrix);
        }
        instanced.instanceMatrix.needsUpdate = true;
        instanced.castShadow = false;
        instanced.receiveShadow = true;
        scene.add(instanced);
    }
}

function spawnExplosiveBarrels() {
    explosiveBarrels.forEach(b => { scene.remove(b.mesh); disposeVisualObject(b.mesh); });
    explosiveBarrels = [];
    const barrelCoords = [[-8, -12], [12, -14], [-14, 12], [10, 14], [0, -15], [0, 15], [-20, -4], [20, 4]];
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.3 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

    barrelCoords.forEach(([bx, bz], idx) => {
        const group = new THREE.Group();
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.45, 28, 2), redMat.clone());
        cyl.position.y = 0.725; cyl.castShadow = true;
        group.add(cyl);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.565, 0.565, 0.16, 28), stripeMat);
        ring.position.y = 0.95;
        group.add(ring);
        for (const yy of [0.17,0.72,1.35]) {
            const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.553, 0.028, 8, 28),
                new THREE.MeshStandardMaterial({ color: 0x423b39, roughness: 0.42, metalness: 0.8 }));
            ridge.rotation.x = Math.PI/2; ridge.position.y = yy; group.add(ridge);
        }
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.48,0.48,0.04,28), stripeMat);
        lid.position.y=1.46; group.add(lid);
        group.position.set(bx, 0, bz);
        scene.add(group);
        const barrelObj = { id: idx + 1, mesh: group, x: bx, z: bz, exploded: false };
        cyl.userData = { barrelRef: barrelObj }; ring.userData = { barrelRef: barrelObj };
        explosiveBarrels.push(barrelObj);
    });
}

function triggerBarrelExplosion(barrel, fromNetwork = false) {
    if (barrel.exploded) return;
    barrel.exploded = true;
    sound.playExplosion();
    const pos = new THREE.Vector3(barrel.x, 0.9, barrel.z);
    spawnImpactParticles(pos, 0xf97316, 30);
    spawnImpactParticles(pos, 0xfef08a, 15);
    spawnShockwaveRing(barrel.x, barrel.z, 0xf97316, 9.5);
    spawnExplosionVisual(pos, 2.6);
    spawnGroundDecal(barrel.x, barrel.z, 0x130a04, 2.4);

    const expLight = new THREE.PointLight(0xf97316, 5, 25);
    expLight.position.copy(pos);
    scene.add(expLight);
    setTimeout(() => scene.remove(expLight), 260);

    const distToPlayer = Math.hypot(camera.position.x - barrel.x, camera.position.z - barrel.z);
    if (distToPlayer < 22) state.screenShake = Math.max(0.15, (22 - distToPlayer) * 0.03);

    for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];
        const d = Math.hypot(z.mesh.position.x - barrel.x, z.mesh.position.z - barrel.z);
        if (d < 9.5) {
            const dmg = Math.round(260 * (1 - d / 11));
            damageZombie(z, dmg, z.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), false, true);
        }
    }
    scene.remove(barrel.mesh);
    if (!fromNetwork && net.connected) sendNetMessage({ type: 'EXPLODE_BARREL', id: barrel.id });
}

function buildFirstPersonWeapons() {
    gunGroup = new THREE.Group();
    weaponModels = [];

    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.8, roughness: 0.25 });
    const blackGrip = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.85 });
    const amberAccent = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6, roughness: 0.3 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xa8a29e, metalness: 0.88, roughness: 0.18 });

    const pistolGrp = new THREE.Group();
    const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.36), chromeMat);
    pSlide.position.set(0, 0.04, -0.05); pistolGrp.add(pSlide);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), blackGrip);
    pGrip.position.set(0, -0.07, 0.06); pGrip.rotation.x = 0.25; pistolGrp.add(pGrip);
    pistolGrp.visible = false; gunGroup.add(pistolGrp); weaponModels.push(pistolGrp);

    const rifleGrp = new THREE.Group();
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.13, 0.62), darkMetal); rifleGrp.add(rBody);
    const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 16), blackGrip);
    rBarrel.rotation.x = Math.PI / 2; rBarrel.position.set(0, 0.02, -0.45); rifleGrp.add(rBarrel);
    const rRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.34), amberAccent);
    rRail.position.set(0, 0.085, -0.05); rifleGrp.add(rRail);
    const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.23, 0.10), blackGrip);
    rMag.position.set(0, -0.15, -0.08); rMag.rotation.x = 0.22; rifleGrp.add(rMag);
    gunGroup.add(rifleGrp); weaponModels.push(rifleGrp);

    const shotgunGrp = new THREE.Group();
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.58), darkMetal); shotgunGrp.add(sBody);
    const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.52, 16), chromeMat);
    sBarrel.rotation.x = Math.PI / 2; sBarrel.position.set(0, 0.04, -0.46); shotgunGrp.add(sBarrel);
    const sPump = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.26, 16), amberAccent);
    sPump.rotation.x = Math.PI / 2; sPump.position.set(0, -0.02, -0.36); shotgunGrp.add(sPump);
    shotgunGrp.visible = false; gunGroup.add(shotgunGrp); weaponModels.push(shotgunGrp);

    const sniperGrp = new THREE.Group();
    const snBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.72), darkMetal); sniperGrp.add(snBody);
    const snBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.68, 16), chromeMat);
    snBarrel.rotation.x = Math.PI / 2; snBarrel.position.set(0, 0.03, -0.58); sniperGrp.add(snBarrel);
    const snLaser = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.48), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    snLaser.position.set(0, -0.05, -0.42); sniperGrp.add(snLaser);
    const snScope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 16), blackGrip);
    snScope.rotation.x = Math.PI / 2; snScope.position.set(0, 0.12, -0.08); sniperGrp.add(snScope);
    sniperGrp.visible = false; gunGroup.add(sniperGrp); weaponModels.push(sniperGrp);

    // Silhueta da arma com mira, trilho, gatilho e freio de boca.
    for (const [model, len] of [[pistolGrp,0.21],[rifleGrp,0.36],[shotgunGrp,0.33],[sniperGrp,0.48]]) {
        const sights = new THREE.Mesh(new THREE.BoxGeometry(0.043,0.035,0.045), chromeMat);
        sights.position.set(0,0.12,-len); model.add(sights);
        const trigger = new THREE.Mesh(new THREE.TorusGeometry(0.046,0.012,6,12,Math.PI), blackGrip);
        trigger.position.set(0,-0.13,0.085); trigger.rotation.z=Math.PI; model.add(trigger);
        const flashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.044,0.044,0.08,18),chromeMat);
        flashHider.rotation.x=Math.PI/2; flashHider.position.set(0,0.01,-len-0.23); model.add(flashHider);
    }
    if (typeof enhanceFirstPersonWeapons === 'function') {
        enhanceFirstPersonWeapons({ pistolSlide:pSlide, rifleMag:rMag, shotgunPump:sPump });
    }
    muzzleFlash = createMuzzleFlashVisual();
    muzzleFlash.position.set(0,0.03,-0.75);
    gunGroup.add(muzzleFlash);

    muzzleLight = new THREE.PointLight(0xf59e0b, 0, 10);
    muzzleLight.position.set(0, 0.05, -0.8);
    gunGroup.add(muzzleLight);

    playerFlashlight = new THREE.SpotLight(0xfde047, 2.4, 60, Math.PI / 5.2, 0.45, 1.2);
    playerFlashlight.position.set(0.2, -0.1, -0.3);
    playerFlashlightTarget = new THREE.Object3D();
    playerFlashlightTarget.position.set(0, -0.1, -15);
    camera.add(playerFlashlightTarget);
    playerFlashlight.target = playerFlashlightTarget;
    camera.add(playerFlashlight);

    const beamGeo = new THREE.ConeGeometry(2.6, 14, 14, 1, true);
    beamGeo.translate(0, -7, 0); beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0xfde047, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    });
    flashlightBeam = new THREE.Mesh(beamGeo, beamMat);
    flashlightBeam.position.set(0.22, -0.15, -0.55);
    camera.add(flashlightBeam);

    gunGroup.position.set(0.32, -0.28, -0.52);
    camera.add(gunGroup);
    scene.add(camera);
}

function ejectShellCasing(weaponId) {
    if (!currentGraphicsPreset().casings) return;
    const isShotgun = weaponId === 'SHOTGUN', isSniper = weaponId === 'RAILGUN';
    const geo = new THREE.CylinderGeometry(0.014, 0.014, isShotgun ? 0.065 : 0.045, 6);
    const mat = new THREE.MeshStandardMaterial({
        color: isSniper ? 0xf59e0b : (isShotgun ? 0xdc2626 : 0xfbbf24), metalness: 0.85, roughness: 0.2
    });
    const shell = new THREE.Mesh(geo, mat);
    const spawnPos = new THREE.Vector3(0.36, -0.20, -0.45).applyMatrix4(camera.matrixWorld);
    shell.position.copy(spawnPos);
    shell.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(shell);
    const rightDir = new THREE.Vector3(1, 0.45 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4)
        .applyQuaternion(camera.quaternion).multiplyScalar(2.6 + Math.random() * 1.4);
    shellCasings.push({ mesh: shell, vel: rightDir, life: 2.5 });
}

function spawnGroundDecal(x, z, colorHex = 0x451a03, radius = 0.85) {
    if (groundDecals.length > 30) {
        const oldest = groundDecals.shift();
        scene.remove(oldest.mesh); oldest.mesh.geometry.dispose(); oldest.mesh.material.dispose();
    }
    const geo = new THREE.CircleGeometry(radius * (0.8 + Math.random() * 0.45), 10);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.72, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.025 + Math.random() * 0.01, z);
    scene.add(mesh);
    groundDecals.push({ mesh, mat, life: 18 });
}

function spawnShockwaveRing(x, z, colorHex = 0xf97316, maxRadius = 8.5) {
    if (!currentGraphicsPreset().rings) return;
    const geo = new THREE.RingGeometry(0.4, 0.85, 20);
    const mat = new THREE.MeshBasicMaterial({
        color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.15, z);
    scene.add(mesh);
    shockwaves.push({ mesh, mat, scale: 1, maxScale: maxRadius, life: 0.45 });
}

// Modelagem esférica/cilíndrica com articulação simples e armadura detalhada.
function buildCoopAllyAvatar() {
    const group = new THREE.Group();
    const armor = new THREE.MeshStandardMaterial({ color: 0xa88b52, roughness: 0.72, metalness: 0.08 });
    const fabric = new THREE.MeshStandardMaterial({ color: 0x282e2b, roughness: 0.95 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x995f44, roughness: 0.88 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a4242, roughness: 0.34, metalness: 0.72 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x7edcf8, emissive: 0x13536a, roughness: 0.22, metalness: 0.65 });
    const limb = (x, y, top, bottom, len, mat, sideways = false) => {
        const g = new THREE.CylinderGeometry(top,bottom,len,16,4);
        const m = new THREE.Mesh(g,mat); m.position.set(x,y,0);
        if(sideways) m.rotation.z=sideways;
        m.castShadow=true; group.add(m); return m;
    };
    const legs = [limb(-0.16,0.42,0.137,0.102,0.77,fabric),limb(0.16,0.42,0.137,0.102,0.77,fabric)];
    for(const x of [-0.16,0.16]) {
        const boot=new THREE.Mesh(new THREE.SphereGeometry(0.16,16,12),metal);
        boot.scale.set(1,0.49,1.55);boot.position.set(x,0.105,-0.08);boot.castShadow=true;group.add(boot);
    }
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5,24,18),armor);
    torso.scale.set(0.7,0.96,0.47);torso.position.y=1.24;torso.castShadow=true;group.add(torso);
    const chestRig = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.27,0.13),metal);
    chestRig.position.set(0,1.28,-0.23);group.add(chestRig);
    for(const x of [-0.23,0.23]) {
        const strap=new THREE.Mesh(new THREE.BoxGeometry(0.065,0.64,0.06),fabric);
        strap.position.set(x,1.26,-0.18);strap.rotation.z=x>0?0.12:-0.12;group.add(strap);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25,24,18),skin);
    head.scale.set(0.92,1.08,0.90);head.position.y=1.9;head.castShadow=true;group.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.263,24,14,0,Math.PI*2,0,Math.PI*0.52),fabric);
    helmet.position.y=1.92;group.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.40,0.12,0.075),visorMat);
    visor.position.set(0,1.91,-0.222);group.add(visor);
    const arms=[limb(-0.44,1.36,0.15,0.105,0.65,fabric,0.10),limb(0.44,1.36,0.15,0.105,0.65,fabric,-0.10)];
    for(const x of [-0.44,0.44]) {
        const pad=new THREE.Mesh(new THREE.SphereGeometry(0.185,16,12),armor);
        pad.scale.set(1,0.7,0.9);pad.position.set(x,1.57,0);group.add(pad);
    }
    const allyGun = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.15,0.77),metal);
    allyGun.position.set(0.27,1.25,-0.50);group.add(allyGun);
    const gunBarrel=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.45,16),metal);
    gunBarrel.rotation.x=Math.PI/2;gunBarrel.position.set(0.27,1.26,-0.98);group.add(gunBarrel);
    // Silhuetas próprias para as quatro armas do parceiro (sem alterar hitboxes).
    const rifleWorld = new THREE.Group();
    group.remove(allyGun); group.remove(gunBarrel);
    rifleWorld.add(allyGun); rifleWorld.add(gunBarrel); group.add(rifleWorld);
    function allyWeaponVariant(length, thick, color, mag = true) {
        const variant = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(thick,.12,length*.68),color);
        body.position.set(.27,1.25,-.48); variant.add(body);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(thick*.15,thick*.15,length*.55,12),metal);
        barrel.position.set(.27,1.26,-.48-length*.49); barrel.rotation.x=Math.PI/2; variant.add(barrel);
        if (mag) {
            const clip = new THREE.Mesh(new THREE.BoxGeometry(thick*.5,.18,.09),metal);
            clip.position.set(.27,1.12,-.44);variant.add(clip);
        }
        group.add(variant);variant.visible=false;
        return variant;
    }
    const allyWeapons = {
        RIFLE:rifleWorld,
        PISTOL:allyWeaponVariant(.48,.105,metal,true),
        SHOTGUN:allyWeaponVariant(.92,.16,metal,false),
        RAILGUN:allyWeaponVariant(1.17,.14,visorMat,true)
    };
    const allyMuzzle = createMuzzleFlashVisual();
    allyMuzzle.position.set(0.27,1.26,-1.24);
    group.add(allyMuzzle);
    const allyBeacon=new THREE.PointLight(0x9dd9ee,0.5,7);allyBeacon.position.set(0,2.2,0);group.add(allyBeacon);
    group.userData.rig={legs,arms,torso,head,lastX:0,lastZ:0,phase:0,
        allyWeapons,weaponId:'RIFLE',shotTime:0,reloadRemaining:0,reloadDuration:1};
    group.visible=false;scene.add(group);
    net.ally.meshGroup=group;net.ally.muzzleFlash=allyMuzzle;
}

function animateCoopAlly(dt, elapsedTime) {
    if (!net.ally || !net.ally.meshGroup || !net.ally.meshGroup.visible) return;
    const rig=net.ally.meshGroup.userData.rig;
    if (!rig) return;
    const x=net.ally.meshGroup.position.x,z=net.ally.meshGroup.position.z;
    const speed=Math.min(1,Math.hypot(x-rig.lastX,z-rig.lastZ)/Math.max(dt,0.01)*0.16);
    rig.lastX=x;rig.lastZ=z;
    rig.phase+=dt*(2.0+speed*9);
    const sway=Math.sin(rig.phase)*speed;
    rig.legs[0].rotation.x= THREE.MathUtils.lerp(rig.legs[0].rotation.x, sway*0.57,dt*10);
    rig.legs[1].rotation.x= THREE.MathUtils.lerp(rig.legs[1].rotation.x,-sway*0.57,dt*10);
    rig.arms[0].rotation.x=THREE.MathUtils.lerp(rig.arms[0].rotation.x,-sway*0.25-0.15,dt*9);
    rig.arms[1].rotation.x=THREE.MathUtils.lerp(rig.arms[1].rotation.x,sway*0.25-0.15,dt*9);
    rig.torso.rotation.z=Math.sin(elapsedTime*1.4)*0.025+sway*0.025;
    rig.head.rotation.y=Math.sin(elapsedTime*0.8)*0.07;
    const current = net.ally.weaponId || 'RIFLE';
    if (rig.weaponId !== current) {
        rig.weaponId = current;
        for (const [name,weapon] of Object.entries(rig.allyWeapons)) weapon.visible = name === current;
        const muzzleDepth = {PISTOL:-.89,RIFLE:-1.24,SHOTGUN:-1.19,RAILGUN:-1.43};
        if (net.ally.muzzleFlash) net.ally.muzzleFlash.position.z = muzzleDepth[current] || -1.24;
    }
    rig.shotTime=Math.max(0,rig.shotTime-dt);
    rig.reloadRemaining=Math.max(0,rig.reloadRemaining-dt);
    const progress=rig.reloadRemaining && rig.reloadDuration ? 1-rig.reloadRemaining/rig.reloadDuration : 0;
    const gesture=progress ? Math.sin(Math.PI*progress) : 0;
    rig.arms[0].rotation.x+=gesture*.57;
    rig.arms[1].rotation.x+=gesture*.31;
    rig.torso.rotation.x=rig.shotTime*.22+gesture*.065;
}

// Protótipos: toda geometria do mesmo tipo é compartilhada na GPU.
// Materiais são clonados por inimigo para que os flashes de dano continuem independentes.
const zombiePrototypes = new Map();
const sharedZombieGeometries = new WeakSet();
function createZombieMesh(typeConfig, isAcid = false) {
    const key = `${typeConfig.name || typeConfig.scale}:${isAcid}`;
    const proto = zombiePrototypes.get(key);
    if (proto && typeof proto.group.clone === 'function') {
        const group = proto.group.clone(true);
        const parts = {}, nodeMap = new Map(), uniqueMaterials = new Map();
        const originals = [], copies = [];
        proto.group.traverse(node => originals.push(node));
        group.traverse(node => copies.push(node));
        originals.forEach((node, i) => {
            const copy = copies[i];
            nodeMap.set(node, copy);
            if (!copy || !copy.isMesh) return;
            const separateMaterial = mat => {
                if (!uniqueMaterials.has(mat)) uniqueMaterials.set(mat, typeof mat.clone === 'function' ? mat.clone() : mat);
                return uniqueMaterials.get(mat);
            };
            copy.material = Array.isArray(node.material) ? node.material.map(separateMaterial) : separateMaterial(node.material);
        });
        Object.keys(proto.parts).forEach(name => { parts[name] = nodeMap.get(proto.parts[name]); });
        const details = proto.detailMeshes.map(node => nodeMap.get(node)).filter(Boolean);
        return {group,parts,materials:proto.materials.map(mat => uniqueMaterials.get(mat)),detailMeshes:details};
    }
    const group = new THREE.Group();
    const s = typeConfig.scale;
    const skinMat = new THREE.MeshStandardMaterial({
        color: typeConfig.skinColor, emissive: isAcid ? 0x1a2e05 : 0x000000, roughness: 0.89
    });
    const clothesMat = new THREE.MeshStandardMaterial({color: typeConfig.clothesColor, roughness: 0.92, side: THREE.DoubleSide});
    const pantsMat = new THREE.MeshStandardMaterial({color: 0x383530, roughness: 0.98});
    const dirtMat = new THREE.MeshStandardMaterial({color: 0x241a17, roughness: 1});
    const bloodMat = new THREE.MeshStandardMaterial({color: isAcid?0x507725:0x6f231c,roughness:0.75});
    const eyeMat = new THREE.MeshStandardMaterial({color: typeConfig.eyeColor, emissive:typeConfig.eyeColor, emissiveIntensity: 1.6, roughness:0.45});
    const detailMeshes=[];
    const mark = (mesh,zone,detail=false) => {
        mesh.userData = {isZombiePart:true,hitZone:zone,isHead:zone==='HEAD',isLeg:zone==='LEG'};
        mesh.castShadow=true;mesh.receiveShadow=true;
        if(detail) detailMeshes.push(mesh);
        return mesh;
    };
    const capsule = (radius,height,radial=16) => new THREE.CylinderGeometry(radius*0.86,radius,height,radial,4);
    // Pivôs nas articulações superiores para andar sem atravessar o corpo.
    const legGeo = capsule(0.13*s,0.76*s,18);
    legGeo.translate(0,-0.38*s,0);
    const leftLeg=mark(new THREE.Mesh(legGeo,pantsMat),'LEG');leftLeg.position.set(-0.17*s,0.77*s,0);
    const rightLeg=mark(new THREE.Mesh(legGeo,pantsMat),'LEG');rightLeg.position.set(0.17*s,0.77*s,0);
    group.add(leftLeg,rightLeg);
    for(const leg of [leftLeg,rightLeg]) {
        const boot=mark(new THREE.Mesh(new THREE.SphereGeometry(0.145*s,16,12),dirtMat),'LEG',true);
        boot.scale.set(1,0.55,1.47);boot.position.set(0,-0.68*s,0.052*s);leg.add(boot);
        const knee=mark(new THREE.Mesh(new THREE.SphereGeometry(0.12*s,12,10),pantsMat),'LEG',true);
        knee.scale.set(1,0.85,0.8);knee.position.y=-0.39*s;leg.add(knee);
    }
    const torso=mark(new THREE.Mesh(new THREE.SphereGeometry(0.50*s,24,16),clothesMat),'BODY');
    torso.scale.set(0.72,0.94,0.50);torso.position.set(0,1.20*s,0);group.add(torso);
    const abdomen=mark(new THREE.Mesh(new THREE.CylinderGeometry(0.27*s,0.32*s,0.36*s,18,3),clothesMat),'BODY');
    abdomen.position.y=0.91*s;group.add(abdomen);
    for(const side of [-1,1]) {
        const tear=mark(new THREE.Mesh(new THREE.SphereGeometry(0.12*s,12,8),bloodMat),'BODY',true);
        tear.scale.set(0.85,0.35,0.18);tear.position.set(side*0.35,0.05*s,0.235*s);torso.add(tear);
    }
    const neck=mark(new THREE.Mesh(new THREE.CylinderGeometry(0.145*s,0.17*s,0.23*s,16),skinMat),'BODY');
    neck.position.set(0,1.63*s,0);group.add(neck);
    const head=mark(new THREE.Mesh(new THREE.SphereGeometry(0.265*s,24,18),skinMat),'HEAD');
    head.scale.set(0.88,1.05,0.91);head.position.set(0,1.84*s,0.035*s);group.add(head);
    const jaw=mark(new THREE.Mesh(new THREE.SphereGeometry(0.20*s,16,12),skinMat),'HEAD',true);
    jaw.scale.set(0.95,0.38,0.75);jaw.position.set(0,-0.16*s,0.12*s);head.add(jaw);
    for(const side of [-1,1]) {
        const socket=mark(new THREE.Mesh(new THREE.SphereGeometry(0.092*s,14,10),dirtMat),'HEAD',true);
        socket.scale.set(1.2,0.8,0.37);socket.position.set(side*0.12*s,0.035*s,0.22*s);head.add(socket);
        const eye=mark(new THREE.Mesh(new THREE.SphereGeometry(0.038*s,14,10),eyeMat),'HEAD',true);
        eye.position.set(side*0.12*s,0.035*s,0.252*s);head.add(eye);
    }
    const nose=mark(new THREE.Mesh(new THREE.ConeGeometry(0.064*s,0.14*s,10),skinMat),'HEAD',true);
    nose.rotation.x=Math.PI/2;nose.position.set(0,-0.035*s,0.25*s);head.add(nose);
    const scalp=mark(new THREE.Mesh(new THREE.SphereGeometry(0.23*s,20,12,0,Math.PI*2,0,Math.PI*0.48),dirtMat),'HEAD',true);
    scalp.position.y=0.02*s;head.add(scalp);
    // Braços: pivô no ombro, cotovelo separado, mãos mais arredondadas.
    const armGeo=new THREE.CylinderGeometry(0.115*s,0.087*s,0.68*s,16,4);
    armGeo.translate(0,-0.34*s,0);
    const leftArm=mark(new THREE.Mesh(armGeo,skinMat),'BODY');
    leftArm.position.set(-0.42*s,1.53*s,0.13*s);leftArm.rotation.z=-0.22;
    const rightArm=mark(new THREE.Mesh(armGeo,skinMat),'BODY');
    rightArm.position.set(0.42*s,1.53*s,0.13*s);rightArm.rotation.z=0.22;
    group.add(leftArm,rightArm);
    for(const arm of [leftArm,rightArm]) {
        const upper=mark(new THREE.Mesh(new THREE.SphereGeometry(0.16*s,14,10),clothesMat),'BODY',true);
        upper.scale.set(1.05,0.75,0.95);arm.add(upper);
        const hand=mark(new THREE.Mesh(new THREE.SphereGeometry(0.115*s,14,10),skinMat),'BODY',true);
        hand.scale.set(0.9,1.2,0.8);hand.position.y=-0.68*s;arm.add(hand);
    }
    if(s>1.4) {
        // Gigantes têm ombreiras orgânicas e espinhos ósseos adicionais.
        for(const side of [-1,1]) for(let k=0;k<3;k++) {
            const spike=mark(new THREE.Mesh(new THREE.ConeGeometry(0.11*s,0.28*s,9),skinMat),'BODY',true);
            spike.position.set(side*(0.35+k*0.1)*s,(1.54-k*0.10)*s,0.02*s);
            spike.rotation.z=-side*0.55;group.add(spike);
        }
    }
    if(isAcid) {
        for(let i=0;i<6;i++) {
            const pustule=mark(new THREE.Mesh(new THREE.SphereGeometry(0.065*s,10,8),eyeMat),'BODY',true);
            pustule.position.set(Math.sin(i*2.39)*0.27*s,(1.12+Math.cos(i*1.88)*0.25)*s,0.20*s);
            group.add(pustule);
        }
    }
    const hpBg=new THREE.Mesh(new THREE.PlaneGeometry(0.75*s,0.09*s),new THREE.MeshBasicMaterial({color:0x151516,side:THREE.DoubleSide,depthTest:false}));
    hpBg.position.set(0,2.29*s,0);hpBg.userData={isUI:true};group.add(hpBg);
    const hpFill=new THREE.Mesh(new THREE.PlaneGeometry(0.71*s,0.06*s),new THREE.MeshBasicMaterial({
        color:isAcid?0xa3e635:(s>1.8?0xf43f5e:0xf59e0b),side:THREE.DoubleSide,depthTest:false
    }));
    hpFill.position.set(0,2.29*s,0.015);hpFill.userData={isUI:true};group.add(hpFill);
    const staggerRing=new THREE.Mesh(new THREE.RingGeometry(0.35*s,0.48*s,32),new THREE.MeshBasicMaterial({color:0xfacc15,side:THREE.DoubleSide,transparent:true,opacity:0.9,depthWrite:false}));
    staggerRing.rotation.x=-Math.PI/2;staggerRing.position.set(0,2.12*s,0);
    staggerRing.visible=false;staggerRing.userData={isUI:true};group.add(staggerRing);
    const built = {group,parts:{torso,head,leftLeg,rightLeg,leftArm,rightArm,hpBg,hpFill,staggerRing},materials:[skinMat,clothesMat],detailMeshes};
    if (!proto && typeof group.clone === 'function') {
        zombiePrototypes.set(key, built);
        group.traverse(node => { if (node.isMesh && node.geometry) sharedZombieGeometries.add(node.geometry); });
        // O protótipo original nunca entra na partida e nunca deve ser descartado.
        // Cada spawn, incluindo o primeiro, recebe seus materiais particulares.
        return createZombieMesh(typeConfig, isAcid);
    }
    return built;
}

function animateZombiePose(z, t, moving) {
    if(!z.parts || z.staggerTimer>0) return;
    const phase=t*z.speed*2.3+z.animOffset;
    const stride=moving?1:0.12;
    const s=Math.sin(phase);
    const p=z.parts;
    p.leftLeg.rotation.x=s*0.52*stride;
    p.rightLeg.rotation.x=-s*0.52*stride;
    p.leftArm.rotation.x=-0.25+(-s*0.45*stride);
    p.rightArm.rotation.x=-0.25+s*0.45*stride;
    p.torso.rotation.z=Math.sin(phase*0.5)*0.055;
    p.torso.rotation.x=Math.sin(phase)*0.028*stride;
    p.head.rotation.z=Math.sin(phase*0.5+1)*0.065;
    p.head.rotation.y=Math.sin(phase*0.28)*0.10;
    // O corpo respira; braços e cabeça oscilam mesmo quando imóveis.
    p.torso.scale.y=0.94+Math.sin(t*2.2+z.animOffset)*0.018;
    p.staggerRing.rotation.z+=0.012;
}

function spawnZombie(forcedData = null) {
    let typeKey = 'WALKER';
    if (forcedData) {
        typeKey = forcedData.type;
    } else {
        const rand = Math.random();
        if (state.wave >= 3 && rand > 0.82) typeKey = 'BRUTE';
        else if (state.wave >= 2 && rand > 0.62) typeKey = 'ACID';
        else if (state.wave >= 1 && rand > 0.42) typeKey = 'RUNNER';
    }

    const baseType = ZOMBIE_TYPES[typeKey] || ZOMBIE_TYPES.WALKER;
    const waveMultiplier = 1 + (state.wave - 1) * 0.13;
    const built = createZombieMesh(baseType, typeKey === 'ACID');

    let spawnX = 0, spawnZ = -55;
    if (forcedData) {
        spawnX = forcedData.x; spawnZ = forcedData.z;
    } else {
        const limit = CONFIG.arenaSize - 5;
        const safeRadius = 0.65 * baseType.scale;
        for (let tries = 0; tries < 16; tries++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 34 + Math.random() * 28;
            const cx = THREE.MathUtils.clamp(camera.position.x + Math.cos(angle) * dist, -limit, limit);
            const cz = THREE.MathUtils.clamp(camera.position.z + Math.sin(angle) * dist, -limit, limit);
            if (!checkObstacleCollision(cx, cz, safeRadius)) {
                spawnX = cx; spawnZ = cz;
                break;
            }
        }
    }

    built.group.position.set(spawnX, 0, spawnZ);
    scene.add(built.group);

    const uid = forcedData ? forcedData.uid : state.nextZombieUid++;
    const zombieObj = {
        uid, mesh: built.group, parts: built.parts, materials: built.materials, detailMeshes:built.detailMeshes, type: typeKey,
        hp: forcedData ? forcedData.hp : Math.round(baseType.hp * waveMultiplier),
        maxHp: Math.round(baseType.hp * waveMultiplier),
        speed: baseType.speed * (0.95 + Math.random() * 0.12) * Math.min(1.45, 1 + (state.wave - 1) * 0.04),
        damage: baseType.damage, scoreValue: baseType.score, scale: baseType.scale,
        attackCooldown: 0, animOffset: Math.random() * 100, flashTimer: 0,
        staggerTimer: 0, staggerType: null,
        chargeCooldown: 4.5 + Math.random() * 2.5, chargeState: 'IDLE', chargeTimer: 0, chargeDirX: 0, chargeDirZ: 0
    };

    built.group.traverse(child => {
        if (child.isMesh && child.userData && child.userData.isZombiePart) {
            child.userData.zombieRef = zombieObj;
        }
    });
    zombies.push(zombieObj);
    if (!forcedData) state.zombiesToSpawn--;
    state.zombiesAlive = zombies.length;
    updateHUD();
    return zombieObj;
}

function resetZombieStagger(zombie) {
    zombie.staggerTimer = 0;
    zombie.staggerType = null;
    zombie.mesh.position.y = 0;
    if (zombie.parts) {
        if (zombie.parts.staggerRing) zombie.parts.staggerRing.visible = false;
        if (zombie.parts.torso) {
            zombie.parts.torso.position.y = 1.20 * zombie.scale;
            zombie.parts.torso.rotation.x = 0;
        }
        if (zombie.parts.head) zombie.parts.head.position.y = 1.82 * zombie.scale;
        if (zombie.parts.leftLeg) zombie.parts.leftLeg.rotation.x = 0;
        if (zombie.parts.rightLeg) zombie.parts.rightLeg.rotation.x = 0;
        if (zombie.parts.leftArm) zombie.parts.leftArm.rotation.x = -0.25;
        if (zombie.parts.rightArm) zombie.parts.rightArm.rotation.x = -0.25;
        if (zombie.parts.head) zombie.parts.head.rotation.z = 0;
    }
}

function spawnSupplyCrate() {
    if (supplyCrates.length >= 5) return;
    const isHealth = Math.random() < 0.45;
    const group = new THREE.Group();
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshStandardMaterial({
            color: isHealth ? 0x10b981 : 0xf59e0b, emissive: isHealth ? 0x065f46 : 0x78350f, roughness: 0.3, metalness: 0.4
        })
    );
    box.castShadow = true; group.add(box);
    const light = new THREE.PointLight(isHealth ? 0x10b981 : 0xf59e0b, 1.2, 8);
    light.position.y = 0.6; group.add(light);

    let x = 0, z = 0;
    for (let tries = 0; tries < 10; tries++) {
        x = (Math.random() - 0.5) * 70; z = (Math.random() - 0.5) * 70;
        if (!checkObstacleCollision(x, z, 1.5)) break;
    }
    group.position.set(x, 0.7, z);
    scene.add(group);
    supplyCrates.push({ mesh: group, type: isHealth ? 'HEALTH' : 'AMMO', baseY: 0.7, phase: Math.random() * Math.PI * 2 });
}

function deploySentryTurret() {
    if (activeTurrets.length >= 3) { showCenterAlert('LIMITE DE 3 TORRETAS ATINGIDO!', 1200); return false; }

    const group = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.8, roughness: 0.3 });
    const amberMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xb45309, roughness: 0.2 });

    const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 0.9, 6), baseMat);
    tripod.position.y = 0.45; group.add(tripod);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.65), amberMat);
    head.position.y = 1.0; group.add(head);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), baseMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 0.45); head.add(barrel);
    const tLight = new THREE.PointLight(0xf59e0b, 1.2, 10);
    tLight.position.set(0, 1.35, 0); group.add(tLight);

    group.position.set(camera.position.x, 0, camera.position.z);
    scene.add(group);
    activeTurrets.push({ mesh: group, headMesh: head, cooldown: 0 });
    updateHUD();
    return true;
}

function spawnImpactParticles(pos, colorHex, count = 10) {
    count = Math.max(1, Math.round(count * currentGraphicsPreset().particles));
    const geo = new THREE.SphereGeometry(0.075, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: false });
    const batch={geometry:geo,material:mat,remaining:count};
    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        const r = 0.5+Math.random()*1.5;mesh.scale.set(r,r,r);
        const vel = new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5 + 1.5, (Math.random() - 0.5) * 7);
        scene.add(mesh);
        const life=0.45+Math.random()*0.35;
        particles.push({ mesh, vel, life, maxLife:life, batch });
    }
}

function spawnDamagePopup(worldPos, amount, isHeadshot) {
    const projected = worldPos.clone().project(camera);
    if (projected.z > 1) return;
    const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(projected.y * 0.5) + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = `damage-popup ${isHeadshot ? 'text-red-400 text-lg sm:text-xl' : 'text-amber-300 text-sm sm:text-base'}`;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.textContent = isHeadshot ? `💥 CRITICAL ${amount}` : `-${amount}`;
    dom.popupsContainer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 750);
}

function spawnLootDrop(pos, guaranteed = false, isBoss = false, forcedType = null) {
    if (!guaranteed && !isBoss && Math.random() > 0.55) return null;

    while (lootDrops.length >= 12) {
        const oldest = lootDrops.shift();
        if (oldest && oldest.mesh) { scene.remove(oldest.mesh); disposeVisualObject(oldest.mesh); }
    }

    let dropType = forcedType;
    if (!dropType) {
        const r = Math.random();
        if (isBoss) dropType = 'GOLD';
        else if (r < 0.35) dropType = 'GOLD';
        else if (r < 0.65) dropType = 'AMMO';
        else if (r < 0.85) dropType = 'HERB';
        else dropType = 'COMBO';
    }

    const colors = { GOLD: 0xfacc15, AMMO: 0x38bdf8, HERB: 0x22c55e, COMBO: 0xf43f5e };
    const mat = new THREE.MeshBasicMaterial({ color: colors[dropType] || 0xfacc15 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), mat);
    mesh.position.set(pos.x, 0.45, pos.z);
    scene.add(mesh);

    const drop = { type: dropType, mesh, isBoss, baseY: 0.45, phase: Math.random() * Math.PI * 2, life: 18 };
    lootDrops.push(drop);
    return drop;
}

// Camadas animadas de fogo/fumaça e luz de explosão com descarte de memória.
function spawnExplosionVisual(pos, radius=2.6) {
    const group=new THREE.Group();
    const colors=[0xffe9a4,0xffad37,0xf34b21,0x302820];
    const shells=[];
    const layerCount = gfxQuality === 'ECONOMICO' ? 1 : gfxQuality === 'BAIXO' ? 2 : gfxQuality === 'MEDIO' ? 3 : 4;
    for(let i=0;i<layerCount;i++) {
        const mat=new THREE.MeshBasicMaterial({color:colors[i],transparent:true,opacity:i===3?0.27:0.58,depthWrite:false,blending:i===3?undefined:THREE.AdditiveBlending});
        const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),mat);
        mesh.position.set((Math.random()-0.5)*0.4,(i-1)*0.2,(Math.random()-0.5)*0.4);
        group.add(mesh);shells.push({mesh,mat});
    }
    group.position.copy(pos);scene.add(group);
    explosionFX.push({group,shells,life:0.65,maxLife:0.65,radius});
}

function updateExplosionVisuals(dt) {
    for(let i=explosionFX.length-1;i>=0;i--) {
        const fx=explosionFX[i];fx.life-=dt;
        const progress=Math.min(1,Math.max(0,1-fx.life/fx.maxLife));
        fx.shells.forEach((part,j)=>{
            const radius=fx.radius*(0.32+progress*(0.82+j*0.13));
            part.mesh.scale.set(radius,radius*(j===3?0.7:1.05),radius);
            part.mesh.position.y+=(j===3?1.4:0.15)*dt;
            part.mat.opacity=Math.max(0,(j===3?0.26:0.63)*(1-progress));
        });
        if(fx.life<=0) {
            scene.remove(fx.group);
            fx.shells.forEach(p=>{p.mesh.geometry.dispose();p.mat.dispose();});
            explosionFX.splice(i,1);
        }
    }
}

function disposeVisualObject(root) {
    if (!root || typeof root.traverse !== 'function') return;
    const geometries=new Set(),materials=new Set();
    root.traverse(obj=>{
        if(!obj.isMesh) return;
        if(obj.geometry) geometries.add(obj.geometry);
        if(Array.isArray(obj.material)) obj.material.forEach(m=>materials.add(m));
        else if(obj.material) materials.add(obj.material);
    });
    geometries.forEach(g=>{if(g.dispose && !sharedZombieGeometries.has(g))g.dispose();});
    materials.forEach(m=>{if(m.dispose)m.dispose();});
}
