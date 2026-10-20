import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createGameHarness } from './harness.mjs';

const nearly = (a,b) => Math.abs(a-b)<.002;

test('Weapon: all four models have articulated parts, left/right gloves and detail meshes', () => {
    const {game}=createGameHarness();
    assert.equal(game.weaponPresentation.rigs.length,4);
    const ids=['PISTOL','RIFLE','SHOTGUN','RAILGUN'];
    for (const [idx, rig] of game.weaponPresentation.rigs.entries()) {
        assert.equal(rig.id,ids[idx]);
        assert.ok(rig.model.children.length>=6);
        assert.ok(rig.left.children.length>=6);
        assert.ok(rig.right.children.length>=6);
    }
    assert.ok(game.weaponPresentation.rigs[0].slide);
    assert.ok(game.weaponPresentation.rigs[1].bolt);
    assert.ok(game.weaponPresentation.rigs[2].pump);
    assert.ok(game.weaponPresentation.rigs[3].charge);
});

test('Weapon: pistol shot animates slide and returns to rest without allocating meshes', () => {
    const {game}=createGameHarness();
    game.startGame();game.switchWeapon(0);
    const pistol=game.weaponPresentation.rigs[0];
    const length=pistol.model.children.length;
    const base=pistol.slideBase;
    game.state.lastFireTime=0;
    game.fireWeapon();
    game.updateWeaponPresentation(.015);
    assert.ok(pistol.slide.position.z>base);
    game.updateWeaponPresentation(.2);
    assert.ok(nearly(pistol.slide.position.z,base));
    assert.equal(pistol.model.children.length,length);
});

test('Weapon: magazine and left hand move during reload, finish resets both', () => {
    const {game}=createGameHarness();
    game.startGame();
    game.state.weaponsState[1].mag=9;
    game.reloadWeapon();
    assert.equal(game.state.isReloading,true);
    const rifle=game.weaponPresentation.rigs[1];
    game.updateWeaponPresentation(1.45*.37);
    assert.ok(rifle.mag.position.y<rifle.magBase.y-.1);
    assert.ok(rifle.left.position.y<rifle.leftBase.y-.07);
    game.updateWeaponPresentation(1.45*.63);
    game.state.isReloading=false;
    game.updateWeaponPresentation(.016);
    assert.ok(nearly(rifle.mag.position.y,rifle.magBase.y));
    assert.ok(nearly(rifle.left.position.y,rifle.leftBase.y));
});

test('Weapon: shotgun animates successive shell insertions then pump', () => {
    const {game}=createGameHarness();
    game.startGame();game.switchWeapon(2);
    game.state.weaponsState[2].mag=2;
    game.reloadWeapon();
    const shotgun=game.weaponPresentation.rigs[2];
    game.updateWeaponPresentation(1.8*.26);
    assert.equal(shotgun.shell.visible,true);
    game.updateWeaponPresentation(1.8*.60);
    assert.ok(shotgun.pump.position.z>=shotgun.pumpBase);
    assert.equal(game.weaponPresentation.activeReload.played.size,4);
});

test('Weapon: railgun charges on shot and moving bolt during reload', () => {
    const {game}=createGameHarness();
    game.startGame();game.switchWeapon(3);
    const rail=game.weaponPresentation.rigs[3];
    game.fireWeapon();game.updateWeaponPresentation(.015);
    assert.ok(rail.charge.scale.x>1);
    game.state.weaponsState[3].mag=0;
    game.reloadWeapon();game.updateWeaponPresentation(1.9*.87);
    assert.ok(rail.bolt.position.z>rail.boltBase);
});

test('Weapon: switching mid reload cancels both gameplay timer and animation', () => {
    const {game}=createGameHarness();
    game.startGame();game.state.weaponsState[1].mag=4;game.reloadWeapon();
    game.updateWeaponPresentation(.5);
    game.switchWeapon(0);
    assert.equal(game.state.isReloading,false);
    assert.equal(game.weaponPresentation.activeReload,null);
    assert.ok(nearly(game.weaponPresentation.rigs[1].mag.position.y,game.weaponPresentation.rigs[1].magBase.y));
});

test('Weapon: reload and weapon type update sync to remote ally', () => {
    const {game}=createGameHarness();
    game.net.connected=true;game.net.ally.active=true;
    game.net.ally.meshGroup.visible=true;
    game.handleNetMessage({type:'RELOAD_FX',weaponId:'SHOTGUN',duration:1.8});
    const rig=game.net.ally.meshGroup.userData.rig;
    assert.equal(game.net.ally.weaponId,'SHOTGUN');
    assert.equal(rig.reloadRemaining,1.8);
    game.handleNetMessage({type:'PLAYER_STATE',name:'Parceiro',x:1,y:1,z:1,yaw:0,pitch:0,hp:100,maxHp:100,isDowned:false,weaponId:'PISTOL'});
    assert.equal(game.net.ally.weaponId,'PISTOL');
    game.handleNetMessage({type:'SHOOT_FX',weaponId:'RAILGUN',sx:1,sy:1,sz:1,ex:2,ey:2,ez:2});
    assert.ok(rig.shotTime>0);
});

test('Weapon: bundled audio library contains PCM wave files (mono or stereo)', () => {
    const files=fs.readdirSync('assets/audio').filter(name=>name.endsWith('.wav'));
    assert.ok(files.length>=47);
    for (const name of files) {
        const contents=fs.readFileSync(path.join('assets/audio',name));
        assert.equal(contents.toString('ascii',0,4),'RIFF');
        assert.equal(contents.toString('ascii',8,12),'WAVE');
        assert.ok([1,2].includes(contents.readUInt16LE(22)));
        assert.ok(contents.length>1024);
    }
    const audio=fs.readFileSync('js/audio.js','utf8');
    assert.match(audio,/decodeAudioData/);
    assert.match(audio,/playReloadStage/);
    const html=fs.readFileSync('index.html','utf8');
    assert.ok(html.indexOf('weapon-animations.js') < html.indexOf('main.js'));
});

test('Weapon: bundled sounds are served correctly by local multiplayer server', async () => {
    const proc=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:'0'},stdio:['ignore','pipe','pipe']});
    try {
        const url=await Promise.race([
            new Promise((resolve,reject) => {
                let output=''; proc.stdout.on('data',v=>{output+=v.toString();const match=output.match(/localhost:(\d+)/);if(match)resolve('http://127.0.0.1:'+match[1]);});
                proc.on('exit',code=>reject(new Error('server exit '+code)));
            }),
            new Promise((_,reject)=>setTimeout(()=>reject(new Error('server timeout')),3000))
        ]);
        const response=await fetch(url+'/assets/audio/shotgun_fire.wav');
        assert.equal(response.status,200);
        assert.match(response.headers.get('content-type'),/audio\/wav/);
        assert.equal(Buffer.from(await response.arrayBuffer()).toString('ascii',0,4),'RIFF');
    } finally {proc.kill('SIGTERM');}
});
