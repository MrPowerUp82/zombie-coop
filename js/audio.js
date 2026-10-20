// Áudio V2: biblioteca PCM original pré-carregada, mixagem por categoria e sons ambientais.
// A escopeta mantém seu WAV da versão anterior. O áudio é ativado por interação do usuário.
class SoundSystem {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 1;
        try { const saved=localStorage.getItem('zombie-coop-volume');if(saved !== null) { const v=Number(saved);if(Number.isFinite(v) && v>=0 && v<=1) this.volume = v; } } catch (_) {}
        this.master = null;
        this.sampleBytes = new Map();
        this.samples = new Map();
        this.loadingDecoded = new Set();
        this.samplePromise = null;
        this.ambientSource = null;
        this.ambientRequested = false;
        this.lastPlayed = new Map();
        this.stepCooldown = 0;
        this.stepCount = 0;
        this.zombieCooldown = 1.5;
        this.zombieCounter = 0;
        this.sampleNames = [
            'pistol_fire','rifle_fire','shotgun_fire','railgun_fire',
            'pistol_reload','rifle_reload','shotgun_shell','shotgun_pump','railgun_reload',
            'weapon_bolt','weapon_equip','weapon_empty','turret_fire',
            'explosion','impact_body','impact_head','impact_metal','damage_player','death_player',
            'melee_swing','melee_hit','grenade_throw','grenade_bounce','jump','land',
            'footstep_1','footstep_2','footstep_3','footstep_4',
            'zombie_groan_1','zombie_groan_2','zombie_groan_3','zombie_groan_4',
            'zombie_attack','zombie_die','ambient_industrial',
            'pickup','heal','ui_click','ui_confirm','ui_deny','ping','wave_start','wave_clear',
            'sentry_deploy','boss_alarm','flashlight'
        ];
        this.mix = { guns:0.82, world:0.65, monsters:0.54, steps:0.42, ui:0.46, ambient:0.16 };
        this.categoryFor = name => {
            if (/_fire$|_reload$|_bolt$|_equip$|_empty$|shotgun_(shell|pump)/.test(name)) return 'guns';
            if (/^(zombie_|boss_alarm)/.test(name)) return 'monsters';
            if (/^(footstep_|jump$|land$)/.test(name)) return 'steps';
            if (/^(ambient_)/.test(name)) return 'ambient';
            if (/^(ui_|pickup$|heal$|ping$|wave_|sentry_deploy$|flashlight$)/.test(name)) return 'ui';
            return 'world';
        };
    }

    // Mantemos o nome por compatibilidade com os módulos já existentes.
    preloadWeaponAudio() {
        if (this.samplePromise) return this.samplePromise;
        if (typeof fetch !== 'function') return Promise.resolve(false);
        this.samplePromise = Promise.all(this.sampleNames.map(async name => {
            try {
                const response = await fetch('assets/audio/' + name + '.wav');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                this.sampleBytes.set(name, await response.arrayBuffer());
                this.decodeSample(name);
                return true;
            } catch (_) { return false; }
        })).then(results => results.some(Boolean));
        return this.samplePromise;
    }

    decodeSample(name) {
        if (!this.ctx || !this.sampleBytes.has(name) || this.samples.has(name) || this.loadingDecoded.has(name)) return;
        this.loadingDecoded.add(name);
        const bytes = this.sampleBytes.get(name).slice(0);
        Promise.resolve(this.ctx.decodeAudioData(bytes)).then(buffer => {
            this.samples.set(name, buffer);
            // A ambientação pode ter sido solicitada enquanto o WAV decodificava.
            if (name === 'ambient_industrial' && this.ambientRequested) this.startAmbient();
        }).catch(() => {}).finally(() => this.loadingDecoded.delete(name));
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
                this.master = this.ctx.createGain();
                this.master.gain.value = this.enabled ? this.volume * 0.86 : 0;
                if (this.ctx.createDynamicsCompressor) {
                    const limiter = this.ctx.createDynamicsCompressor();
                    limiter.threshold.value = -7;
                    limiter.knee.value = 9;
                    limiter.ratio.value = 5;
                    limiter.attack.value = 0.004;
                    limiter.release.value = 0.14;
                    this.master.connect(limiter);
                    limiter.connect(this.ctx.destination);
                } else this.master.connect(this.ctx.destination);
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        this.preloadWeaponAudio();
        for (const name of this.sampleBytes.keys()) this.decodeSample(name);
    }

    playSample(name, volume = 1, rate = 1, pan = 0, minInterval = 0) {
        if (!this.ctx || !this.enabled || this.ctx.state === 'suspended') return false;
        const buffer = this.samples.get(name);
        if (!buffer) { this.decodeSample(name); return false; }
        const now = this.ctx.currentTime;
        if (minInterval && now - (this.lastPlayed.get(name) ?? -Infinity) < minInterval) return false;
        this.lastPlayed.set(name, now);
        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        source.buffer = buffer;
        source.playbackRate.value = Math.min(1.45, Math.max(.7, rate));
        gain.gain.value = Math.max(0,Math.min(1, volume)) * this.mix[this.categoryFor(name)];
        source.connect(gain);
        if (pan && this.ctx.createStereoPanner) {
            const panner = this.ctx.createStereoPanner();
            panner.pan.value = Math.max(-1,Math.min(1,pan));
            gain.connect(panner);
            panner.connect(this.master);
        } else gain.connect(this.master);
        source.start(now);
        source.onended = () => { source.disconnect();gain.disconnect(); };
        return true;
    }

    setVolume(value) {
        this.volume = Math.min(1,Math.max(0,Number.isFinite(value) ? value : 1));
        if (this.master) this.master.gain.value=this.enabled ? this.volume*.86 : 0;
        try {localStorage.setItem('zombie-coop-volume',String(this.volume));} catch (_) {}
    }

    toggle() {
        this.enabled = !this.enabled;
        if (this.master) this.master.gain.value = this.enabled ? this.volume * 0.86 : 0;
        if (!this.enabled) this.stopAmbient();
        else if (this.ambientRequested) this.startAmbient();
        return this.enabled;
    }

    startAmbient() {
        this.ambientRequested = true;
        if (this.ambientSource || !this.ctx || !this.enabled) return;
        const buffer = this.samples.get('ambient_industrial');
        if (!buffer) { this.decodeSample('ambient_industrial'); return; }
        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = this.mix.ambient;
        source.connect(gain);gain.connect(this.master);
        source.start();
        source.onended = () => { source.disconnect();gain.disconnect(); };
        this.ambientSource = source;
    }

    stopAmbient() {
        if (this.ambientSource) {
            try {this.ambientSource.stop();} catch (_) {}
            this.ambientSource = null;
        }
    }
    suspendGameAudio() { this.ambientRequested = false;this.stopAmbient(); }

    // Passos só em movimento real e com contato com chão, framerate-independente.
    updateFootsteps(dt, moving, grounded, running, downed = false) {
        if (!moving || !grounded || !this.enabled) { this.stepCooldown = 0;return; }
        this.stepCooldown -= dt;
        if (this.stepCooldown <= 0) {
            this.stepCount += 1;
            this.playSample('footstep_' + ((this.stepCount % 4) + 1),downed ? .36 : running ? .85 : .61, .94 + Math.random()*.10);
            this.stepCooldown = downed ? .48 : running ? .255 : .365;
        }
    }

    playSpatial(name, distance, bearing = 0, maxDistance = 27, volume = 1) {
        if (distance > maxDistance) return false;
        const attenuation = Math.pow(Math.max(.04,1 - distance / maxDistance),1.8);
        return this.playSample(name, volume*attenuation, 0.94+Math.random()*.12, bearing);
    }

    // Escolhe no máximo um zumbi por intervalo, evitando dezenas de vozes em ondas grandes.
    updateZombieSounds(dt, zombieList, playerCamera) {
        if (!this.enabled || !this.ctx || !playerCamera || !zombieList || !zombieList.length) return;
        this.zombieCooldown -= dt;
        if (this.zombieCooldown > 0) return;
        this.zombieCooldown = 2 + Math.random()*1.6;
        const nearest = zombieList.map(z => ({z, dist:Math.hypot(z.mesh.position.x-playerCamera.position.x,z.mesh.position.z-playerCamera.position.z)}))
            .filter(item=>item.dist<24).sort((a,b)=>a.dist-b.dist).slice(0,5);
        if (!nearest.length) return;
        this.zombieCounter++;
        const choice = nearest[this.zombieCounter % nearest.length];
        const dx = choice.z.mesh.position.x-playerCamera.position.x;
        const dz = choice.z.mesh.position.z-playerCamera.position.z;
        const yaw = typeof state !== 'undefined' ? state.yaw : 0;
        const bearing = Math.max(-1, Math.min(1,(dx*Math.cos(yaw)-dz*Math.sin(yaw))/(choice.dist||1)));
        const n = choice.z.type === 'BOSS'||choice.z.type === 'BRUTE' ? 4 : (this.zombieCounter % 3)+1;
        this.playSpatial(`zombie_groan_${n}`,choice.dist,bearing,27,.92);
    }

    playShoot(weaponType='RIFLE', volume=1) {
        const samples={PISTOL:'pistol_fire',RIFLE:'rifle_fire',SHOTGUN:'shotgun_fire',RAILGUN:'railgun_fire'};
        return this.playSample(samples[weaponType] || 'rifle_fire', volume*(weaponType === 'SHOTGUN' ? .83 : .87), .97+Math.random()*.055);
    }
    playExplosion() { this.playSample('explosion',.96,.94+Math.random()*.09); }
    playEmptyGun() { this.playSample('weapon_empty',.46,1,0,.09); }
    playReload(weaponType='RIFLE') { this.playReloadStage(weaponType,'mag'); }
    playReloadStage(weaponType='RIFLE',stage='mag') {
        const byWeapon={PISTOL:'pistol_reload',RIFLE:'rifle_reload',SHOTGUN:'shotgun_shell',RAILGUN:'railgun_reload'};
        const name = stage === 'bolt' ? (weaponType === 'SHOTGUN'?'shotgun_pump':'weapon_bolt')
            : stage === 'equip' ? 'weapon_equip' : byWeapon[weaponType] || 'rifle_reload';
        this.playSample(name,stage === 'equip' ? .45 : .74,.96+Math.random()*.06);
    }
    playEquip(weaponType='RIFLE') { this.playReloadStage(weaponType,'equip'); }
    playHit(isHeadshot=false) { this.playSample(isHeadshot?'impact_head':'impact_body',.53, .96+Math.random()*.10,0,.025); }
    playMelee() { this.playSample('melee_swing',.62); }
    playMeleeHit() { this.playSample('melee_hit',.88); }
    playPlayerDamage() { this.playSample('damage_player',.86,1,0,.18); }
    playPickup() { this.playSample('pickup',.82); }
    playHeal() { this.playSample('heal',.89); }
    playPing() { this.playSample('ping',.72); }
    playWaveStart(boss=false) { this.playSample(boss?'boss_alarm':'wave_start',.93); }
    playWaveClear() { this.playSample('wave_clear',.7); }
    playUiClick() { this.playSample('ui_click',.72,1,0,.05); }
    playUiConfirm() { this.playSample('ui_confirm',.77); }
    playUiDeny() { this.playSample('ui_deny',.76,1,0,.12); }
}
const sound = new SoundSystem();
