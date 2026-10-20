// ==========================================
// LOOP PRINCIPAL, COMBATE RE5 E CONTROLADORES
// Inicialização Three.js, Mecânicas de Jogo e Interface
// ==========================================

function initThreeJS() {
    generateProceduralTextures();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x42372e); // Atmosfera árida cinematográfica
    scene.fog = new THREE.FogExp2(0x42372e, 0.0072);

    camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 240);
    camera.rotation.order = 'YXZ';
    camera.position.set(0, CONFIG.playerHeight, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.id = 'game-canvas';
    if (dom.container) dom.container.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    setupLights();
    buildEnvironment();
    buildFirstPersonWeapons();
    buildCoopAllyAvatar();
    if (typeof initializeCinematicPost === 'function') initializeCinematicPost();
    setupEventListeners();
}

function toggleGraphicsQuality() {
    gfxQuality = gfxQuality === 'ULTRA' ? 'ALTO' : 'ULTRA';
    const isUltra=gfxQuality==='ULTRA';
    const lbl = document.getElementById('gfx-label');
    if (lbl) lbl.textContent = `GFX: ${gfxQuality}`;
    renderer.setPixelRatio(isUltra ? Math.min(window.devicePixelRatio || 1, 1.6) : 1);
    renderer.shadowMap.enabled = true;
    if(scene.userData.sunLight) {
        scene.userData.sunLight.shadow.mapSize.set(isUltra?2048:1024,isUltra?2048:1024);
        // Força reconstruir a textura de sombra ao trocar preset.
        if(scene.userData.sunLight.shadow.map) {
            scene.userData.sunLight.shadow.map.dispose();
            scene.userData.sunLight.shadow.map=null;
        }
    }
    if (flashlightBeam) flashlightBeam.visible = (isUltra && state.flashlightOn);
    if (typeof resizeCinematicPost === 'function') resizeCinematicPost();
    showCenterAlert(`✨ GRÁFICOS ${gfxQuality}: ${isUltra ? 'BLOOM + PÓS-PROCESSAMENTO' : 'MODO DESEMPENHO'}`, 1500);
}

function cancelReload() {
    if (state.reloadTimerId !== null) {
        clearTimeout(state.reloadTimerId);
        state.reloadTimerId = null;
    }
    state.isReloading = false;
}

function switchWeapon(index) {
    if (index < 0 || index >= WEAPONS.length || index === state.currentWeaponIdx) return;
    cancelReload(); setAiming(false); dom.centerAlert.classList.add('hidden');
    state.currentWeaponIdx = index;
    weaponModels.forEach((m, i) => { m.visible = (i === index); });
    for (let i = 0; i < WEAPONS.length; i++) {
        const btn = document.getElementById(`slot-wep-${i}`);
        if (!btn) continue;
        if (i === index) btn.className = 'interactive px-2.5 py-2 rounded-lg bg-amber-500/25 border border-amber-400 text-left transition flex flex-col min-w-[85px] scale-105';
        else btn.className = 'interactive px-2.5 py-2 rounded-lg bg-slate-950/60 border border-amber-900/40 text-left transition flex flex-col min-w-[85px] opacity-75';
    }
    sound.playReload(); updateHUD();
}

function setAiming(aim) {
    state.isAiming = aim;
    if (aim && state.currentWeaponIdx === 3) {
        dom.scopeOverlay.classList.remove('hidden'); gunGroup.visible = false;
    } else {
        dom.scopeOverlay.classList.add('hidden'); if (gunGroup) gunGroup.visible = true;
    }
}

function startWave(waveNum) {
    state.wave = waveNum;
    const coopBonus = net.connected ? 1.35 : 1.0;
    state.zombiesToSpawn = Math.round((6 + waveNum * 4) * coopBonus);
    state.spawnTimer = 0.5;

    if (state.bossSpawnTimerId) { clearTimeout(state.bossSpawnTimerId); state.bossSpawnTimerId = null; }
    const isBossWave = (waveNum % 3 === 0);
    if (isBossWave && net.mode !== 'CLIENT') {
        state.bossSpawnTimerId = setTimeout(() => {
            state.bossSpawnTimerId = null;
            if (state.status === 'PLAYING' || state.status === 'SHOP') {
                spawnZombie({
                    uid: state.nextZombieUid++, type: 'BOSS', x: 0, z: -CONFIG.arenaSize + 12,
                    hp: Math.round(ZOMBIE_TYPES.BOSS.hp * (1 + (waveNum - 3) * 0.25))
                });
                sound.playExplosion();
                showCenterAlert('☠️ ALERTA RE5: MAJINI NÉMESIS ATIVADO!', 3500);
            }
        }, 1500);
    }

    updateHUD();
    dom.waveBannerText.textContent = isBossWave ? `☠️ CAPÍTULO ${waveNum}: NÉMESIS!` : `CAPÍTULO ${waveNum} EM ANDAMENTO`;
    dom.waveBanner.classList.remove('hidden');
    setTimeout(() => dom.waveBanner.classList.add('hidden'), 3000);
}

function throwGrenade() {
    if (state.status !== 'PLAYING' || state.isDowned) return;
    if (state.grenades <= 0) { showCenterAlert('SEM GRANADAS! COMPRE NA LOJA [B]', 1000); sound.playEmptyGun(); return; }
    state.grenades--; updateHUD(); sound.playShoot('PISTOL');

    const gMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xb45309, roughness: 0.4 })
    );
    gMesh.position.copy(camera.position).add(new THREE.Vector3(0, -0.2, 0));
    scene.add(gMesh);

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const vel = dir.multiplyScalar(19).add(new THREE.Vector3(0, 5.5, 0));
    activeGrenades.push({ mesh: gMesh, vel, timer: 1.55 });
}

function performTacticalDash() {
    if (state.status !== 'PLAYING' || state.isDowned) return;
    if (state.dashCooldown > 0 || state.stamina < 25) { showCenterAlert('FÔLEGO ESGOTADO!', 800); return; }
    state.stamina = Math.max(0, state.stamina - 25);
    state.dashCooldown = 2.2;
    state.invulnTimer = 0.35;
    sound.playPing();

    let moveForward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    let moveRight = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    if (mobileInput.active) { moveForward = -mobileInput.moveY; moveRight = mobileInput.moveX; }

    const forwardVec = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const rightVec = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    const dashDir = new THREE.Vector3().addScaledVector(forwardVec, moveForward).addScaledVector(rightVec, moveRight);
    if (dashDir.lengthSq() < 0.01) dashDir.copy(forwardVec);
    dashDir.normalize();

    for (let step = 0; step < 8; step++) {
        const nx = camera.position.x + dashDir.x * 0.65;
        const nz = camera.position.z + dashDir.z * 0.65;
        if (!checkObstacleCollision(nx, nz, CONFIG.playerRadius)) {
            camera.position.x = nx; camera.position.z = nz;
        }
    }
    showCenterAlert('💨 ESQUIVA TÁTICA (DASH)!', 650);
}

function fireWeapon() {
    if (state.status !== 'PLAYING' || state.isReloading || state.isDowned) return;
    const wep = WEAPONS[state.currentWeaponIdx];
    const wepState = state.weaponsState[state.currentWeaponIdx];
    const now = clock.getElapsedTime();
    if (now - state.lastFireTime < wep.fireRate) return;

    if (wepState.mag <= 0) {
        sound.playEmptyGun(); showCenterAlert('SEM MUNIÇÃO! PRESSIONE R', 900);
        if (wepState.reserve > 0) reloadWeapon();
        state.lastFireTime = now + 0.25; return;
    }

    state.lastFireTime = now; wepState.mag--; updateHUD(); sound.playShoot(wep.id); ejectShellCasing(wep.id);
    state.weaponRecoil = wep.recoil;
    state.pitch = Math.min(Math.PI / 2.2, state.pitch + wep.recoil * 0.09);

    dom.crosshair.classList.add('crosshair-expand');
    setTimeout(() => dom.crosshair.classList.remove('crosshair-expand'), 80);

    muzzleFlash.visible = true; muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    muzzleLight.intensity = 2.6;
    setTimeout(() => { if (muzzleFlash) muzzleFlash.visible = false; if (muzzleLight) muzzleLight.intensity = 0; }, 45);

    const targetMeshes = [];
    zombies.forEach(z => { z.mesh.traverse(c => { if (c.isMesh && c.userData && c.userData.isZombiePart && c.visible) targetMeshes.push(c); }); });
    explosiveBarrels.forEach(b => { if (!b.exploded) b.mesh.traverse(c => { if (c.isMesh) targetMeshes.push(c); }); });
    obstacles.forEach(o => targetMeshes.push(o.mesh));

    const barrelTip = new THREE.Vector3(0.28, -0.22, -1.1).applyMatrix4(camera.matrixWorld);
    const dmgMult = 1 + (state.perks.damageLvl - 1) * 0.25;
    const effectiveSpread = state.isAiming ? wep.spread * 0.2 : wep.spread;
    const tracerColor = wep.id === 'RAILGUN' ? 0xf59e0b : 0xfde047;

    for (let p = 0; p < wep.pellets; p++) {
        const spreadX = (Math.random() - 0.5) * effectiveSpread;
        const spreadY = (Math.random() - 0.5) * effectiveSpread;
        raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), camera);
        const intersects = raycaster.intersectObjects(targetMeshes, false);
        let endPoint = new THREE.Vector3(); raycaster.ray.at(90, endPoint);

        if (intersects.length > 0) {
            const hit = intersects[0];
            endPoint.copy(hit.point);
            const barrelRef = hit.object.userData.barrelRef;
            const zombieRef = hit.object.userData.zombieRef;
            if (barrelRef) {
                triggerBarrelExplosion(barrelRef, false);
            } else if (zombieRef) {
                const hitZone = hit.object.userData.hitZone || (hit.object.userData.isHead ? 'HEAD' : 'BODY');
                const isHead = hitZone === 'HEAD';
                const totalDmg = Math.round(wep.damage * dmgMult * (isHead ? wep.headshotMult : 1));
                damageZombie(zombieRef, totalDmg, hit.point, isHead, false, hitZone);
            } else {
                spawnImpactParticles(hit.point, 0xfbbf24, 4);
            }
        }
        createBulletTracer(barrelTip, endPoint, tracerColor);
        if (p === 0 && net.connected) {
            sendNetMessage({
                type: 'SHOOT_FX', weaponId: wep.id,
                sx: barrelTip.x, sy: barrelTip.y, sz: barrelTip.z, ex: endPoint.x, ey: endPoint.y, ez: endPoint.z
            });
        }
    }
    if (!wep.auto) mouse.isDown = false;
}

function damageZombie(zombie, amount, hitPoint, isHeadshot, fromNetwork = false, hitZone = null, isMelee = false) {
    const resolvedZone = hitZone || (isHeadshot ? 'HEAD' : 'BODY');
    const finalAmount = (!fromNetwork && resolvedZone === 'LEG') ? Math.round(amount * 0.85) : amount;

    sound.playHit(isHeadshot);
    dom.hitmarker.style.opacity = '1';
    setTimeout(() => { dom.hitmarker.style.opacity = '0'; }, 90);
    spawnDamagePopup(hitPoint, finalAmount, isHeadshot || isMelee);
    spawnImpactParticles(hitPoint, isHeadshot ? 0xdc2626 : 0x92400e, isHeadshot ? 12 : 6);

    zombie.materials.forEach(mat => mat.emissive.setHex(0x7f1d1d));
    zombie.flashTimer = 0.1;

    if (net.connected && net.mode === 'CLIENT' && !fromNetwork) {
        sendNetMessage({ type: 'CLIENT_HIT_ZOMBIE', uid: zombie.uid, damage: finalAmount, isHeadshot, hx: hitPoint.x, hy: hitPoint.y, hz: hitPoint.z });
    }

    zombie.hp -= finalAmount;
    if (zombie.parts && zombie.parts.hpFill) {
        const hpRatio = Math.max(0.01, zombie.hp / zombie.maxHp);
        zombie.parts.hpFill.scale.x = hpRatio;
    }

    const pushDir = new THREE.Vector3().subVectors(zombie.mesh.position, camera.position).setY(0).normalize();
    const knockX = zombie.mesh.position.x + pushDir.x * 0.42;
    const knockZ = zombie.mesh.position.z + pushDir.z * 0.42;
    if (!checkObstacleCollision(knockX, knockZ, 0.5)) {
        zombie.mesh.position.x = knockX; zombie.mesh.position.z = knockZ;
    }

    if (zombie.hp > 0 && zombie.staggerTimer <= 0 && (resolvedZone === 'HEAD' || resolvedZone === 'LEG')) {
        let staggerChance = 0;
        if (resolvedZone === 'HEAD') {
            staggerChance = zombie.type === 'BOSS' ? 0.20 : (zombie.type === 'BRUTE' ? 0.35 : 0.65);
        } else if (resolvedZone === 'LEG') {
            staggerChance = zombie.type === 'BOSS' ? 0.0 : (zombie.type === 'BRUTE' ? 0.40 : 0.75);
        }
        if (staggerChance > 0 && Math.random() < staggerChance) {
            zombie.staggerTimer = 2.8;
            zombie.staggerType = resolvedZone === 'HEAD' ? 'HEAD' : 'KNEE';
            zombie.chargeState = 'IDLE';
            if (zombie.parts && zombie.parts.staggerRing) zombie.parts.staggerRing.visible = true;
        }
    }

    if (zombie.hp <= 0) killZombie(zombie, isHeadshot, isMelee);
}

function performMeleeAttack() {
    if (state.status !== 'PLAYING' || state.isDowned) return false;

    let staggeredTarget = null, minStaggerDist = 3.8;
    for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (z.staggerTimer > 0) {
            const d = Math.hypot(z.mesh.position.x - camera.position.x, z.mesh.position.z - camera.position.z);
            if (d <= minStaggerDist) { minStaggerDist = d; staggeredTarget = z; }
        }
    }

    if (staggeredTarget) {
        sound.playMelee();
        state.invulnTimer = 0.6;
        state.meleeCooldown = 0.9;
        state.screenShake = 0.22;
        const center = staggeredTarget.mesh.position.clone();

        const toTarget = new THREE.Vector3(center.x - camera.position.x, 0, center.z - camera.position.z).normalize();
        const playerStep = steerEntityMove(camera.position.x, camera.position.z, toTarget.x, toTarget.z, 0.8, CONFIG.playerRadius);
        camera.position.x = playerStep.x; camera.position.z = playerStep.z;

        spawnShockwaveRing(center.x, center.z, 0xf59e0b, 3.8);
        spawnImpactParticles(center.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xf59e0b, 18);
        showCenterAlert('🥊 GOLPE MARCIAL B.S.A.A.!', 1100);

        resetZombieStagger(staggeredTarget);

        const nearby = zombies.slice();
        for (let i = 0; i < nearby.length; i++) {
            const z = nearby[i];
            if (z === staggeredTarget) continue;
            const d = Math.hypot(z.mesh.position.x - center.x, z.mesh.position.z - center.z);
            if (d <= 3.8) {
                const push = new THREE.Vector3(z.mesh.position.x - camera.position.x, 0, z.mesh.position.z - camera.position.z).normalize();
                const stepped = steerEntityMove(z.mesh.position.x, z.mesh.position.z, push.x, push.z, 2.6, 0.45 * z.scale);
                z.mesh.position.x = stepped.x; z.mesh.position.z = stepped.z;
                damageZombie(z, 95, z.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), false, false, 'BODY', true);
            }
        }

        const pushPrimary = new THREE.Vector3(center.x - camera.position.x, 0, center.z - camera.position.z).normalize();
        const steppedPrimary = steerEntityMove(center.x, center.z, pushPrimary.x, pushPrimary.z, 2.6, 0.45 * staggeredTarget.scale);
        staggeredTarget.mesh.position.x = steppedPrimary.x; staggeredTarget.mesh.position.z = steppedPrimary.z;
        damageZombie(staggeredTarget, 180, center.clone().add(new THREE.Vector3(0, 1.2, 0)), false, false, 'BODY', true);
        return true;
    }

    if (state.meleeCooldown > 0) return false;
    state.meleeCooldown = 1.8;
    sound.playMelee();
    state.screenShake = 0.08;

    const forwardX = -Math.sin(state.yaw), forwardZ = -Math.cos(state.yaw);
    const snapshot = zombies.slice();
    for (let i = 0; i < snapshot.length; i++) {
        const z = snapshot[i];
        const dx = z.mesh.position.x - camera.position.x, dz = z.mesh.position.z - camera.position.z;
        const d = Math.hypot(dx, dz);
        if (d <= 2.6 && d > 0.001) {
            const dot = (dx / d) * forwardX + (dz / d) * forwardZ;
            if (dot > 0.1) {
                const push = new THREE.Vector3(dx, 0, dz).normalize();
                const stepped = steerEntityMove(z.mesh.position.x, z.mesh.position.z, push.x, push.z, 1.6, 0.45 * z.scale);
                z.mesh.position.x = stepped.x; z.mesh.position.z = stepped.z;
                z.attackCooldown = 1.1;
                damageZombie(z, 35, z.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), false, false, 'BODY', false);
            }
        }
    }
    return true;
}

function killZombie(zombie, isHeadshot, isMelee = false) {
    const deathPos = zombie.mesh.position.clone();
    const centerPos = deathPos.clone().add(new THREE.Vector3(0, 1.1, 0));
    spawnGroundDecal(deathPos.x, deathPos.z, zombie.type === 'ACID' ? 0x14532d : 0x451a03, zombie.type === 'BOSS' ? 2.2 : 0.95);

    if (zombie.type === 'ACID') {
        spawnImpactParticles(centerPos, 0xa3e635, 22);
        spawnShockwaveRing(centerPos.x, centerPos.z, 0xa3e635, 4.2);
        const distPlayer = Math.hypot(camera.position.x - centerPos.x, camera.position.z - centerPos.z);
        if (distPlayer < 4.2) { takePlayerDamage(15); showCenterAlert('☣️ PLAGAS ÁCIDO EXPELIDO!', 1100); }
    } else {
        spawnImpactParticles(centerPos, 0x991b1b, 16);
    }

    const idx = zombies.indexOf(zombie);
    if (idx !== -1) zombies.splice(idx, 1);

    if (zombie.parts) {
        if (zombie.parts.hpBg) zombie.parts.hpBg.visible = false;
        if (zombie.parts.hpFill) zombie.parts.hpFill.visible = false;
        if (zombie.parts.staggerRing) zombie.parts.staggerRing.visible = false;
        if ((isHeadshot || isMelee) && zombie.parts.head) {
            zombie.parts.head.visible = false;
            spawnImpactParticles(deathPos.clone().add(new THREE.Vector3(0, 1.8 * zombie.scale, 0)), 0xdc2626, 16);
        }
    }

    const pushDir = new THREE.Vector3().subVectors(deathPos, camera.position).setY(0).normalize();
    dyingZombies.push({
        mesh: zombie.mesh,
        velX: pushDir.x * (isMelee ? 4.5 : 2.2),
        velZ: pushDir.z * (isMelee ? 4.5 : 2.2),
        life: 1.1
    });

    spawnLootDrop(deathPos, isMelee || zombie.type === 'BRUTE' || zombie.type === 'BOSS', zombie.type === 'BOSS');

    state.zombiesAlive = zombies.length;
    state.kills++;
    state.combo = Math.min(10, state.combo + (isMelee ? 2 : 1));
    state.comboTimer = isMelee ? 5.5 : 4.5;

    const basePoints = zombie.scoreValue + (isHeadshot ? 50 : 0) + (isMelee ? 75 : 0);
    state.score += Math.round(basePoints * (1 + (state.combo - 1) * 0.15));

    if (zombie.type === 'BOSS') {
        sound.playExplosion(); showCenterAlert('🏆 MAJINI NÉMESIS DERROTADO!', 2500);
    } else if (isMelee) {
        showCenterAlert(`🥊 EXECUÇÃO MARCIAL! COMBO ${state.combo}x`, 950);
    } else if (isHeadshot) {
        showCenterAlert(`CRITICAL HEADSHOT! COMBO ${state.combo}x`, 900);
    }

    updateHUD();
    if (net.mode !== 'CLIENT' && state.zombiesAlive <= 0 && state.zombiesToSpawn <= 0) {
        state.score += state.wave * 250;
        updateHUD();
        if (state.nextWaveTimerId) clearTimeout(state.nextWaveTimerId);
        state.nextWaveTimerId = setTimeout(() => {
            state.nextWaveTimerId = null;
            if (state.status === 'PLAYING' || state.status === 'SHOP') startWave(state.wave + 1);
        }, 2500);
    }
}

function reloadWeapon() {
    const wepIdx = state.currentWeaponIdx;
    const wep = WEAPONS[wepIdx];
    const wepState = state.weaponsState[wepIdx];
    if (state.isReloading || wepState.mag === wep.magSize || wepState.reserve <= 0) return;

    cancelReload();
    state.isReloading = true;
    sound.playReload();
    const reloadDuration = wep.reloadTime / (1 + (state.perks.speedLvl - 1) * 0.15);
    showCenterAlert('RECARREGANDO ARMA...', reloadDuration * 1000);

    state.reloadTimerId = setTimeout(() => {
        state.reloadTimerId = null;
        if ((state.status !== 'PLAYING' && state.status !== 'SHOP') || state.currentWeaponIdx !== wepIdx) {
            state.isReloading = false;
            return;
        }
        const needed = wep.magSize - wepState.mag;
        const toLoad = wep.id === 'PISTOL' ? needed : Math.min(needed, wepState.reserve);
        wepState.mag += toLoad;
        if (wep.id !== 'PISTOL') wepState.reserve -= toLoad;
        state.isReloading = false; updateHUD();
    }, reloadDuration * 1000);
}

function takePlayerDamage(amount) {
    if (state.isDowned || state.invulnTimer > 0) return;
    state.health = Math.max(0, state.health - amount);
    sound.playPlayerDamage(); updateHUD();
    dom.damageOverlay.style.opacity = '1';
    setTimeout(() => { dom.damageOverlay.style.opacity = '0'; }, 240);

    if (state.health <= 0) {
        if (net.connected && net.ally.active && !net.ally.isDowned) {
            state.isDowned = true;
            if (state.status === 'SHOP') {
                state.status = 'PLAYING';
                dom.shopModal.classList.add('hidden');
            }
            showCenterAlert('⚠️ VOCÊ FOI FERIDO! AGUARDE O PARCEIRO!', 4000);
        } else {
            triggerGameOver();
        }
    }
}

function updatePlayer(dt) {
    let moveForward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    let moveRight = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);

    if (mobileInput.active) { moveForward = -mobileInput.moveY; moveRight = mobileInput.moveX; }

    const isMoving = Math.abs(moveForward) > 0.05 || Math.abs(moveRight) > 0.05;
    const speedBonus = 1 + (state.perks.speedLvl - 1) * 0.12;

    let currentSpeed = (state.isDowned ? 2.2 : CONFIG.walkSpeed) * speedBonus;
    if (!state.isDowned && keys.shift && isMoving && state.stamina > 5) {
        currentSpeed = CONFIG.sprintSpeed * speedBonus;
        state.stamina = Math.max(0, state.stamina - 24 * dt);
    } else {
        state.stamina = Math.min(CONFIG.maxStamina, state.stamina + 20 * dt);
    }
    dom.staminaBar.style.width = `${state.stamina}%`;
    dom.staminaText.textContent = `${Math.round(state.stamina)}%`;

    if (isMoving) {
        const forwardVec = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
        const rightVec = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
        const moveVec = new THREE.Vector3().addScaledVector(forwardVec, moveForward).addScaledVector(rightVec, moveRight);
        if (moveVec.lengthSq() > 1) moveVec.normalize();

        const stepX = moveVec.x * currentSpeed * dt;
        const stepZ = moveVec.z * currentSpeed * dt;

        if (!checkObstacleCollision(camera.position.x + stepX, camera.position.z, CONFIG.playerRadius)) camera.position.x += stepX;
        if (!checkObstacleCollision(camera.position.x, camera.position.z + stepZ, CONFIG.playerRadius)) camera.position.z += stepZ;
        state.walkCycle += dt * (currentSpeed * 1.15);
    } else {
        state.walkCycle = 0;
    }

    if (keys.space && state.isGrounded && !state.isDowned) {
        state.velocityY = CONFIG.jumpForce; state.isGrounded = false;
    }
    state.velocityY -= CONFIG.gravity * dt;
    camera.position.y += state.velocityY * dt;

    const targetHeight = state.isDowned ? 0.65 : CONFIG.playerHeight;
    if (camera.position.y <= targetHeight) {
        camera.position.y = targetHeight; state.velocityY = 0; state.isGrounded = true;
    }

    let shakeX = 0, shakeY = 0;
    if (state.screenShake > 0) {
        shakeX = (Math.random() - 0.5) * state.screenShake;
        shakeY = (Math.random() - 0.5) * state.screenShake;
        state.screenShake = Math.max(0, state.screenShake - dt * 1.8);
    }

    camera.rotation.y = state.yaw + shakeX;
    camera.rotation.x = state.pitch + shakeY;

    const targetFov = state.isAiming ? (state.currentWeaponIdx === 3 ? 30 : 52) : 74;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 12);
        camera.updateProjectionMatrix();
    }

    if (state.dashCooldown > 0) state.dashCooldown = Math.max(0, state.dashCooldown - dt);
    if (state.invulnTimer > 0) state.invulnTimer = Math.max(0, state.invulnTimer - dt);
    if (state.meleeCooldown > 0) state.meleeCooldown = Math.max(0, state.meleeCooldown - dt);
    if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0 && state.combo > 1) { state.combo = 1; updateHUD(); }
    }

    state.weaponRecoil = THREE.MathUtils.lerp(state.weaponRecoil, 0, dt * 14);
    const bobX = Math.cos(state.walkCycle * 0.5) * (isMoving ? 0.015 : 0.002);
    const bobY = Math.sin(state.walkCycle) * (isMoving ? 0.018 : 0.003);
    const reloadDip = state.isReloading ? -0.18 : 0;
    const aimOffsetX = state.isAiming ? 0.0 : 0.32;
    const aimOffsetY = state.isAiming ? -0.19 : -0.28;

    gunGroup.position.set(
        THREE.MathUtils.lerp(gunGroup.position.x, aimOffsetX + bobX, dt * 14),
        -0.28 === aimOffsetY ? aimOffsetY + bobY + reloadDip : aimOffsetY + bobY * 0.3 + reloadDip,
        -0.52 + state.weaponRecoil
    );
    gunGroup.rotation.x = state.isReloading ? -0.45 : state.weaponRecoil * 0.6;

    if (mouse.isDown && WEAPONS[state.currentWeaponIdx].auto) fireWeapon();

    if (state.isDowned && (!net.connected || !net.ally.active || net.ally.isDowned)) {
        triggerGameOver();
        return;
    }

    if (net.connected && net.ally.active && net.ally.isDowned && !state.isDowned) {
        const distAlly = Math.hypot(camera.position.x - net.ally.x, camera.position.z - net.ally.z);
        if (distAlly < 2.8) {
            net.ally.isDowned = false;
            net.ally.hp = Math.round((net.ally.maxHp || 120) * 0.65);
            sendNetMessage({ type: 'REVIVE_ALLY' });
            sound.playPickup(); showCenterAlert(`🤝 VOCÊ REANIMOU ${net.ally.name}!`, 1800);
            updateCoopHUD();
        }
    }
}

function updateZombies(dt, elapsedTime) {
    if (net.mode !== 'CLIENT' && state.zombiesToSpawn > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) { spawnZombie(); state.spawnTimer = Math.max(0.42, 1.45 - state.wave * 0.08); }
    }

    let showMeleeBanner = false;

    for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (z.flashTimer > 0) {
            z.flashTimer -= dt;
            if (z.flashTimer <= 0) z.materials.forEach(mat => mat.emissive.setHex(z.type === 'ACID' ? 0x1a2e05 : 0x000000));
        }

        let targetX = camera.position.x, targetZ = camera.position.z, targetingLocal = true;
        const distLocal = Math.hypot(camera.position.x - z.mesh.position.x, camera.position.z - z.mesh.position.z);
        if (net.connected && net.ally.active && !net.ally.isDowned) {
            const distAlly = Math.hypot(net.ally.x - z.mesh.position.x, net.ally.z - z.mesh.position.z);
            if (distAlly < distLocal || state.isDowned) { targetX = net.ally.x; targetZ = net.ally.z; targetingLocal = false; }
        }

        const dx = targetX - z.mesh.position.x, dz = targetZ - z.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        // LOD: o corpo fica sempre presente; só microdetalhes distantes desaparecem.
        if (z.detailMeshes) {
            const showDetails=gfxQuality==='ULTRA' ? dist<42 : dist<25;
            z.detailMeshes.forEach(part=>{part.visible=showDetails;});
        }
        if (!(net.mode === 'CLIENT' && net.connected)) z.mesh.rotation.y = Math.atan2(dx, dz);

        if (z.parts.hpBg && z.parts.hpFill) {
            z.parts.hpBg.lookAt(camera.position); z.parts.hpFill.lookAt(camera.position);
        }

        // Apenas o host simula movimentação, ataques e spawn. O cliente interpola
        // as posições recebidas, evitando duas IAs conflitantes nos mesmos zumbis.
        if (net.mode === 'CLIENT') {
            animateZombiePose(z, elapsedTime, Math.hypot(z.mesh.position.x - net.ally.x, z.mesh.position.z - net.ally.z) > 1.8);
            continue;
        }

        if (z.staggerTimer > 0) {
            z.staggerTimer -= dt;
            z.chargeState = 'IDLE';
            if (z.parts.staggerRing) {
                z.parts.staggerRing.visible = true;
                z.parts.staggerRing.rotation.z += dt * 4.5;
            }
            if (z.staggerType === 'KNEE') {
                z.mesh.position.y = -0.32 * z.scale;
                z.parts.leftLeg.rotation.x = 0.85;
                z.parts.rightLeg.rotation.x = -0.45;
            } else {
                z.parts.torso.rotation.x = -0.35;
            }
            if (distLocal <= 3.8 && !state.isDowned) showMeleeBanner = true;
            if (z.staggerTimer <= 0) {
                resetZombieStagger(z);
            }
            continue;
        }

        const zRadius = 0.45 * z.scale;
        const attackRange = 1.1 + 0.45 * z.scale;

        if (z.type === 'BRUTE' || z.type === 'BOSS') {
            if (z.chargeState === 'IDLE') {
                z.chargeCooldown = (z.chargeCooldown || 0) - dt;
                if (z.chargeCooldown <= 0 && dist > 6.0 && dist < 22.0) {
                    z.chargeState = 'WINDUP';
                    z.chargeTimer = 0.55;
                    z.chargeDirX = dx / dist;
                    z.chargeDirZ = dz / dist;
                    z.materials.forEach(mat => mat.emissive.setHex(0xd97706));
                    z.flashTimer = 0.55;
                }
            } else if (z.chargeState === 'WINDUP') {
                z.chargeTimer -= dt;
                if (z.chargeTimer <= 0) {
                    z.chargeState = 'CHARGING';
                    z.chargeTimer = 0.9;
                    spawnShockwaveRing(z.mesh.position.x, z.mesh.position.z, 0xf43f5e, 3.2);
                }
                animateZombiePose(z, elapsedTime, false);
                continue;
            } else if (z.chargeState === 'CHARGING') {
                z.chargeTimer -= dt;
                const stepped = steerEntityMove(z.mesh.position.x, z.mesh.position.z, z.chargeDirX, z.chargeDirZ, z.speed * 2.3 * dt, zRadius);
                z.mesh.position.x = stepped.x; z.mesh.position.z = stepped.z;
                const postDist = Math.hypot(targetX - z.mesh.position.x, targetZ - z.mesh.position.z);
                if (z.chargeTimer <= 0 || postDist <= attackRange) {
                    z.chargeState = 'IDLE';
                    z.chargeCooldown = 6.5;
                    if (postDist <= attackRange && z.attackCooldown <= 0) {
                        if (targetingLocal) takePlayerDamage(z.damage);
                        else if (net.connected && net.mode === 'HOST') sendNetMessage({ type: 'REMOTE_DAMAGE', amount: z.damage });
                        z.attackCooldown = 1.05;
                    }
                }
                if (z.attackCooldown > 0) z.attackCooldown -= dt;
                animateZombiePose(z, elapsedTime, true);
                continue;
            }
        }

        if (dist > attackRange) {
            let moveDirX = dx / dist, moveDirZ = dz / dist;

            for (let j = 0; j < zombies.length; j++) {
                if (i === j) continue;
                const other = zombies[j];
                const ox = z.mesh.position.x - other.mesh.position.x, oz = z.mesh.position.z - other.mesh.position.z;
                const oDistSq = ox * ox + oz * oz;
                if (oDistSq < 1.1 && oDistSq > 0.001) {
                    const oDist = Math.sqrt(oDistSq);
                    moveDirX += (ox / oDist) * 0.45; moveDirZ += (oz / oDist) * 0.45;
                }
            }

            const dirLen = Math.hypot(moveDirX, moveDirZ) || 1;
            moveDirX /= dirLen; moveDirZ /= dirLen;

            const stepped = steerEntityMove(z.mesh.position.x, z.mesh.position.z, moveDirX, moveDirZ, z.speed * dt, zRadius);
            z.mesh.position.x = stepped.x; z.mesh.position.z = stepped.z;

            animateZombiePose(z, elapsedTime, true);
        } else {
            animateZombiePose(z, elapsedTime, false);
            if (z.attackCooldown <= 0) {
                if (targetingLocal && Math.abs(camera.position.y - (state.isDowned ? 0.65 : CONFIG.playerHeight)) < 1.3) {
                    takePlayerDamage(z.damage); z.attackCooldown = 1.05;
                } else if (!targetingLocal && net.connected && net.mode === 'HOST') {
                    sendNetMessage({ type: 'REMOTE_DAMAGE', amount: z.damage });
                    z.attackCooldown = 1.05;
                }
            }
        }
        if (z.attackCooldown > 0) z.attackCooldown -= dt;
    }

    if (dom.meleePrompt) {
        dom.meleePrompt.classList.toggle('hidden', !showMeleeBanner);
    }
}

function updateEffectsAndCrates(dt, elapsedTime) {
    updateExplosionVisuals(dt);
    for (let i = dyingZombies.length - 1; i >= 0; i--) {
        const dz = dyingZombies[i];
        dz.life -= dt;
        dz.mesh.position.x += dz.velX * dt;
        dz.mesh.position.z += dz.velZ * dt;
        dz.velX *= 0.9; dz.velZ *= 0.9;
        dz.mesh.rotation.x = Math.max(-Math.PI / 2, dz.mesh.rotation.x - dt * 3.8);
        if (dz.life < 0.35) dz.mesh.position.y -= dt * 1.8;
        if (dz.life <= 0) {
            scene.remove(dz.mesh);
            disposeVisualObject(dz.mesh);
            dyingZombies.splice(i, 1);
        }
    }

    for (let i = lootDrops.length - 1; i >= 0; i--) {
        const drop = lootDrops[i];
        drop.life = (drop.life !== undefined ? drop.life : 18) - dt;
        if (drop.life <= 0) {
            scene.remove(drop.mesh);
            lootDrops.splice(i, 1);
            continue;
        }
        drop.mesh.rotation.y += 2.2 * dt;
        drop.mesh.position.y = drop.baseY + Math.sin(elapsedTime * 3.5 + drop.phase) * 0.14;
        const dx = camera.position.x - drop.mesh.position.x;
        const dz = camera.position.z - drop.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= 3.6 && dist > 0.001) {
            const pullSpeed = 9.5 * dt;
            drop.mesh.position.x += (dx / dist) * Math.min(dist, pullSpeed);
            drop.mesh.position.z += (dz / dist) * Math.min(dist, pullSpeed);
        }
        const newDist = Math.hypot(camera.position.x - drop.mesh.position.x, camera.position.z - drop.mesh.position.z);
        if (newDist <= 1.3) {
            sound.playPickup();
            if (drop.type === 'GOLD') {
                const bonus = drop.isBoss ? 600 : (150 + Math.floor(Math.random() * 201));
                state.score += bonus;
                showCenterAlert(`💰 +${bonus} TESOURO COLETADO!`, 1000);
            } else if (drop.type === 'AMMO') {
                state.weaponsState[1].reserve = Math.min(WEAPONS[1].reserveMax, state.weaponsState[1].reserve + 30);
                state.weaponsState[2].reserve = Math.min(WEAPONS[2].reserveMax, state.weaponsState[2].reserve + 8);
                state.weaponsState[3].reserve = Math.min(WEAPONS[3].reserveMax, state.weaponsState[3].reserve + 4);
                showCenterAlert('彈 +MUNIÇÃO TÁTICA!', 1000);
            } else if (drop.type === 'HERB') {
                state.health = Math.min(state.maxHealth, state.health + 25);
                dom.healOverlay.style.opacity = '1'; setTimeout(() => { dom.healOverlay.style.opacity = '0'; }, 300);
                showCenterAlert('🌿 +25 ERVA VERDE!', 1000);
            } else if (drop.type === 'COMBO') {
                state.combo = Math.min(10, state.combo + 2);
                state.comboTimer = 6.5;
                showCenterAlert(`🔥 BÔNUS MERCENARIES! COMBO ${state.combo}x`, 1200);
            }
            updateHUD();
            scene.remove(drop.mesh);
            lootDrops.splice(i, 1);
        }
    }

    for (let i = bulletTracers.length - 1; i >= 0; i--) {
        const t = bulletTracers[i];
        t.life -= dt; t.mat.opacity = Math.max(0, t.life * 14);
        if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); t.mat.dispose(); bulletTracers.splice(i, 1); }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt; p.vel.y -= 15 * dt; p.mesh.position.addScaledVector(p.vel, dt);
        if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vel.x *= 0.7; p.vel.z *= 0.7; }
        if (p.maxLife) {
            const scale=Math.max(0.08,p.life/p.maxLife);
            p.mesh.scale.multiplyScalar(Math.max(0.75,1-dt*1.3));
        }
        if (p.life <= 0) {
            scene.remove(p.mesh);
            if(p.batch && --p.batch.remaining===0) {
                p.batch.geometry.dispose();p.batch.material.dispose();
            }
            particles.splice(i, 1);
        }
    }

    state.crateTimer -= dt;
    if (state.crateTimer <= 0) { spawnSupplyCrate(); state.crateTimer = 13; }

    for (let i = supplyCrates.length - 1; i >= 0; i--) {
        const c = supplyCrates[i];
        c.mesh.rotation.y += 1.5 * dt;
        c.mesh.position.y = c.baseY + Math.sin(elapsedTime * 3 + c.phase) * 0.18;
        const dist = Math.hypot(camera.position.x - c.mesh.position.x, camera.position.z - c.mesh.position.z);
        if (dist < 1.9) {
            sound.playPickup();
            if (c.type === 'HEALTH') {
                state.health = Math.min(state.maxHealth, state.health + 40);
                dom.healOverlay.style.opacity = '1'; setTimeout(() => { dom.healOverlay.style.opacity = '0'; }, 350);
                showCenterAlert('+40 SPRAY DE CURA COLETADO!', 1200);
            } else {
                state.weaponsState[1].reserve = Math.min(WEAPONS[1].reserveMax, state.weaponsState[1].reserve + 60);
                state.weaponsState[2].reserve = Math.min(WEAPONS[2].reserveMax, state.weaponsState[2].reserve + 16);
                state.weaponsState[3].reserve = Math.min(WEAPONS[3].reserveMax, state.weaponsState[3].reserve + 8);
                state.grenades = Math.min(5, state.grenades + 1);
                showCenterAlert('+MUNIÇÃO & +1 GRANADA!', 1200);
            }
            updateHUD(); scene.remove(c.mesh); supplyCrates.splice(i, 1);
        }
    }

    if (state.status === 'PLAYING' || (net.connected && !net.botActive)) {
        for (let i = activeGrenades.length - 1; i >= 0; i--) {
            const g = activeGrenades[i];
            g.timer -= dt; g.vel.y -= 18 * dt; g.mesh.position.addScaledVector(g.vel, dt);
            if (g.mesh.position.y < 0.2) { g.mesh.position.y = 0.2; g.vel.y *= -0.45; }
            if (g.timer <= 0) {
                sound.playExplosion();
                const pos = g.mesh.position.clone();
                spawnImpactParticles(pos, 0xf97316, 30);
                spawnShockwaveRing(pos.x, pos.z, 0xf59e0b, 9.0);
                spawnExplosionVisual(pos, 2.8);
                spawnGroundDecal(pos.x, pos.z, 0x130a04, 2.1);
                state.screenShake = 0.25;

                for (let j = zombies.length - 1; j >= 0; j--) {
                    const z = zombies[j];
                    const d = Math.hypot(z.mesh.position.x - pos.x, z.mesh.position.z - pos.z);
                    if (d < 9.0) damageZombie(z, Math.round(280 * (1 - d / 10)), z.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), false, true);
                }
                scene.remove(g.mesh); activeGrenades.splice(i, 1);
            }
        }

        for (let i = 0; i < activeTurrets.length; i++) {
            const t = activeTurrets[i];
            t.cooldown -= dt;
            let nearestZ = null, minDist = 26;
            for (let j = 0; j < zombies.length; j++) {
                const z = zombies[j];
                const d = Math.hypot(z.mesh.position.x - t.mesh.position.x, z.mesh.position.z - t.mesh.position.z);
                if (d < minDist) { minDist = d; nearestZ = z; }
            }
            if (nearestZ) {
                const dx = nearestZ.mesh.position.x - t.mesh.position.x, dz = nearestZ.mesh.position.z - t.mesh.position.z;
                t.headMesh.rotation.y = Math.atan2(dx, dz);
                if (t.cooldown <= 0) {
                    t.cooldown = 0.28; sound.playShoot('PISTOL');
                    const startPos = t.mesh.position.clone().add(new THREE.Vector3(0, 1.05, 0));
                    const hitPos = nearestZ.mesh.position.clone().add(new THREE.Vector3(0, 1.25, 0));
                    createBulletTracer(startPos, hitPos, 0xf59e0b);
                    damageZombie(nearestZ, 20, hitPos, false, true);
                }
            } else { t.headMesh.rotation.y += 0.8 * dt; }
        }
    }

    for (let i = shellCasings.length - 1; i >= 0; i--) {
        const s = shellCasings[i];
        s.life -= dt; s.vel.y -= 16 * dt; s.mesh.position.addScaledVector(s.vel, dt);
        if (s.mesh.position.y < 0.03) { s.mesh.position.y = 0.03; s.vel.y *= -0.35; }
        if (s.life <= 0) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); shellCasings.splice(i, 1); }
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.life -= dt; sw.scale = THREE.MathUtils.lerp(sw.scale, sw.maxScale, dt * 8);
        sw.mesh.scale.set(sw.scale, sw.scale, 1); sw.mat.opacity = Math.max(0, sw.life * 2.1);
        if (sw.life <= 0) { scene.remove(sw.mesh); sw.mesh.geometry.dispose(); sw.mat.dispose(); shockwaves.splice(i, 1); }
    }

    for (let i = groundDecals.length - 1; i >= 0; i--) {
        const dec = groundDecals[i];
        dec.life -= dt;
        if (dec.life < 3) dec.mat.opacity = Math.max(0, (dec.life / 3) * 0.72);
        if (dec.life <= 0) { scene.remove(dec.mesh); dec.mesh.geometry.dispose(); dec.mat.dispose(); groundDecals.splice(i, 1); }
    }

    if (ambientDust) {
        ambientDust.rotation.y = elapsedTime * 0.025;
        ambientDust.position.y = Math.sin(elapsedTime * 0.6) * 0.25;
    }
}

function drawRadar() {
    if (!radarCtx) return;
    const w = dom.radarCanvas.width, h = dom.radarCanvas.height, cx = w / 2, cy = h / 2, maxRange = 55;
    radarCtx.clearRect(0, 0, w, h);
    radarCtx.strokeStyle = 'rgba(245, 158, 11, 0.3)'; radarCtx.lineWidth = 1;
    [18, 36, 52].forEach(r => {
        radarCtx.beginPath(); radarCtx.arc(cx, cy, r, 0, Math.PI * 2); radarCtx.stroke();
    });

    supplyCrates.forEach(c => {
        const dx = c.mesh.position.x - camera.position.x, dz = c.mesh.position.z - camera.position.z;
        const rx = dx * Math.cos(state.yaw) - dz * Math.sin(state.yaw);
        const rz = dx * Math.sin(state.yaw) + dz * Math.cos(state.yaw);
        const px = cx + (rx / maxRange) * (w / 2), py = cy + (rz / maxRange) * (h / 2);
        if (Math.hypot(px - cx, py - cy) < w / 2 - 3) {
            radarCtx.fillStyle = c.type === 'HEALTH' ? '#10b981' : '#f59e0b';
            radarCtx.fillRect(px - 2, py - 2, 4, 4);
        }
    });

    zombies.forEach(z => {
        const dx = z.mesh.position.x - camera.position.x, dz = z.mesh.position.z - camera.position.z;
        const rx = dx * Math.cos(state.yaw) - dz * Math.sin(state.yaw);
        const rz = dx * Math.sin(state.yaw) + dz * Math.cos(state.yaw);
        const px = cx + (rx / maxRange) * (w / 2), py = cy + (rz / maxRange) * (h / 2);
        if (Math.hypot(px - cx, py - cy) < w / 2 - 3) {
            radarCtx.fillStyle = z.type === 'BRUTE' ? '#d946ef' : (z.type === 'ACID' ? '#a3e635' : '#ef4444');
            radarCtx.beginPath(); radarCtx.arc(px, py, z.type === 'BRUTE' ? 3.2 : 2.3, 0, Math.PI * 2); radarCtx.fill();
        }
    });

    if (net.connected && net.ally.active) {
        const dx = net.ally.x - camera.position.x, dz = net.ally.z - camera.position.z;
        const rx = dx * Math.cos(state.yaw) - dz * Math.sin(state.yaw);
        const rz = dx * Math.sin(state.yaw) + dz * Math.cos(state.yaw);
        const px = cx + (rx / maxRange) * (w / 2), py = cy + (rz / maxRange) * (h / 2);
        radarCtx.fillStyle = '#f59e0b'; radarCtx.beginPath();
        radarCtx.arc(THREE.MathUtils.clamp(px, 6, w - 6), THREE.MathUtils.clamp(py, 6, h - 6), 4.0, 0, Math.PI * 2);
        radarCtx.fill();
    }

    radarCtx.fillStyle = '#f59e0b'; radarCtx.beginPath(); radarCtx.arc(cx, cy, 3.5, 0, Math.PI * 2); radarCtx.fill();
}

function updateHUD() {
    dom.score.textContent = state.score; dom.shopCredits.textContent = state.score;
    dom.wave.textContent = state.wave;
    dom.zombiesRem.textContent = `(${state.zombiesAlive + state.zombiesToSpawn})`;
    dom.kills.textContent = state.kills;
    if (dom.combo) dom.combo.textContent = `${state.combo}x`;
    if (dom.grenadesHud) dom.grenadesHud.textContent = state.grenades;
    if (dom.turretsHud) dom.turretsHud.textContent = `${activeTurrets.length}/3`;

    const activeBoss = zombies.find(z => z.type === 'BOSS');
    if (activeBoss && dom.bossHud) {
        dom.bossHud.classList.remove('hidden');
        dom.bossHpText.textContent = `${Math.max(0, activeBoss.hp)} / ${activeBoss.maxHp}`;
        dom.bossHpBar.style.width = `${Math.max(0, (activeBoss.hp / activeBoss.maxHp) * 100)}%`;
    } else if (dom.bossHud) { dom.bossHud.classList.add('hidden'); }

    dom.healthText.textContent = `${Math.ceil(state.health)} / ${state.maxHealth}`;
    dom.healthBar.style.width = `${(state.health / state.maxHealth) * 100}%`;

    const wep = WEAPONS[state.currentWeaponIdx];
    const wepState = state.weaponsState[state.currentWeaponIdx];
    dom.weaponNameHud.textContent = wep.name;
    dom.ammoCurrent.textContent = wepState.mag;
    dom.ammoReserve.textContent = wep.id === 'PISTOL' ? '∞' : wepState.reserve;

    const elDmg = document.getElementById('lvl-damage');
    if (elDmg) elDmg.textContent = `Nv. ${state.perks.damageLvl}`;
    const elCostDmg = document.getElementById('cost-damage');
    if (elCostDmg) elCostDmg.textContent = `Custo: ${state.perks.damageLvl * 400} Pts`;

    const elSpd = document.getElementById('lvl-speed');
    if (elSpd) elSpd.textContent = `Nv. ${state.perks.speedLvl}`;
    const elCostSpd = document.getElementById('cost-speed');
    if (elCostSpd) elCostSpd.textContent = `Custo: ${state.perks.speedLvl * 350} Pts`;

    const elHp = document.getElementById('lvl-health');
    if (elHp) elHp.textContent = `Nv. ${state.perks.healthLvl}`;
    const elCostHp = document.getElementById('cost-health');
    if (elCostHp) elCostHp.textContent = `Custo: ${state.perks.healthLvl * 300} Pts`;

    const lvlTurret = document.getElementById('lvl-turret');
    if (lvlTurret) lvlTurret.textContent = `Ativas: ${activeTurrets.length} / 3`;
}

let alertTimeout = null;
function showCenterAlert(text, duration = 1200) {
    dom.centerAlertText.textContent = text;
    dom.centerAlert.classList.remove('hidden');
    if (alertTimeout) clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => dom.centerAlert.classList.add('hidden'), duration);
}

function toggleShopModal() {
    if (state.status === 'PLAYING') {
        state.status = 'SHOP'; mouse.isDown = false;
        if (document.pointerLockElement) document.exitPointerLock();
        updateHUD(); dom.shopModal.classList.remove('hidden');
    } else if (state.status === 'SHOP') {
        state.status = 'PLAYING'; dom.shopModal.classList.add('hidden');
        requestPointerLockSafely();
    }
}

function buyPerk(perkType) {
    sound.init();
    if (perkType === 'DAMAGE') {
        const cost = state.perks.damageLvl * 400;
        if (state.score < cost) { showCenterAlert('CRÉDITOS INSUFICIENTES!', 1000); return; }
        state.score -= cost; state.perks.damageLvl++; sound.playPickup(); showCenterAlert('🔥 PODER DE FOGO AUMENTADO!', 1400);
    } else if (perkType === 'SPEED') {
        const cost = state.perks.speedLvl * 350;
        if (state.score < cost) { showCenterAlert('CRÉDITOS INSUFICIENTES!', 1000); return; }
        state.score -= cost; state.perks.speedLvl++; sound.playPickup(); showCenterAlert('⚡ COLETE TÁTICO MELHORADO!', 1400);
    } else if (perkType === 'HEALTH') {
        const cost = state.perks.healthLvl * 300;
        if (state.score < cost) { showCenterAlert('CRÉDITOS INSUFICIENTES!', 1000); return; }
        state.score -= cost; state.perks.healthLvl++; state.maxHealth += 25; state.health = state.maxHealth; state.isDowned = false;
        sound.playPickup(); showCenterAlert('💉 SPRAY DE CURA APLICADO!', 1400);
    } else if (perkType === 'AMMO_BARRELS') {
        const cost = 250;
        if (state.score < cost) { showCenterAlert('CRÉDITOS INSUFICIENTES!', 1000); return; }
        state.score -= cost;
        WEAPONS.forEach((w, idx) => { state.weaponsState[idx].mag = w.magSize; state.weaponsState[idx].reserve = w.reserveMax; });
        state.grenades = Math.min(6, state.grenades + 3); spawnExplosiveBarrels();
        sound.playPickup(); showCenterAlert('💥 MUNIÇÃO CHEIA & BARRIS REPOSICIONADOS!', 1400);
    } else if (perkType === 'TURRET') {
        const cost = 500;
        if (state.score < cost) { showCenterAlert('CRÉDITOS INSUFICIENTES!', 1000); return; }
        if (deploySentryTurret()) { state.score -= cost; sound.playPickup(); showCenterAlert('🤖 TORRETA B.S.A.A. IMPLANTADA!', 1500); }
    }
    updateHUD();
}

function startGame(fromNetwork = false) {
    sound.init();
    if (net.mode === 'CLIENT' && !net.connected) {
        showCenterAlert('AGUARDE A CONEXÃO COM O HOST!', 1800);
        return;
    }
    if (net.mode === 'CLIENT' && net.connected && !fromNetwork && state.status !== 'PAUSED') {
        showCenterAlert('AGUARDE O HOST INICIAR A MISSÃO!', 1800);
        return;
    }
    const nicknameInput = document.getElementById('player-nickname');
    if (nicknameInput) net.myName = (nicknameInput.value || 'Chris Redfield').trim();
    if (state.status === 'PAUSED') {
        state.status = 'PLAYING'; dom.modal.classList.add('hidden'); requestPointerLockSafely(); return;
    }

    if (!fromNetwork && net.mode === 'HOST') {
        net.matchId += 1;
        if (net.connected) sendNetMessage({ type: 'START_MATCH', matchId: net.matchId });
    }
    if (state.bossSpawnTimerId) { clearTimeout(state.bossSpawnTimerId); state.bossSpawnTimerId = null; }
    if (state.nextWaveTimerId) { clearTimeout(state.nextWaveTimerId); state.nextWaveTimerId = null; }

    zombies.forEach(z => {scene.remove(z.mesh);disposeVisualObject(z.mesh);}); zombies = [];
    dyingZombies.forEach(dz => {scene.remove(dz.mesh);disposeVisualObject(dz.mesh);}); dyingZombies = [];
    lootDrops.forEach(d => {scene.remove(d.mesh);disposeVisualObject(d.mesh);}); lootDrops = [];
    supplyCrates.forEach(c => scene.remove(c.mesh)); supplyCrates = [];
    activeTurrets.forEach(t => scene.remove(t.mesh)); activeTurrets = [];
    activeGrenades.forEach(g => scene.remove(g.mesh)); activeGrenades = [];
    explosionFX.forEach(fx=>{scene.remove(fx.group);fx.shells.forEach(p=>{p.mesh.geometry.dispose();p.mat.dispose();});});explosionFX=[];

    state.status = 'PLAYING'; state.score = 0; state.wave = 1; state.kills = 0; state.combo = 1; state.grenades = 3;
    state.maxHealth = CONFIG.maxHealth; state.health = CONFIG.maxHealth; state.stamina = CONFIG.maxStamina; state.isDowned = false;
    state.invulnTimer = 0; state.meleeCooldown = 0; state.dashCooldown = 0;
    if (net.ally) {
        net.ally.isDowned = false;
        net.ally.hp = net.ally.maxHp || 120;
        net.ally.x = 3.0;
        net.ally.z = 2.0;
    }
    if (dom.meleePrompt) dom.meleePrompt.classList.add('hidden');
    state.perks = { damageLvl: 1, speedLvl: 1, healthLvl: 1 };
    state.weaponsState = [{ mag: 15, reserve: 999 }, { mag: 30, reserve: 150 }, { mag: 8, reserve: 40 }, { mag: 5, reserve: 20 }];
    cancelReload(); setAiming(false); state.yaw = 0; state.pitch = 0;
    camera.position.set(net.mode === 'CLIENT' ? 2.5 : -2.5, CONFIG.playerHeight, 0);

    spawnExplosiveBarrels(); spawnSupplyCrate(); spawnSupplyCrate();
    if (net.mode === 'CLIENT' && net.connected) {
        state.zombiesToSpawn = 0; state.spawnTimer = 0;
    } else startWave(1);
    updateHUD(); updateCoopHUD();
    dom.modal.classList.add('hidden'); dom.shopModal.classList.add('hidden');
    requestPointerLockSafely();
}

function pauseGame() {
    if (state.status !== 'PLAYING') return;
    state.status = 'PAUSED'; mouse.isDown = false;
    if (document.pointerLockElement) document.exitPointerLock();
    dom.modalTitle.innerHTML = 'MISSÃO <span class="text-amber-400">PAUSADA</span>';
    dom.modalSubtitle.textContent = 'Gerencie sua equipe B.S.A.A. ou retome a operação.';
    dom.gameoverStats.classList.add('hidden'); dom.btnStart.textContent = 'Retomar Missão';
    dom.modal.classList.remove('hidden');
}

function triggerGameOver(fromNetwork = false) {
    if (!fromNetwork && net.mode === 'HOST' && net.connected) sendNetMessage({ type: 'MATCH_END' });
    cancelReload();
    if (state.bossSpawnTimerId) { clearTimeout(state.bossSpawnTimerId); state.bossSpawnTimerId = null; }
    if (state.nextWaveTimerId) { clearTimeout(state.nextWaveTimerId); state.nextWaveTimerId = null; }
    if (dom.meleePrompt) dom.meleePrompt.classList.add('hidden');
    state.status = 'GAMEOVER'; mouse.isDown = false;
    if (document.pointerLockElement) document.exitPointerLock();
    dom.shopModal.classList.add('hidden');
    dom.modalTitle.innerHTML = 'VOCÊ FOI <span class="text-red-500">ELIMINADO!</span>';
    dom.modalSubtitle.textContent = 'A infecção Majini consumiu a zona industrial.';
    dom.finalScore.textContent = state.score; dom.finalWave.textContent = state.wave; dom.finalKills.textContent = state.kills;
    dom.gameoverStats.classList.remove('hidden'); dom.btnStart.textContent = 'Tentar Novamente';
    dom.modal.classList.remove('hidden');
}

function requestPointerLockSafely() {
    try { if (renderer && renderer.domElement && renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock(); } catch (e) {}
}

function toggleFlashlight() {
    state.flashlightOn = !state.flashlightOn;
    playerFlashlight.intensity = state.flashlightOn ? 2.4 : 0;
    if (flashlightBeam) flashlightBeam.visible = (state.flashlightOn && gfxQuality === 'ULTRA');
    showCenterAlert(state.flashlightOn ? '🔦 LANTERNA LIGADA' : '🔦 LANTERNA DESLIGADA', 700);
}

function sendTacticalPing() {
    if (!net.connected) { showCenterAlert('📡 SINAL B.S.A.A. ENVIADO', 1200); sound.playPing(); return; }
    sound.playPing();
    sendNetMessage({ type: 'TACTICAL_PING', text: 'PRECISO DE SUPORTE AQUI!', x: camera.position.x, z: camera.position.z });
    showCenterAlert('📡 SINAL ENVIADO AO PARCEIRO!', 1200);
}

function setupEventListeners() {
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (typeof resizeCinematicPost === 'function') resizeCinematicPost();
    });

    window.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        const code = e.code;
        if (code === 'KeyW' || code === 'ArrowUp') keys.w = true;
        if (code === 'KeyS' || code === 'ArrowDown') keys.s = true;
        if (code === 'KeyA' || code === 'ArrowLeft') keys.a = true;
        if (code === 'KeyD' || code === 'ArrowRight') keys.d = true;
        if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;
        if (code === 'Space') keys.space = true;
        if (code === 'Digit1') switchWeapon(0);
        if (code === 'Digit2') switchWeapon(1);
        if (code === 'Digit3') switchWeapon(2);
        if (code === 'Digit4') switchWeapon(3);
        if (code === 'KeyE' && state.status === 'PLAYING') performMeleeAttack();
        if (code === 'KeyG' && state.status === 'PLAYING') throwGrenade();
        if (code === 'KeyQ' && state.status === 'PLAYING') performTacticalDash();
        if (code === 'KeyR' && state.status === 'PLAYING') reloadWeapon();
        if (code === 'KeyF' && state.status === 'PLAYING') toggleFlashlight();
        if (code === 'KeyV') toggleGraphicsQuality();
        if (code === 'KeyT' && state.status === 'PLAYING') sendTacticalPing();
        if (code === 'KeyB') { if (state.status === 'PLAYING' || state.status === 'SHOP') toggleShopModal(); }
        if (code === 'KeyP' || code === 'Escape') {
            if (state.status === 'SHOP') toggleShopModal();
            else if (state.status === 'PLAYING') pauseGame();
        }
        if (code === 'KeyM') toggleSoundUI();
    });

    window.addEventListener('keyup', (e) => {
        const code = e.code;
        if (code === 'KeyW' || code === 'ArrowUp') keys.w = false;
        if (code === 'KeyS' || code === 'ArrowDown') keys.s = false;
        if (code === 'KeyA' || code === 'ArrowLeft') keys.a = false;
        if (code === 'KeyD' || code === 'ArrowRight') keys.d = false;
        if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = false;
        if (code === 'Space') keys.space = false;
    });

    window.addEventListener('wheel', (e) => {
        if (state.status !== 'PLAYING') return;
        const next = (state.currentWeaponIdx + (e.deltaY > 0 ? 1 : WEAPONS.length - 1)) % WEAPONS.length;
        switchWeapon(next);
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
        if (state.status !== 'PLAYING') return;
        const sensitivity = 0.0023;
        if (document.pointerLockElement === renderer.domElement) {
            state.yaw -= e.movementX * sensitivity;
            state.pitch -= e.movementY * sensitivity;
        } else if (mouse.isDown) {
            if (mouse.prevX !== 0 || mouse.prevY !== 0) {
                state.yaw -= (e.clientX - mouse.prevX) * sensitivity * 1.3;
                state.pitch -= (e.clientY - mouse.prevY) * sensitivity * 1.3;
            }
            mouse.prevX = e.clientX; mouse.prevY = e.clientY;
        }
        state.pitch = THREE.MathUtils.clamp(state.pitch, -Math.PI / 2.25, Math.PI / 2.25);
    });

    renderer.domElement.addEventListener('mousedown', (e) => {
        if (state.status !== 'PLAYING') return;
        if (e.button === 0) {
            mouse.prevX = e.clientX; mouse.prevY = e.clientY;
            requestPointerLockSafely(); mouse.isDown = true; fireWeapon();
        } else if (e.button === 2) { setAiming(!state.isAiming); }
    });

    window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.isDown = false; });

    if (dom.btnStart) dom.btnStart.addEventListener('click', () => startGame(false));
    if (dom.btnPause) dom.btnPause.addEventListener('click', () => {
        if (state.status === 'PLAYING') pauseGame(); else if (state.status === 'PAUSED') startGame(false);
    });
    if (dom.btnShop) dom.btnShop.addEventListener('click', toggleShopModal);
    const btnCloseShop = document.getElementById('btn-close-shop');
    if (btnCloseShop) btnCloseShop.addEventListener('click', toggleShopModal);
    if (dom.btnFlashlight) dom.btnFlashlight.addEventListener('click', toggleFlashlight);
    const btnGfx = document.getElementById('btn-gfx');
    if (btnGfx) btnGfx.addEventListener('click', toggleGraphicsQuality);
    if (dom.btnReloadHud) dom.btnReloadHud.addEventListener('click', reloadWeapon);
    if (dom.btnSound) dom.btnSound.addEventListener('click', toggleSoundUI);
    const btnPingAlly = document.getElementById('btn-ping-ally');
    if (btnPingAlly) btnPingAlly.addEventListener('click', sendTacticalPing);

    for (let i = 0; i < WEAPONS.length; i++) {
        const slotEl = document.getElementById(`slot-wep-${i}`);
        if (slotEl) slotEl.addEventListener('click', () => switchWeapon(i));
    }

    const buyDmg = document.getElementById('buy-damage');
    if (buyDmg) buyDmg.addEventListener('click', () => buyPerk('DAMAGE'));
    const buySpd = document.getElementById('buy-speed');
    if (buySpd) buySpd.addEventListener('click', () => buyPerk('SPEED'));
    const buyHp = document.getElementById('buy-health');
    if (buyHp) buyHp.addEventListener('click', () => buyPerk('HEALTH'));
    const buyAmmo = document.getElementById('buy-ammo-barrels');
    if (buyAmmo) buyAmmo.addEventListener('click', () => buyPerk('AMMO_BARRELS'));
    const buyTurret = document.getElementById('buy-turret');
    if (buyTurret) buyTurret.addEventListener('click', () => buyPerk('TURRET'));

    const btnCreateHost = document.getElementById('btn-create-host');
    if (btnCreateHost) btnCreateHost.addEventListener('click', initHostP2P);
    const btnJoinRoom = document.getElementById('btn-join-room');
    if (btnJoinRoom) btnJoinRoom.addEventListener('click', joinRoomP2P);
    const btnTabSync = document.getElementById('btn-local-tab-sync');
    if (btnTabSync) btnTabSync.addEventListener('click', initLocalTabSync);
    const btnCoopBot = document.getElementById('btn-coop-bot');
    if (btnCoopBot) btnCoopBot.addEventListener('click', toggleCoopBot);
    const btnCopyCode = document.getElementById('btn-copy-code');
    if (btnCopyCode) btnCopyCode.addEventListener('click', () => {
        const tempInput = document.createElement('input'); tempInput.value = net.roomCode;
        document.body.appendChild(tempInput); tempInput.select(); document.execCommand('copy');
        document.body.removeChild(tempInput);
        btnCopyCode.textContent = 'Copiado!';
        setTimeout(() => { btnCopyCode.textContent = 'Copiar'; }, 1500);
    });

    window.addEventListener('touchstart', () => {
        if (dom.mobileControls) {
            dom.mobileControls.classList.remove('hidden'); dom.mobileControls.classList.add('flex');
        }
    }, { once: true });

    setupMobileTouchControls();
    switchWeapon(1);
}

function toggleSoundUI() {
    const isOn = sound.toggle();
    dom.iconSoundOn.classList.toggle('hidden', !isOn);
    dom.iconSoundOff.classList.toggle('hidden', isOn);
}

function setupMobileTouchControls() {
    const joyZone = document.getElementById('joystick-zone');
    const joyKnob = document.getElementById('joystick-knob');
    const btnShoot = document.getElementById('mobile-shoot-btn');
    const btnReload = document.getElementById('mobile-reload-btn');
    const btnJump = document.getElementById('mobile-jump-btn');
    const btnWeapon = document.getElementById('mobile-weapon-btn');
    const btnMelee = document.getElementById('mobile-melee-btn');

    if (!joyZone || !joyKnob || !btnShoot) return;

    joyZone.addEventListener('touchstart', (e) => { e.preventDefault(); mobileInput.active = true; updateJoystick(e.touches[0]); });
    joyZone.addEventListener('touchmove', (e) => { e.preventDefault(); if (mobileInput.active) updateJoystick(e.touches[0]); });
    const resetJoystick = () => { mobileInput.active = false; mobileInput.moveX = 0; mobileInput.moveY = 0; joyKnob.style.transform = `translate(0px, 0px)`; };
    joyZone.addEventListener('touchend', resetJoystick); joyZone.addEventListener('touchcancel', resetJoystick);

    function updateJoystick(touch) {
        const rect = joyZone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
        const maxDist = rect.width / 2 - 16;
        let dx = touch.clientX - centerX, dy = touch.clientY - centerY;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
        joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        mobileInput.moveX = dx / maxDist; mobileInput.moveY = dy / maxDist;
    }

    let lookTouchId = null, lastLookX = 0, lastLookY = 0;
    renderer.domElement.addEventListener('touchstart', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.clientX > window.innerWidth * 0.35) { lookTouchId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY; }
        }
    });
    renderer.domElement.addEventListener('touchmove', (e) => {
        if (state.status !== 'PLAYING') return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === lookTouchId) {
                const dx = t.clientX - lastLookX, dy = t.clientY - lastLookY;
                state.yaw -= dx * 0.005;
                state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.005, -Math.PI / 2.25, Math.PI / 2.25);
                lastLookX = t.clientX; lastLookY = t.clientY;
            }
        }
    });

    btnShoot.addEventListener('touchstart', (e) => { e.preventDefault(); mouse.isDown = true; fireWeapon(); });
    btnShoot.addEventListener('touchend', (e) => { e.preventDefault(); mouse.isDown = false; });
    btnReload.addEventListener('touchstart', (e) => { e.preventDefault(); reloadWeapon(); });
    btnWeapon.addEventListener('touchstart', (e) => { e.preventDefault(); switchWeapon((state.currentWeaponIdx + 1) % WEAPONS.length); });
    if (btnMelee) btnMelee.addEventListener('touchstart', (e) => { e.preventDefault(); performMeleeAttack(); });
    btnJump.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (state.isGrounded && !state.isDowned) { state.velocityY = CONFIG.jumpForce; state.isGrounded = false; }
    });
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const elapsedTime = clock.getElapsedTime();

    if (state.status === 'PLAYING' || state.status === 'SHOP') {
        if (state.status === 'PLAYING') updatePlayer(dt);
        if (state.status === 'PLAYING' || (net.connected && !net.botActive)) {
            updateZombies(dt, elapsedTime);
        }
        updateEffectsAndCrates(dt, elapsedTime);
        updateNetworkSync(elapsedTime, dt);
        drawRadar();
    } else if (state.status === 'MENU') {
        camera.position.x = Math.sin(elapsedTime * 0.18) * 14;
        camera.position.z = Math.cos(elapsedTime * 0.18) * 14;
        camera.position.y = 4.5;
        camera.lookAt(0, 1.2, 0);
    }

    animateCoopAlly(dt,elapsedTime);
    if (typeof renderCinematicFrame === 'function') renderCinematicFrame(dt, elapsedTime);
    else renderer.render(scene,camera);
}

window.onload = function () {
    initThreeJS();
    animate();
};
