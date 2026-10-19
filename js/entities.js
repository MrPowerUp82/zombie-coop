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

function generateProceduralTextures() {
    const asphaltCanvas = document.createElement('canvas');
    asphaltCanvas.width = 512; asphaltCanvas.height = 512;
    const actx = asphaltCanvas.getContext('2d');
    actx.fillStyle = '#221a12'; actx.fillRect(0, 0, 512, 512); // Tom terroso/quente RE5 Kijuju
    for (let i = 0; i < 18000; i++) {
        const x = Math.random() * 512, y = Math.random() * 512;
        const v = Math.floor(35 + Math.random() * 40);
        actx.fillStyle = `rgb(${v + 15},${v},${v - 10})`;
        actx.fillRect(x, y, 2, 2);
    }
    const asphaltTex = new THREE.CanvasTexture(asphaltCanvas);
    asphaltTex.wrapS = THREE.RepeatWrapping; asphaltTex.wrapT = THREE.RepeatWrapping; asphaltTex.repeat.set(28, 28);

    const metalCanvas = document.createElement('canvas');
    metalCanvas.width = 256; metalCanvas.height = 256;
    const mctx = metalCanvas.getContext('2d');
    mctx.fillStyle = '#78350f'; mctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
        mctx.fillStyle = x % 32 === 0 ? 'rgba(0,0,0,0.35)' : 'rgba(255,191,0,0.12)';
        mctx.fillRect(x, 0, 8, 256);
    }
    const containerTex = new THREE.CanvasTexture(metalCanvas);
    containerTex.wrapS = THREE.RepeatWrapping; containerTex.wrapT = THREE.RepeatWrapping;

    const crateCanvas = document.createElement('canvas');
    crateCanvas.width = 256; crateCanvas.height = 256;
    const cctx = crateCanvas.getContext('2d');
    cctx.fillStyle = '#92400e'; cctx.fillRect(0, 0, 256, 256);
    cctx.strokeStyle = '#451a03'; cctx.lineWidth = 14; cctx.strokeRect(7, 7, 242, 242);
    const crateTex = new THREE.CanvasTexture(crateCanvas);

    procTextures = { asphaltTex, containerTex, crateTex };
}

function setupLights() {
    const hemiLight = new THREE.HemisphereLight(0xf59e0b, 0x451a03, 0.75); // Luz solar escaldante Kijuju RE5
    hemiLight.position.set(0, 55, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfde047, 1.15);
    sunLight.position.set(45, 65, -35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 175;
    sunLight.shadow.bias = -0.0005;
    const d = 78;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    const sunGeo = new THREE.SphereGeometry(7.5, 20, 20);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffedd5 });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(65, 82, -85);
    scene.add(sunMesh);

    const haloGeo = new THREE.SphereGeometry(14.5, 18, 18);
    const haloMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.copy(sunMesh.position);
    scene.add(haloMesh);

    const dustCount = 180;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
        dustPos[i * 3] = (Math.random() - 0.5) * 130;
        dustPos[i * 3 + 1] = 0.4 + Math.random() * 9;
        dustPos[i * 3 + 2] = (Math.random() - 0.5) * 130;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
        color: 0xfbbf24, size: 0.19, transparent: true, opacity: 0.52, blending: THREE.AdditiveBlending
    });
    ambientDust = new THREE.Points(dustGeo, dustMat);
    scene.add(ambientDust);
}

function buildEnvironment() {
    const floorGeo = new THREE.PlaneGeometry(CONFIG.arenaSize * 2, CONFIG.arenaSize * 2, 20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
        map: procTextures.asphaltTex,
        bumpMap: procTextures.asphaltTex,
        bumpScale: 0.08,
        color: 0xb45309,
        roughness: 0.55,
        metalness: 0.15
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(CONFIG.arenaSize * 2, 40, 0xf59e0b, 0x78350f);
    grid.position.y = 0.02;
    grid.material.opacity = 0.22;
    grid.material.transparent = true;
    scene.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({
        map: procTextures.containerTex, color: 0x78350f, roughness: 0.72, metalness: 0.25
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
        map: procTextures.crateTex, bumpMap: procTextures.crateTex, bumpScale: 0.05, color: 0xd97706, roughness: 0.65, metalness: 0.12
    });
    const containerRedMat = new THREE.MeshStandardMaterial({
        map: procTextures.containerTex, bumpMap: procTextures.containerTex, bumpScale: 0.05, color: 0xb91c1c, roughness: 0.45, metalness: 0.38
    });
    const containerRustMat = new THREE.MeshStandardMaterial({
        map: procTextures.containerTex, bumpMap: procTextures.containerTex, bumpScale: 0.05, color: 0xc2410c, roughness: 0.52, metalness: 0.35
    });
    const pillarMat = new THREE.MeshStandardMaterial({
        map: procTextures.asphaltTex, color: 0x78350f, roughness: 0.8, metalness: 0.18
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
    });

    spawnExplosiveBarrels();
}

function spawnExplosiveBarrels() {
    explosiveBarrels.forEach(b => scene.remove(b.mesh));
    explosiveBarrels = [];
    const barrelCoords = [[-8, -12], [12, -14], [-14, 12], [10, 14], [0, -15], [0, 15], [-20, -4], [20, 4]];
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.3 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

    barrelCoords.forEach(([bx, bz], idx) => {
        const group = new THREE.Group();
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.45, 10), redMat.clone());
        cyl.position.y = 0.725; cyl.castShadow = true;
        group.add(cyl);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.16, 10), stripeMat);
        ring.position.y = 0.95;
        group.add(ring);
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
    const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), blackGrip);
    rBarrel.rotation.x = Math.PI / 2; rBarrel.position.set(0, 0.02, -0.45); rifleGrp.add(rBarrel);
    const rRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.34), amberAccent);
    rRail.position.set(0, 0.085, -0.05); rifleGrp.add(rRail);
    const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.23, 0.10), blackGrip);
    rMag.position.set(0, -0.15, -0.08); rMag.rotation.x = 0.22; rifleGrp.add(rMag);
    gunGroup.add(rifleGrp); weaponModels.push(rifleGrp);

    const shotgunGrp = new THREE.Group();
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.58), darkMetal); shotgunGrp.add(sBody);
    const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.52, 10), chromeMat);
    sBarrel.rotation.x = Math.PI / 2; sBarrel.position.set(0, 0.04, -0.46); shotgunGrp.add(sBarrel);
    const sPump = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.26, 8), amberAccent);
    sPump.rotation.x = Math.PI / 2; sPump.position.set(0, -0.02, -0.36); shotgunGrp.add(sPump);
    shotgunGrp.visible = false; gunGroup.add(shotgunGrp); weaponModels.push(shotgunGrp);

    const sniperGrp = new THREE.Group();
    const snBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.72), darkMetal); sniperGrp.add(snBody);
    const snBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.68, 10), chromeMat);
    snBarrel.rotation.x = Math.PI / 2; snBarrel.position.set(0, 0.03, -0.58); sniperGrp.add(snBarrel);
    const snLaser = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.48), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    snLaser.position.set(0, -0.05, -0.42); sniperGrp.add(snLaser);
    const snScope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 10), blackGrip);
    snScope.rotation.x = Math.PI / 2; snScope.position.set(0, 0.12, -0.08); sniperGrp.add(snScope);
    sniperGrp.visible = false; gunGroup.add(sniperGrp); weaponModels.push(sniperGrp);

    const flashGeo = new THREE.ConeGeometry(0.14, 0.35, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.9 });
    muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    muzzleFlash.rotation.x = -Math.PI / 2; muzzleFlash.position.set(0, 0.03, -0.75); muzzleFlash.visible = false;
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
    if (gfxQuality !== 'ULTRA') return;
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

function buildCoopAllyAvatar() {
    const group = new THREE.Group();
    const vestMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 });
    const darkSuit = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.8 });
    const visorMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x292524, metalness: 0.7 });

    const legGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    const lLeg = new THREE.Mesh(legGeo, darkSuit); lLeg.position.set(-0.16, 0.375, 0); group.add(lLeg);
    const rLeg = new THREE.Mesh(legGeo, darkSuit); rLeg.position.set(0.16, 0.375, 0); group.add(rLeg);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.82, 0.38), vestMat);
    torso.position.set(0, 1.15, 0); torso.castShadow = true; group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), darkSuit);
    head.position.set(0, 1.82, 0); head.castShadow = true; group.add(head);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.14, 0.06), visorMat);
    visor.position.set(0, 1.84, -0.23); group.add(visor);

    const allyGun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.75), gunMat);
    allyGun.position.set(0.26, 1.35, -0.48); group.add(allyGun);

    const allyMuzzle = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
    allyMuzzle.rotation.x = -Math.PI / 2; allyMuzzle.position.set(0.26, 1.35, -0.95); allyMuzzle.visible = false; group.add(allyMuzzle);

    const allyBeacon = new THREE.PointLight(0xf59e0b, 1.0, 9);
    allyBeacon.position.set(0, 2.2, 0); group.add(allyBeacon);

    group.visible = false;
    scene.add(group);
    net.ally.meshGroup = group;
    net.ally.muzzleFlash = allyMuzzle;
}

function createZombieMesh(typeConfig, isAcid = false) {
    const group = new THREE.Group();
    const s = typeConfig.scale;

    const skinMat = new THREE.MeshStandardMaterial({
        color: typeConfig.skinColor, emissive: isAcid ? 0x1a2e05 : 0x000000, roughness: 0.75
    });
    const clothesMat = new THREE.MeshStandardMaterial({ color: typeConfig.clothesColor, roughness: 0.85 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.9 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: typeConfig.eyeColor });

    const legGeo = new THREE.BoxGeometry(0.24 * s, 0.75 * s, 0.24 * s);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat); leftLeg.position.set(-0.16 * s, 0.375 * s, 0); leftLeg.castShadow = true;
    leftLeg.userData = { isZombiePart: true, hitZone: 'LEG', isHead: false, isLeg: true }; group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, pantsMat); rightLeg.position.set(0.16 * s, 0.375 * s, 0); rightLeg.castShadow = true;
    rightLeg.userData = { isZombiePart: true, hitZone: 'LEG', isHead: false, isLeg: true }; group.add(rightLeg);

    const torsoGeo = new THREE.BoxGeometry(0.62 * s, 0.82 * s, 0.34 * s);
    const torso = new THREE.Mesh(torsoGeo, clothesMat); torso.position.set(0, 1.15 * s, 0); torso.castShadow = true;
    torso.userData = { isZombiePart: true, hitZone: 'BODY', isHead: false, isLeg: false }; group.add(torso);

    const headGeo = new THREE.BoxGeometry(0.46 * s, 0.46 * s, 0.46 * s);
    const head = new THREE.Mesh(headGeo, skinMat); head.position.set(0, 1.82 * s, 0); head.castShadow = true;
    head.userData = { isZombiePart: true, hitZone: 'HEAD', isHead: true, isLeg: false }; group.add(head);

    const eyeGeo = new THREE.BoxGeometry(0.08 * s, 0.06 * s, 0.05 * s);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat); leftEye.position.set(-0.11 * s, 1.86 * s, 0.23 * s); group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat); rightEye.position.set(0.11 * s, 1.86 * s, 0.23 * s); group.add(rightEye);

    const armGeo = new THREE.BoxGeometry(0.2 * s, 0.2 * s, 0.72 * s);
    const leftArm = new THREE.Mesh(armGeo, skinMat); leftArm.position.set(-0.42 * s, 1.38 * s, 0.28 * s); leftArm.castShadow = true;
    leftArm.userData = { isZombiePart: true, hitZone: 'BODY', isHead: false, isLeg: false }; group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, skinMat); rightArm.position.set(0.42 * s, 1.38 * s, 0.28 * s); rightArm.castShadow = true;
    rightArm.userData = { isZombiePart: true, hitZone: 'BODY', isHead: false, isLeg: false }; group.add(rightArm);

    const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(0.75 * s, 0.09 * s), new THREE.MeshBasicMaterial({ color: 0x1c1917, side: THREE.DoubleSide }));
    hpBg.position.set(0, 2.25 * s, 0); hpBg.userData = { isUI: true }; group.add(hpBg);

    const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(0.71 * s, 0.06 * s), new THREE.MeshBasicMaterial({
        color: isAcid ? 0xa3e635 : (typeConfig.scale > 1.8 ? 0xf43f5e : 0xf59e0b), side: THREE.DoubleSide
    }));
    hpFill.position.set(0, 2.25 * s, 0.01); hpFill.userData = { isUI: true }; group.add(hpFill);

    const staggerRing = new THREE.Mesh(new THREE.RingGeometry(0.35 * s, 0.48 * s, 16), new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide }));
    staggerRing.rotation.x = -Math.PI / 2;
    staggerRing.position.set(0, 2.08 * s, 0);
    staggerRing.visible = false;
    staggerRing.userData = { isUI: true };
    group.add(staggerRing);

    return { group, parts: { torso, head, leftLeg, rightLeg, leftArm, rightArm, hpBg, hpFill, staggerRing }, materials: [skinMat, clothesMat] };
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
        uid, mesh: built.group, parts: built.parts, materials: built.materials, type: typeKey,
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
            zombie.parts.torso.position.y = 1.15 * zombie.scale;
            zombie.parts.torso.rotation.x = 0;
        }
        if (zombie.parts.head) zombie.parts.head.position.y = 1.82 * zombie.scale;
        if (zombie.parts.leftLeg) zombie.parts.leftLeg.rotation.x = 0;
        if (zombie.parts.rightLeg) zombie.parts.rightLeg.rotation.x = 0;
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

function createBulletTracer(startPos, endPos, colorHex = 0xfde047) {
    const points = [startPos, endPos];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    bulletTracers.push({ line, mat, life: 0.065 });
}

function spawnImpactParticles(pos, colorHex, count = 10) {
    const geo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        const vel = new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5 + 1.5, (Math.random() - 0.5) * 7);
        scene.add(mesh);
        particles.push({ mesh, vel, life: 0.45 + Math.random() * 0.35 });
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
        if (oldest && oldest.mesh) scene.remove(oldest.mesh);
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), mat);
    mesh.position.set(pos.x, 0.45, pos.z);
    scene.add(mesh);

    const drop = { type: dropType, mesh, isBoss, baseY: 0.45, phase: Math.random() * Math.PI * 2, life: 18 };
    lootDrops.push(drop);
    return drop;
}
