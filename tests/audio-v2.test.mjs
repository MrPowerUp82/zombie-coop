import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGameHarness } from './harness.mjs';

const soundFile = (name) => path.join('assets','audio',name+'.wav');

test('Audio V2: four weapon shots are distinct and shotgun source was preserved', () => {
    const shots=['pistol_fire','rifle_fire','shotgun_fire','railgun_fire'];
    for (const name of shots) assert.ok(fs.existsSync(soundFile(name)));
    const hashes=shots.map(n=>crypto.createHash('sha256').update(fs.readFileSync(soundFile(n))).digest('hex'));
    assert.equal(new Set(hashes).size,4);
    assert.equal(hashes[2], 'fcfe61265b4e53239fc15582ed704766f2504acd6d85d1fc3d3875d871567c30');
});

test('Audio V2: soundtrack covers combat, enemies, movement, pickups and UI', () => {
    const required=['ambient_industrial','impact_body','impact_head','impact_metal','explosion',
       'zombie_groan_1','zombie_groan_2','zombie_groan_3','zombie_groan_4','zombie_attack','zombie_die',
       'footstep_1','footstep_2','footstep_3','footstep_4','jump','land',
       'pickup','heal','ui_click','ui_confirm','ui_deny','ping','wave_start','wave_clear','flashlight',
       'grenade_throw','grenade_bounce','weapon_empty','turret_fire','melee_hit','melee_swing','damage_player','death_player'];
    const {game}=createGameHarness();
    for(const name of required) {
       assert.ok(fs.existsSync(soundFile(name)), name+' missing');
       assert.ok(game.sound.sampleNames.includes(name),name+' not in preload');
    }
});

test('Audio V2: footsteps are timed by elapsed time and stop when stationary', () => {
    const {game}=createGameHarness();
    const calls=[];
    game.sound.playSample=(...args)=>{calls.push(args);return true;};
    game.sound.updateFootsteps(.016,true,true,false);
    assert.equal(calls.length,1);
    for(let i=0;i<12;i++) game.sound.updateFootsteps(.016,true,true,false);
    assert.equal(calls.length,1);
    game.sound.updateFootsteps(.2,true,true,false);
    assert.equal(calls.length,2);
    game.sound.updateFootsteps(.016,false,true,false);
    assert.equal(game.sound.stepCooldown,0);
});

test('Audio V2: gameplay uses new sounds for grenades, footsteps, zombie hits and flashlight', () => {
    const {game}=createGameHarness();
    const sounds=[];
    game.sound.playSample=(name)=>{sounds.push(name);return true;};
    game.startGame();
    game.keys.w=true;game.updatePlayer(.1);
    assert.ok(sounds.some(s=>s.startsWith('footstep_')));
    game.keys.w=false;
    game.toggleFlashlight?.();
    const zombie=game.spawnZombie({type:'WALKER',x:0,z:-8,uid:1234});
    game.damageZombie(zombie,15,zombie.mesh.position.clone(),false);
    assert.ok(sounds.includes('impact_body'));
});

test('Audio V2: mixer supports volume, mute and limits rapid duplicate impacts', () => {
    const {game}=createGameHarness();
    const s=game.sound;
    const calls=[];
    const mockNode=()=>({gain:{value:0},connect:()=>{},disconnect:()=>{}, start:()=>{},stop:()=>{},playbackRate:{value:1},pan:{value:0}});
    s.ctx={currentTime:6,state:'running',createBufferSource:()=>{const n=mockNode();calls.push(n);return n;},createGain:mockNode,createStereoPanner:mockNode};
    s.master=mockNode();s.samples.set('impact_body',{});
    s.setVolume(.4);
    assert.ok(Math.abs(s.master.gain.value-.344)<.001);
    assert.equal(s.playSample('impact_body',1,1,0,.1),true);
    assert.equal(s.playSample('impact_body',1,1,0,.1),false);
    assert.equal(calls.length,1);
    assert.equal(s.toggle(),false);
    assert.equal(s.master.gain.value,0);
    assert.equal(s.playSample('impact_body'),false);
    assert.equal(s.toggle(),true);
    assert.ok(Math.abs(s.master.gain.value-.344)<.001);
});
