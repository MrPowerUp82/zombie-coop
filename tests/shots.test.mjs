import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameHarness } from './harness.mjs';

test('FX: muzzle has layered flare and local shots flash without timeout race', () => {
    const {game} = createGameHarness();
    assert.ok(game.muzzleFlash.children.length >= 7);
    game.startGame();
    const priorAmmo=game.state.weaponsState[1].mag;
    game.fireWeapon();
    assert.equal(game.state.weaponsState[1].mag,priorAmmo-1);
    assert.equal(game.muzzleFlash.visible,true);
    assert.ok(game.muzzleLight.intensity>0);
    assert.equal(game.bulletTracers.length,1);
    game.updateShotEffects(.12);
    assert.equal(game.muzzleFlash.visible,false);
    assert.equal(game.muzzleLight.intensity,0);
    assert.equal(game.bulletTracers.length,0);
});

test('FX: pooled tracer meshes are reused between shots with no unbounded growth', () => {
    const {game} = createGameHarness();
    game.startGame();
    game.fireWeapon();
    const original=game.bulletTracers[0];
    game.updateShotEffects(.2);
    assert.equal(game.bulletTracers.length,0);
    assert.equal(game.shotFX.tracerPool.length,1);
    game.state.lastFireTime=0;
    game.fireWeapon();
    assert.equal(game.bulletTracers[0],original);
    assert.equal(game.shotFX.tracerPool.length,0);
    game.clearShotEffects();
    assert.equal(game.bulletTracers.length,0);
    assert.equal(game.shotFX.rings.length,0);
});

test('FX: shotgun has seven distinct pellet streaks with its own flash scale', () => {
    const {game}=createGameHarness();
    game.startGame();
    game.switchWeapon(2);
    game.fireWeapon();
    assert.equal(game.bulletTracers.length,7);
    assert.ok(game.muzzleFlash.scale.x>1.3,'shotgun should produce a larger muzzle flare');
    game.updateShotEffects(0.5);
    assert.equal(game.bulletTracers.length,0);
    assert.equal(game.shotFX.tracerPool.length,7);
});

test('FX: light graphic mode disables smoke/pulses but keeps projectile trails', () => {
    const {game}=createGameHarness();
    game.startGame();
    game.applyGraphicsQuality('ECONOMICO',false);
    game.fireWeapon();
    assert.equal(game.bulletTracers.length,1);
    assert.equal(game.shotFX.smoke.length,0);
    game.emitShotImpact(game.camera.position.clone(),'RAILGUN','WALL');
    assert.equal(game.shotFX.rings.length,0);
    game.applyGraphicsQuality('ULTRA',false);
    game.emitShotImpact(game.camera.position.clone(),'RAILGUN','WALL');
    assert.equal(game.shotFX.rings.length,1);
    assert.ok(game.shotFX.smoke.length>0);
    game.updateShotEffects(0.65);
    assert.equal(game.shotFX.rings.length,0);
    assert.equal(game.shotFX.smoke.length,0);
});

test('FX: remote fire shows partner muzzle and a synchronized projectile', () => {
    const {game}=createGameHarness();
    game.net.connected=true;
    game.net.ally.active=true;
    game.handleNetMessage({type:'SHOOT_FX',weaponId:'RAILGUN',sx:1,sy:2,sz:3,ex:10,ey:1,ez:2});
    assert.equal(game.bulletTracers.length,1);
    assert.equal(game.net.ally.muzzleFlash.visible,true);
    game.updateShotEffects(.3);
    assert.equal(game.net.ally.muzzleFlash.visible,false);
    assert.equal(game.bulletTracers.length,0);
    game.handleNetMessage({type:'SHOOT_FX',weaponId:'RIFLE',sx:NaN,sy:1,sz:1,ex:1,ey:1,ez:1});
    assert.equal(game.bulletTracers.length,0,'invalid coordinates must not create projectile');
});

test('FX: start of new mission cleans active visual objects without affecting game or network', () => {
    const {game}=createGameHarness();
    game.startGame();
    game.fireWeapon();
    game.emitShotImpact(game.camera.position.clone(),'SHOTGUN','WALL');
    assert.ok(game.bulletTracers.length>0);
    game.startGame();
    assert.equal(game.bulletTracers.length,0);
    assert.equal(game.shotFX.smoke.length,0);
    assert.equal(game.shotFX.rings.length,0);
    assert.equal(game.muzzleFlash.visible,false);
    assert.equal(game.state.status,'PLAYING');
});

test('FX: shot-specific shaders are registered for prewarm, script order is correct',()=>{
    const html=fs.readFileSync('index.html','utf8');
    const visuals=fs.readFileSync('js/visuals.js','utf8');
    assert.ok(html.indexOf('js/entities.js')<html.indexOf('js/shots.js'));
    assert.ok(html.indexOf('js/shots.js')<html.indexOf('js/visuals.js'));
    assert.match(visuals,/Rastros volumétricos, fumaça e pulso/);
    assert.match(visuals,/muzzleFlash/);
});
