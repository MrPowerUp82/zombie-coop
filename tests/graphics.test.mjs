import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameHarness } from './harness.mjs';

test('six quality presets are available with real shadow and LOD budgets', () => {
    const {game} = createGameHarness();
    for (const name of ['AUTO','ECONOMICO','BAIXO','MEDIO','ALTO','ULTRA']) {
        game.applyGraphicsQuality(name,false);
        const preset = game.currentGraphicsPreset();
        assert.equal(game.gfxQuality,name);
        assert.equal(game.renderer.shadowMap.enabled,preset.shadows>0);
        assert.equal(game.scene.userData.sunLight.castShadow,preset.shadows>0);
        assert.equal(game.dom.container!==null,true);
    }
    game.applyGraphicsQuality('BAIXO',false);
    assert.equal(game.scene.userData.localLights.every(light=>light.visible===false),true);
    game.applyGraphicsQuality('ALTO',false);
    assert.equal(game.scene.userData.localLights.every(light=>light.visible===true),true);
});

test('graphics switching does not change multiplayer session or score', () => {
    const {game} = createGameHarness();
    game.net.mode = 'HOST'; game.net.connected = true;
    game.state.score = 1234; game.state.wave = 7;
    game.applyGraphicsQuality('ECONOMICO',false);
    assert.equal(game.net.mode,'HOST');
    assert.equal(game.net.connected,true);
    assert.equal(game.state.score,1234);
    assert.equal(game.state.wave,7);
});

test('shader warm-up compiles shadow/light variants and cleans preview scene', () => {
    const {game} = createGameHarness();
    let count=0;
    game.renderer.compile = () => {count++;};
    const before=game.scene.children.length;
    const prevShadows=game.renderer.shadowMap.enabled;
    assert.equal(game.prewarmGameShaders(),true);
    assert.equal(game.shadersPrewarmed,true);
    assert.equal(count,4);
    assert.equal(game.scene.children.length,before);
    assert.equal(game.renderer.shadowMap.enabled,prevShadows);
    assert.equal(game.prewarmGameShaders(),false,'compile should only run once');
    assert.equal(count,4);
});

test('AUTO adapts resolution budget in game without changing other preset features', () => {
    const {game} = createGameHarness();
    game.applyGraphicsQuality('AUTO',false);
    const initial=game.graphicsAutoRatio;
    game.state.status='PLAYING';
    for (let i=0;i<30;i++) game.updateGraphicsPerformance(0.09); // 11 fps simulated
    assert.ok(game.graphicsAutoRatio < initial, `auto must drop ratio below ${initial}`);
    assert.equal(game.renderer.shadowMap.enabled,true);
    assert.equal(game.gfxQuality,'AUTO');
});

test('graphics UI and startup warm-up hooks exist and presets bypass bloom correctly', () => {
    const html=fs.readFileSync('index.html','utf8');
    const main=fs.readFileSync('js/main.js','utf8');
    const visuals=fs.readFileSync('js/visuals.js','utf8');
    assert.match(html,/id="gfx-profile"/);
    assert.match(html,/id="shader-warmup-status"/);
    assert.match(main,/prewarmGameShaders\(\)/);
    assert.match(visuals,/!currentGraphicsPreset\(\)\.bloom/);
    assert.match(visuals,/renderer\.compile\(scene,camera\)/);
});
