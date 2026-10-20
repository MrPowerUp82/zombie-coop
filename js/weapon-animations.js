// ============================================================
// Armas FPS em peças: malhas detalhadas + mãos, ferrolho, bolt,
// carregador e pump. Animações leves e determinísticas por delta.
// Sem alocação de objetos 3D por frame / sem dependências extras.
// ============================================================
const weaponPresentation = { rigs: [], activeReload: null, equipTime: 0 };

function smoothWeaponStep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
function weaponPulse(a, b, c, d, t) {
    return smoothWeaponStep(a, b, t) * (1 - smoothWeaponStep(c, d, t));
}
function addWeaponDetail(parent, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.rotation.set(rx, ry, rz);
    part.castShadow = false; // Viewmodel não projeta sombra no cenário.
    parent.add(part);
    return part;
}
function buildWeaponGlove(parent, x, y, z, armMaterial, gloveMaterial, left = false) {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    parent.add(root);
    // Antebraço protegido por manga e luva articulada low-poly.
    addWeaponDetail(root, new THREE.CylinderGeometry(.074, .095, .34, 12), armMaterial,
        left ? -.028 : .062, -.22, .20, left ? -.43 : .28, 0, left ? -.14 : -.22);
    addWeaponDetail(root, new THREE.SphereGeometry(.082, 14, 10), gloveMaterial, 0, 0, 0);
    addWeaponDetail(root, new THREE.CylinderGeometry(.024, .027, .105, 8), gloveMaterial,
        left ? .085 : -.085, -.012, -.032, .35, 0, left ? -.8 : .8);
    // Cilindros e esferas compatíveis com a versão Three.js r128 do projeto.
    for (let i = 0; i < 4; i++) {
        const fx = (i - 1.5) * .042;
        addWeaponDetail(root, new THREE.CylinderGeometry(.022, .019, .115, 8), gloveMaterial,
            fx, -.055, -.060, Math.PI / 2.9, 0, 0);
    }
    return root;
}

function enhanceFirstPersonWeapons(slides) {
    const mat = {
        steel: new THREE.MeshStandardMaterial({ color: 0x626c78, metalness: .82, roughness: .24 }),
        gunmetal: new THREE.MeshStandardMaterial({ color: 0x191f26, metalness: .79, roughness: .31 }),
        resin: new THREE.MeshStandardMaterial({ color: 0x121c23, metalness: .11, roughness: .74 }),
        tan: new THREE.MeshStandardMaterial({ color: 0x65533a, metalness: .08, roughness: .8 }),
        wood: new THREE.MeshStandardMaterial({ color: 0x643a23, metalness: .08, roughness: .65 }),
        gloves: new THREE.MeshStandardMaterial({ color: 0x242f2c, roughness: .91 }),
        sleeves: new THREE.MeshStandardMaterial({ color: 0x42504a, roughness: .95 }),
        brass: new THREE.MeshStandardMaterial({ color: 0xbd8642, metalness: .68, roughness: .26 }),
        glow: new THREE.MeshBasicMaterial({ color: 0x5ce6ff })
    };
    const [pistol, rifle, shotgun, railgun] = weaponModels;
    const rigs = [];
    function detailBox(parent, w, h, depth, x, y, z, material = mat.gunmetal) {
        return addWeaponDetail(parent, new THREE.BoxGeometry(w, h, depth), material, x, y, z);
    }
    function ring(parent, radius, z, material) {
        return addWeaponDetail(parent, new THREE.TorusGeometry(radius, .009, 6, 12), material, 0, .025, z);
    }
    function buildRig(model, id, muzzleLength, leftX, leftZ) {
        const left = buildWeaponGlove(model, leftX, -.105, leftZ, mat.sleeves, mat.gloves, true);
        const right = buildWeaponGlove(model, .10, -.15, .16, mat.sleeves, mat.gloves, false);
        const rig = {
            id, model, left, right, leftBase: {x:leftX, y:-.105, z:leftZ},
            mag: null, magBase: null, slide: null, slideBase: null, bolt: null, boltBase: null,
            pump: null, pumpBase: null, shell: null, charge: null, shot:0, firePump:0,
            muzzleLength, reloadDuration: 0
        };
        rigs.push(rig); return rig;
    }

    // M93R — cano, recortes de ferrolho, guarda-mato, ranhuras, mira e carregador removível.
    const p = buildRig(pistol, 'PISTOL', -.38, -.095, -.095);
    p.slide = slides.pistolSlide;
    p.slideBase = p.slide.position.z;
    p.mag = detailBox(pistol, .060, .175, .077, 0, -.138, .063, mat.gunmetal);
    p.magBase = {y:p.mag.position.y, z:p.mag.position.z};
    detailBox(pistol, .077, .025, .36, 0, .095, -.062, mat.gunmetal);
    for (let i = 0; i < 5; i++) detailBox(pistol, .005, .04, .012, .042, .07, .06 - i * .029, mat.steel);
    detailBox(pistol, .087, .031, .125, 0, -.025, -.22, mat.gunmetal);
    detailBox(pistol, .074, .027, .085, 0, -.116, .056, mat.resin);
    detailBox(pistol, .076, .015, .075, 0, .105, -.19, mat.steel);
    ring(pistol, .032, -.28, mat.steel);

    // AK-74 — coronha, handguard, trilho, gas tube, magazine curvo, bolt móvel.
    const r = buildRig(rifle, 'RIFLE', -.72, -.115, -.23);
    r.mag = slides.rifleMag;
    r.magBase = { y:r.mag.position.y, z:r.mag.position.z };
    r.bolt = detailBox(rifle, .022, .028, .13, .062, .045, -.10, mat.steel);
    r.boltBase = r.bolt.position.z;
    detailBox(rifle, .12, .088, .30, 0, -.008, -.29, mat.wood);
    detailBox(rifle, .095, .105, .28, 0, -.012, .35, mat.resin);
    detailBox(rifle, .1, .055, .08, 0, -.08, .46, mat.gunmetal);
    detailBox(rifle, .13, .04, .34, 0, .10, -.04, mat.gunmetal);
    detailBox(rifle, .052, .020, .44, 0, .085, -.37, mat.steel);
    detailBox(rifle, .034, .052, .14, 0, -.123, .105, mat.resin);
    for (let i = 0; i < 5; i++) detailBox(rifle, .010, .009, .052, -.063, .025, -.17 - i*.048, mat.gunmetal);
    ring(rifle, .032, -.63, mat.steel);

    // M3 — tubo de munição paralelo, pump móvel e alça de ferro.
    const s = buildRig(shotgun, 'SHOTGUN', -.72, -.145, -.35);
    s.pump = slides.shotgunPump;
    s.pumpBase = s.pump.position.z;
    detailBox(shotgun, .15, .13, .27, 0, -.005, .18, mat.resin);
    detailBox(shotgun, .12, .077, .33, 0, -.012, -.18, mat.gunmetal);
    const shellTube = addWeaponDetail(shotgun, new THREE.CylinderGeometry(.023, .023, .47, 12), mat.gunmetal, 0, -.045, -.45, Math.PI/2);
    const ridge = detailBox(shotgun, .13, .02, .26, 0, -.057, -.33, mat.resin);
    for (let i=0; i<5; i++) detailBox(shotgun, .121, .013, .014, 0, -.035, -.46 + i*.048, mat.tan);
    detailBox(shotgun, .04, .031, .08, 0, .114, -.53, mat.steel);
    s.shell = new THREE.Group();
    addWeaponDetail(s.shell, new THREE.CylinderGeometry(.028, .028, .12, 10), mat.brass, 0,0,0, Math.PI / 2);
    addWeaponDetail(s.shell, new THREE.CylinderGeometry(.029, .029, .02, 10), mat.resin, 0,0,-.067, Math.PI / 2);
    s.shell.visible = false;
    shotgun.add(s.shell);

    // PSG-1 Laser — scope, mount, energy emitter/capacitor and animated bolt.
    const l = buildRig(railgun, 'RAILGUN', -.86, -.14, -.28);
    l.mag = detailBox(railgun, .085, .20, .12, 0, -.165, -.095, mat.resin);
    l.magBase = { y:l.mag.position.y, z:l.mag.position.z };
    l.bolt = detailBox(railgun, .026, .04, .12, .069, .042, -.11, mat.steel);
    l.boltBase = l.bolt.position.z;
    detailBox(railgun, .105, .1, .28, 0, -.02, .34, mat.resin);
    detailBox(railgun, .094, .042, .52, 0, .12, -.13, mat.gunmetal);
    detailBox(railgun, .068, .018, .34, 0, -.058, -.41, mat.steel);
    detailBox(railgun, .09, .08, .16, 0, .15, -.04, mat.gunmetal);
    for (let i=0; i<4; i++) detailBox(railgun, .014, .05, .052, .06, -.02, -.45 + i*.09, mat.steel);
    l.charge = addWeaponDetail(railgun, new THREE.CylinderGeometry(.03, .03, .21, 12), mat.glow,
        0, -.067, -.55, Math.PI/2);
    ring(railgun, .034, -.75, mat.steel);

    weaponPresentation.rigs = rigs;
}

function beginWeaponReload(weaponIdx, duration) {
    // Eventos sonoros pertencem à mesma máquina de estados que a recarga lógica.
    if (!weaponPresentation.rigs[weaponIdx]) return;
    weaponPresentation.activeReload = {
        weaponIdx, elapsed: 0, duration: Math.max(.15, duration), played: new Set()
    };
}

function cancelWeaponReload() {
    weaponPresentation.activeReload = null;
    for (const rig of weaponPresentation.rigs) {
        if (rig.mag && rig.magBase) rig.mag.position.set(rig.mag.position.x, rig.magBase.y, rig.magBase.z);
        if (rig.slide) rig.slide.position.z = rig.slideBase;
        if (rig.bolt) rig.bolt.position.z = rig.boltBase;
        if (rig.pump) rig.pump.position.z = rig.pumpBase;
        if (rig.shell) rig.shell.visible = false;
        rig.left.position.set(rig.leftBase.x, rig.leftBase.y, rig.leftBase.z);
        rig.left.rotation.x = 0;
        rig.left.rotation.z = 0;
    }
}
function registerWeaponShot(weaponIdx) {
    const rig = weaponPresentation.rigs[weaponIdx];
    if (!rig) return;
    rig.shot = 1;
    if (rig.pump) rig.firePump = 1;
}
function equipWeaponPresentation(weaponIdx) {
    cancelWeaponReload();
    weaponPresentation.equipTime = .20;
    const rig = weaponPresentation.rigs[weaponIdx];
    if (rig) rig.shot = 0;
}
function updateWeaponPresentation(dt) {
    if (!weaponPresentation.rigs.length) return;
    const active = weaponPresentation.rigs[state.currentWeaponIdx];
    const reload = weaponPresentation.activeReload;
    let progress = -1;
    if (reload && reload.weaponIdx === state.currentWeaponIdx && state.isReloading) {
        reload.elapsed = Math.min(reload.duration, reload.elapsed + dt);
        progress = reload.elapsed / reload.duration;
        // Sincronizados com a animação; nenhum setTimeout adicional necessário.
        const shots = active.id === 'SHOTGUN'
            ? [[.20,'mag'],[.43,'mag'],[.66,'mag'],[.84,'bolt']]
            : [[.24,'mag'],[.68,'mag'],[.84,'bolt']];
        for (const [when, stage] of shots) {
            const key = when.toFixed(2);
            if (progress >= when && !reload.played.has(key)) {
                reload.played.add(key);
                sound.playReloadStage(active.id, stage);
            }
        }
    } else if (reload && !state.isReloading) {
        cancelWeaponReload();
    }
    for (const rig of weaponPresentation.rigs) {
        // Mesma malha, animações sempre em transforms, nunca geramos geometria por frame.
        rig.shot = Math.max(0, rig.shot - dt * 11);
        rig.firePump = Math.max(0, rig.firePump - dt * 2.9);
        const t = rig === active ? progress : -1;
        const magPull = t < 0 ? 0 : weaponPulse(.08,.25,.52,.78,t);
        const boltPull = t < 0 ? 0 : weaponPulse(.76,.85,.9,.98,t);
        if (rig.mag && rig.magBase) {
            rig.mag.position.y = rig.magBase.y - magPull * (rig.id === 'PISTOL' ? .25 : .32);
            rig.mag.position.z = rig.magBase.z + magPull * .055;
            rig.mag.rotation.z = rig.id === 'RIFLE' ? magPull * .19 : -magPull * .16;
        }
        if (rig.slide) rig.slide.position.z = rig.slideBase + rig.shot * .11 + boltPull * .14;
        if (rig.bolt) rig.bolt.position.z = rig.boltBase + rig.shot * .08 + boltPull * .13;
        if (rig.pump) {
            const cycling = t < 0 ? rig.firePump : Math.max(rig.firePump, boltPull);
            rig.pump.position.z = rig.pumpBase + cycling * .145;
        }
        if (rig.charge) rig.charge.scale.set(1 + rig.shot * .65, 1 + rig.shot * .8 + boltPull, 1 + rig.shot * .65);
        const loadingHand = rig.id === 'SHOTGUN'
            ? (t >= 0 ? .5 + Math.sin(t * Math.PI * 6) * .32 : 0)
            : magPull;
        rig.left.position.set(rig.leftBase.x + loadingHand * -.025,
            rig.leftBase.y - loadingHand * .18, rig.leftBase.z + loadingHand * .12);
        rig.left.rotation.x = loadingHand * -.37;
        rig.left.rotation.z = loadingHand * -.34;
        if (rig.shell) {
            const showing = t >= .10 && t <= .77;
            rig.shell.visible = showing;
            if (showing) rig.shell.position.set(rig.left.position.x + .04, rig.left.position.y + .02, rig.left.position.z - .06);
        }
    }
    weaponPresentation.equipTime = Math.max(0, weaponPresentation.equipTime - dt);
    const kick = active.shot;
    const inReload = progress < 0 ? 0 : weaponPulse(.02,.18,.78,1,progress);
    gunGroup.rotation.x += inReload * -.19 + kick * .095;
    gunGroup.rotation.z = inReload * -.22 - kick * .03 + weaponPresentation.equipTime * .2;
    gunGroup.rotation.y = inReload * -.08 + kick * .025;
    gunGroup.position.y -= inReload * .08;
}
