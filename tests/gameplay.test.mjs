import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGameHarness } from './harness.mjs';

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

test('Review Fix 1: stagger_probabilities_and_leg_damage_scaling - respects per-type stagger probabilities and 0.85x leg multiplier', () => {
    const { game, sandbox } = createGameHarness();
    game.startGame();
    game.zombies.length = 0;

    // High roll (0.9) should NOT stagger WALKER on HEAD (65%) or LEG (75%)
    sandbox.Math.random = () => 0.9;
    const zNoStagger = game.spawnZombie({ uid: 401, type: 'WALKER', x: 0, z: -5, hp: 100 });
    game.damageZombie(zNoStagger, 20, zNoStagger.mesh.position.clone(), true, false, 'HEAD');
    assert.equal(zNoStagger.staggerTimer, 0, 'Roll 0.9 > 0.65 must not stagger WALKER on HEAD');

    // BOSS should NEVER stagger on LEG even with roll 0.05 (0% chance)
    sandbox.Math.random = () => 0.05;
    const zBoss = game.spawnZombie({ uid: 402, type: 'BOSS', x: 0, z: -8, hp: 500 });
    game.damageZombie(zBoss, 100, zBoss.mesh.position.clone(), false, false, 'LEG');
    assert.equal(zBoss.staggerTimer, 0, 'BOSS must have 0% stagger chance on LEG hits');
    assert.equal(zBoss.hp, 500 - 85, 'LEG hitZone in damageZombie must scale damage by 0.85x');
});

test('Review Fix 2: brute_charge_speed_and_stagger_interrupt - charging brute moves at 2.3x speed (not 3.3x) and stagger resets chargeState', () => {
    const { game, sandbox } = createGameHarness();
    game.startGame();
    game.zombies.length = 0;
    game.obstacles.length = 0;
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);

    const brute = game.spawnZombie({ uid: 403, type: 'BRUTE', x: 0, z: -12, hp: 300 });
    brute.speed = 2.5;
    brute.chargeState = 'CHARGING';
    brute.chargeTimer = 0.8;
    brute.chargeDirX = 0;
    brute.chargeDirZ = 1;

    game.updateZombies(0.1, 1.0);
    // Expected step is 2.5 * 2.3 * 0.1 = 0.575m (not 0.825m from double-stepping)
    assert.ok(Math.abs(brute.mesh.position.z - (-12 + 0.575)) < 0.02, `Expected z ~ -11.425, got ${brute.mesh.position.z}`);

    // Staggering a charging brute must reset chargeState to IDLE
    sandbox.Math.random = () => 0.1;
    game.damageZombie(brute, 30, brute.mesh.position.clone(), true, false, 'HEAD');
    assert.equal(brute.staggerTimer, 2.8);
    game.updateZombies(0.1, 1.1);
    assert.equal(brute.chargeState, 'IDLE', 'Staggered Brute must reset chargeState to IDLE');
});

test('Review Fix 3: shop_pauses_bot_ai_and_ticks_cooldowns - SHOP mode in Bot Co-op pauses Sheva AI and still ticks player invulnTimer', () => {
    const { game } = createGameHarness();
    game.startGame();
    game.toggleCoopBot();
    game.zombies.length = 0;

    // Place a zombie right next to Sheva
    const z = game.spawnZombie({ uid: 404, type: 'WALKER', x: game.net.ally.x + 0.5, z: game.net.ally.z, hp: 100 });
    const shevaHpBefore = game.net.ally.hp;
    game.state.invulnTimer = 0.35;

    // Enter SHOP mode
    game.toggleShopModal();
    assert.equal(game.state.status, 'SHOP');

    // Simulate frame in SHOP mode via updateNetworkSync
    game.updateNetworkSync(1.0, 0.2);
    assert.equal(game.net.ally.hp, shevaHpBefore, 'Sheva must not take zombie damage while SHOP is open in Bot mode');
    assert.equal(z.hp, 100, 'Sheva must not shoot zombies while SHOP is open in Bot mode');
    assert.ok(game.state.invulnTimer < 0.35, 'invulnTimer must still tick down while in SHOP');
});

test('Review Fix 4: start_game_resets_ally_and_cancels_wave_timers - startGame resets downed Sheva and clears pending wave timeouts', () => {
    const { game } = createGameHarness();
    game.startGame();
    game.toggleCoopBot();
    game.net.ally.isDowned = true;
    game.net.ally.hp = 0;

    // Restart game
    game.startGame();
    assert.equal(game.net.ally.isDowned, false, 'startGame must reset net.ally.isDowned to false');
    assert.equal(game.net.ally.hp, game.net.ally.maxHp, 'startGame must restore net.ally.hp to maxHp');
});

test('Review Fix 5: surviving_melee_resets_stagger_pose_and_knee_lowers_mesh - KNEE stagger lowers mesh.position.y and finisher resets pose on surviving Brute', () => {
    const { game } = createGameHarness();
    game.startGame();
    game.zombies.length = 0;
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);

    const brute = game.spawnZombie({ uid: 405, type: 'BRUTE', x: 0, z: -2.2, hp: 300 });
    brute.staggerTimer = 2.5;
    brute.staggerType = 'KNEE';

    game.updateZombies(0.1, 1.0);
    assert.ok(brute.mesh.position.y < -0.2, 'KNEE stagger must lower zombie mesh.position.y');

    // Execute melee finisher on 300 HP Brute (survives with 120 HP)
    game.performMeleeAttack();
    assert.equal(brute.hp, 120);
    assert.equal(brute.staggerTimer, 0);
    assert.equal(brute.mesh.position.y, 0, 'Surviving Brute must have mesh.position.y reset to 0 after melee finisher');
    assert.equal(brute.parts.torso.rotation.x, 0, 'Surviving Brute must have torso.rotation.x reset to 0 after melee finisher');
});

test('Review Fix 6: melee_finisher_combo_step_and_shove_cone - finisher grants +2 combo, steps player forward, guarantees drop, and shove only hits front cone', () => {
    const { game, sandbox } = createGameHarness();
    game.startGame();
    game.zombies.length = 0;
    game.lootDrops.length = 0;
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);
    game.state.yaw = 0; // Facing -Z
    sandbox.Math.random = () => 0.99; // High roll so non-guaranteed drop would fail

    const zStaggered = game.spawnZombie({ uid: 406, type: 'WALKER', x: 0, z: -2.5, hp: 100 });
    zStaggered.staggerTimer = 2.0;
    zStaggered.staggerType = 'HEAD';
    const comboBefore = game.state.combo;

    game.performMeleeAttack();
    assert.equal(game.state.combo, comboBefore + 2, 'Melee finisher kill must grant +2 combo');
    assert.equal(game.state.comboTimer, 5.5, 'Melee finisher kill must set comboTimer to 5.5s');
    assert.ok(game.camera.position.z < -0.5, 'Melee finisher must step player 0.8m toward target');
    assert.equal(game.lootDrops.length, 1, 'Melee finisher kill must guarantee a loot drop even on 0.99 random roll');

    // Shove cone check: zombie behind player (+Z when yaw=0) should NOT be hit by defensive shove
    game.zombies.length = 0;
    game.state.meleeCooldown = 0;
    game.camera.position.set(0, game.CONFIG.playerHeight, 0);
    const zBehind = game.spawnZombie({ uid: 407, type: 'WALKER', x: 0, z: 1.5, hp: 100 });
    const zFront = game.spawnZombie({ uid: 408, type: 'WALKER', x: 0, z: -1.5, hp: 100 });

    game.performMeleeAttack();
    assert.equal(zBehind.hp, 100, 'Defensive shove must not hit zombie behind player');
    assert.equal(zFront.hp, 65, 'Defensive shove must hit zombie in front cone');
    assert.equal(zFront.attackCooldown, 1.1, 'Defensive shove must set z.attackCooldown = 1.1');
});

test('Review Fix 7: loot_drops_cap_lifetime_and_spec_rewards - caps lootDrops at 12 and expires after 18s', () => {
    const { game } = createGameHarness();
    game.startGame();
    game.lootDrops.length = 0;

    for (let i = 0; i < 15; i++) {
        game.spawnLootDrop({ x: 10 + i, y: 0, z: 10 }, true, false, 'GOLD');
    }
    assert.equal(game.lootDrops.length, 12, 'Active lootDrops must be capped at 12');
    assert.equal(game.lootDrops[0].life, 18, 'Loot drop must start with 18s lifetime');

    game.updateEffectsAndCrates(18.5, 20.0);
    assert.equal(game.lootDrops.length, 0, 'Loot drops must expire after 18s');
});

test('Visual 1: high-poly zombies keep anatomical head/leg hitboxes and scalable details', () => {
    const {game} = createGameHarness();
    game.state.status='PLAYING';
    const zombie=game.spawnZombie({uid:9001,type:'WALKER',x:55,z:0,hp:70});
    assert.ok(zombie.detailMeshes.length >= 10, 'models include separately scalable facial/limb details');
    assert.ok(zombie.parts.head.children.length > 3, 'head is made of multiple anatomical elements');
    const zones=[];
    zombie.mesh.traverse(node => {if(node.isMesh && !node.userData.isUI) zones.push(node.userData.hitZone);});
    assert.ok(zones.includes('HEAD') && zones.includes('BODY') && zones.includes('LEG'));
    assert.ok(zones.every(zone => ['HEAD','BODY','LEG'].includes(zone)), 'every non-UI mesh has hit zone');
    game.updateZombies(0.016,1.0);
    assert.ok(zombie.detailMeshes.every(m => !m.visible), 'far away microdetail is culled');
    zombie.mesh.position.set(3,0,0);
    game.updateZombies(0.016,2.0);
    assert.ok(zombie.detailMeshes.every(m => m.visible), 'microdetail returns on close-up');
});

test('Visual 2: cinematic shader pipeline is loaded after entities but before gameplay', () => {
    const html=fs.readFileSync(path.resolve(process.cwd(),'index.html'),'utf8');
    const srcEntities=html.indexOf('src="js/entities.js"');
    const srcVisual=html.indexOf('src="js/visuals.js"');
    const srcMain=html.indexOf('src="js/main.js"');
    assert.ok(srcEntities>=0 && srcVisual>srcEntities && srcMain>srcVisual);
    const visualCode=fs.readFileSync(path.resolve(process.cwd(),'js/visuals.js'),'utf8');
    assert.ok(visualCode.includes('function renderCinematicFrame'));
    assert.ok(visualCode.includes("gfxQuality !== 'ULTRA'"), 'quality fallback must skip postprocessing');
});
