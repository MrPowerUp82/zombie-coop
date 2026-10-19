// ==========================================
// REDE & CO-OP P2P (BROADCASTCHANNEL & LOCALSTORAGE)
// Suporte a Multiplayer P2P, Abas Locais e IA da Sheva Alomar
// ==========================================

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'RE5';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function openRoomChannel(channelName) {
    if (net.bc) { try { net.bc.close(); } catch (e) {} }
    if (typeof BroadcastChannel !== 'undefined') {
        net.bc = new BroadcastChannel(channelName);
        net.bc.onmessage = (ev) => handleNetMessage(ev.data);
    }
}

window.addEventListener('storage', (ev) => {
    if (ev.key === 're5_p2p_packet' && ev.newValue) {
        try {
            const parsed = JSON.parse(ev.newValue);
            if (parsed && parsed.room === net.roomCode && parsed.sender !== net.myName) {
                handleNetMessage(parsed.payload);
            }
        } catch (e) {}
    }
});

async function initHostP2P() {
    sound.init();
    net.myName = (document.getElementById('player-nickname').value || 'Chris Redfield').trim();
    const code = generateRoomCode();
    net.roomCode = code;
    net.mode = 'HOST';
    net.transport = 'CHANNEL';
    net.botActive = false;
    openRoomChannel('re5_room_' + code);
    document.getElementById('host-code-box').classList.remove('hidden');
    document.getElementById('host-room-code').textContent = code;
    setP2PStatus(`Sala Kijuju [${code}] aberta!`, 'text-amber-400');
    sound.playPing();
    updateCoopHUD();
}

function joinRoomP2P() {
    sound.init();
    net.myName = (document.getElementById('player-nickname').value || 'Sheva Alomar').trim();
    const rawCode = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (!rawCode) { setP2PStatus('Digite o código da sala!', 'text-amber-400'); return; }
    net.roomCode = rawCode;
    net.mode = 'CLIENT';
    net.transport = 'CHANNEL';
    net.botActive = false;
    openRoomChannel('re5_room_' + rawCode);
    setP2PStatus(`Entrando na sala [${rawCode}]...`, 'text-sky-400');
    sendNetMessage({ type: 'ROOM_JOIN_REQUEST', name: net.myName, room: rawCode });
    updateCoopHUD();
}

function initLocalTabSync() {
    sound.init();
    net.myName = (document.getElementById('player-nickname').value || 'Chris Redfield').trim();
    net.roomCode = 'KIJUJU';
    net.transport = 'CHANNEL';
    net.mode = 'HOST';
    net.botActive = false;
    openRoomChannel('re5_coop_channel');
    setP2PStatus('Canal Co-op Kijuju Ativo!', 'text-amber-400');
    sendNetMessage({ type: 'TAB_DISCOVER', name: net.myName, timestamp: Date.now() });
    updateCoopHUD();
}

function toggleCoopBot() {
    sound.init();
    net.myName = (document.getElementById('player-nickname').value || 'Chris Redfield').trim();
    net.botActive = !net.botActive;
    const btnBot = document.getElementById('btn-coop-bot');
    if (net.botActive) {
        net.mode = 'HOST'; net.transport = 'BOT'; net.roomCode = 'SQUAD-AI'; net.connected = true; net.ally.active = true;
        net.ally.name = 'Sheva Alomar (B.S.A.A.)'; net.ally.hp = 120; net.ally.maxHp = 120; net.ally.isDowned = false;
        net.ally.x = 3.0; net.ally.z = 2.0;
        if (net.ally.meshGroup) net.ally.meshGroup.visible = true;
        if (btnBot) btnBot.textContent = '👩‍✈️ Desativar Sheva (IA)';
        sound.playPing();
        setP2PStatus('Sheva Alomar (Parceira IA) em campo!', 'text-emerald-400');
    } else {
        net.connected = false; net.ally.active = false; net.roomCode = '';
        if (net.ally.meshGroup) net.ally.meshGroup.visible = false;
        if (btnBot) btnBot.textContent = '👩‍✈️ Ativar Sheva (IA Co-op)';
        setP2PStatus('Parceiro IA desativado.', 'text-amber-200/70');
    }
    updateCoopHUD();
}

function sendNetMessage(payload) {
    if (net.bc) { try { net.bc.postMessage(payload); } catch (e) {} }
    try {
        localStorage.setItem('re5_p2p_packet', JSON.stringify({
            room: net.roomCode, sender: net.myName, ts: Date.now() + Math.random(), payload
        }));
    } catch (e) {}
}

function handleNetMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'TAB_DISCOVER' || msg.type === 'ROOM_JOIN_REQUEST') {
        net.botActive = false; net.mode = 'HOST'; net.connected = true; net.ally.active = true;
        net.ally.name = msg.name || 'Parceiro B.S.A.A.';
        if (net.ally.meshGroup) net.ally.meshGroup.visible = true;
        sendNetMessage({ type: 'TAB_WELCOME', name: net.myName });
        sound.playPing();
        setP2PStatus(`Parceiro (${net.ally.name}) conectado!`, 'text-emerald-400');
        updateCoopHUD();
    } else if (msg.type === 'TAB_WELCOME') {
        net.botActive = false; net.mode = 'CLIENT'; net.connected = true; net.ally.active = true;
        net.ally.name = msg.name || 'Host B.S.A.A.';
        if (net.ally.meshGroup) net.ally.meshGroup.visible = true;
        sound.playPing();
        setP2PStatus(`Conectado ao Host (${net.ally.name})!`, 'text-emerald-400');
        updateCoopHUD();
    } else if (msg.type === 'START_MATCH') {
        if (state.status !== 'PLAYING') startGame(true);
    } else if (msg.type === 'PLAYER_STATE') {
        net.ally.active = true; net.ally.name = msg.name || net.ally.name;
        net.ally.x = msg.x; net.ally.y = msg.y; net.ally.z = msg.z;
        net.ally.yaw = msg.yaw; net.ally.pitch = msg.pitch;
        net.ally.hp = msg.hp; net.ally.maxHp = msg.maxHp; net.ally.isDowned = msg.isDowned;
        updateCoopHUD();
    } else if (msg.type === 'SHOOT_FX') {
        if (net.ally.active) {
            sound.playShoot(msg.weaponId);
            createBulletTracer(new THREE.Vector3(msg.sx, msg.sy, msg.sz), new THREE.Vector3(msg.ex, msg.ey, msg.ez), 0xf59e0b);
        }
    } else if (msg.type === 'WORLD_SNAPSHOT' && net.mode === 'CLIENT') {
        if (state.wave !== msg.wave) {
            state.wave = msg.wave;
            dom.waveBannerText.textContent = `CAPÍTULO ${state.wave} (CO-OP)`;
            dom.waveBanner.classList.remove('hidden');
            setTimeout(() => dom.waveBanner.classList.add('hidden'), 2600);
        }
        state.zombiesToSpawn = msg.zombiesToSpawn;
        syncClientZombies(msg.zombies);
        updateHUD();
    } else if (msg.type === 'CLIENT_HIT_ZOMBIE' && net.mode === 'HOST') {
        const target = zombies.find(z => z.uid === msg.uid);
        if (target) damageZombie(target, msg.damage, new THREE.Vector3(msg.hx, msg.hy, msg.hz), msg.isHeadshot, true);
    } else if (msg.type === 'EXPLODE_BARREL') {
        const barrel = explosiveBarrels.find(b => b.id === msg.id);
        if (barrel && !barrel.exploded) triggerBarrelExplosion(barrel, true);
    } else if (msg.type === 'REVIVE_ALLY') {
        if (state.isDowned) {
            state.isDowned = false; state.health = Math.round(state.maxHealth * 0.6);
            sound.playPickup(); showCenterAlert('REANIMADO PELO PARCEIRO B.S.A.A.!', 2200); updateHUD();
        }
    } else if (msg.type === 'TACTICAL_PING') {
        sound.playPing(); showCenterAlert(`📡 ${net.ally.name}: ${msg.text}`, 2200);
    }
}

function setP2PStatus(text, colorClass) {
    const el = document.getElementById('p2p-status-text');
    if (el) { el.textContent = text; el.className = 'text-xs font-semibold mt-0.5 ' + colorClass; }
}

function updateCoopHUD() {
    const dot = document.getElementById('net-status-dot');
    const label = document.getElementById('net-mode-label');
    const codeBadge = document.getElementById('room-code-hud');
    const allyBox = document.getElementById('ally-health-container');
    const pingBtn = document.getElementById('btn-ping-ally');

    if (!net.connected) {
        dot.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
        label.textContent = net.mode === 'HOST' ? 'Aguardando Parceiro B.S.A.A....' : 'Modo Solo (Chris / Sheva)';
        if (net.roomCode) { codeBadge.textContent = net.roomCode; codeBadge.classList.remove('hidden'); }
        else { codeBadge.classList.add('hidden'); }
        allyBox.classList.add('hidden'); pingBtn.classList.add('hidden');
    } else {
        dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
        label.textContent = `Co-op B.S.A.A. (${net.mode})`;
        codeBadge.textContent = net.roomCode; codeBadge.classList.remove('hidden');
        allyBox.classList.remove('hidden'); allyBox.classList.add('flex'); pingBtn.classList.remove('hidden');
        document.getElementById('ally-name-hud').textContent = net.ally.name + ':';
        const pct = Math.max(0, Math.min(100, (net.ally.hp / (net.ally.maxHp || 120)) * 100));
        document.getElementById('ally-health-bar').style.width = `${pct}%`;
        const stText = document.getElementById('ally-status-text');
        if (net.ally.isDowned) { stText.textContent = 'FERIDO!'; stText.className = 'text-[10px] text-red-400 font-black animate-pulse'; }
        else { stText.textContent = `${Math.ceil(net.ally.hp)} HP`; stText.className = 'text-[10px] text-emerald-400 font-bold'; }
    }
}

function syncClientZombies(hostZombiesList) {
    const seenUids = new Set();
    hostZombiesList.forEach(hz => {
        seenUids.add(hz.uid);
        let localZ = zombies.find(z => z.uid === hz.uid);
        if (!localZ) {
            localZ = spawnZombie(hz);
        } else {
            localZ.mesh.position.x = THREE.MathUtils.lerp(localZ.mesh.position.x, hz.x, 0.45);
            localZ.mesh.position.z = THREE.MathUtils.lerp(localZ.mesh.position.z, hz.z, 0.45);
            localZ.mesh.rotation.y = hz.ry;
            localZ.hp = hz.hp;
        }
    });

    for (let i = zombies.length - 1; i >= 0; i--) {
        if (!seenUids.has(zombies[i].uid)) { scene.remove(zombies[i].mesh); zombies.splice(i, 1); }
    }
    state.zombiesAlive = zombies.length;
}

function updateCoopBotAI(dt) {
    if (!net.botActive || !net.ally.active) return;
    if (net.ally.isDowned) {
        if (state.isDowned) triggerGameOver();
        return;
    }
    if (state.isDowned) {
        const dx = camera.position.x - net.ally.x, dz = camera.position.z - net.ally.z;
        const dist = Math.hypot(dx, dz);
        net.ally.yaw = Math.atan2(-dx, -dz);
        if (dist > 2.1) {
            const stepped = steerEntityMove(net.ally.x, net.ally.z, dx / dist, dz / dist, 7.5 * dt, 0.6);
            net.ally.x = stepped.x; net.ally.z = stepped.z;
        } else {
            state.isDowned = false; state.health = Math.round(state.maxHealth * 0.65);
            sound.playPickup(); showCenterAlert(`🤝 ${net.ally.name} REANIMOU VOCÊ!`, 2200); updateHUD();
        }
        return;
    }

    const followDx = (camera.position.x + Math.sin(state.yaw + 1.1) * 3.8) - net.ally.x;
    const followDz = (camera.position.z + Math.cos(state.yaw + 1.1) * 3.8) - net.ally.z;
    const followDist = Math.hypot(followDx, followDz);
    if (followDist > 2.2) {
        const stepped = steerEntityMove(net.ally.x, net.ally.z, followDx / followDist, followDz / followDist, 6.8 * dt, 0.6);
        net.ally.x = stepped.x; net.ally.z = stepped.z;
    }

    let nearestZ = null, minDist = 36;
    for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        const d = Math.hypot(z.mesh.position.x - net.ally.x, z.mesh.position.z - net.ally.z);
        if (d < minDist) { minDist = d; nearestZ = z; }
    }

    if (nearestZ) {
        const zdx = nearestZ.mesh.position.x - net.ally.x, zdz = nearestZ.mesh.position.z - net.ally.z;
        net.ally.yaw = Math.atan2(-zdx, -zdz);
        if (minDist < 1.5) {
            net.ally.hp = Math.max(0, net.ally.hp - 12 * dt);
            if (net.ally.hp <= 0) {
                net.ally.isDowned = true;
                showCenterAlert(`🆘 ${net.ally.name} FERIDA!`, 2800);
                if (state.isDowned) triggerGameOver();
            }
            updateCoopHUD();
        }
        net.ally.botFireCooldown -= dt;
        if (net.ally.botFireCooldown <= 0) {
            net.ally.botFireCooldown = 0.34 + Math.random() * 0.18;
            sound.playShoot('RIFLE');
            const startVec = new THREE.Vector3(net.ally.x, 1.38, net.ally.z);
            const hitVec = nearestZ.mesh.position.clone().add(new THREE.Vector3(0, 1.35, 0));
            createBulletTracer(startVec, hitVec, 0xf59e0b);
            if (net.ally.muzzleFlash) {
                net.ally.muzzleFlash.visible = true;
                setTimeout(() => { if (net.ally.muzzleFlash) net.ally.muzzleFlash.visible = false; }, 50);
            }
            damageZombie(nearestZ, 22, hitVec, false, true);
        }
    } else if (net.ally.hp < net.ally.maxHp) {
        net.ally.hp = Math.min(net.ally.maxHp, net.ally.hp + 4 * dt); updateCoopHUD();
    }
}

function updateNetworkSync(elapsedTime, dt = 0.016) {
    if (state.status === 'SHOP') {
        if (state.dashCooldown > 0) state.dashCooldown = Math.max(0, state.dashCooldown - dt);
        if (state.invulnTimer > 0) state.invulnTimer = Math.max(0, state.invulnTimer - dt);
        if (state.meleeCooldown > 0) state.meleeCooldown = Math.max(0, state.meleeCooldown - dt);
    }
    if (net.botActive && state.status === 'PLAYING') updateCoopBotAI(dt);
    if (net.connected && net.ally.active && net.ally.meshGroup) {
        net.ally.meshGroup.visible = true;
        net.ally.meshGroup.position.x = THREE.MathUtils.lerp(net.ally.meshGroup.position.x, net.ally.x, 0.35);
        net.ally.meshGroup.position.z = THREE.MathUtils.lerp(net.ally.meshGroup.position.z, net.ally.z, 0.35);
        net.ally.meshGroup.position.y = net.ally.isDowned ? -0.7 : 0;
        net.ally.meshGroup.rotation.y = net.ally.yaw;

        const tagPos = net.ally.meshGroup.position.clone().add(new THREE.Vector3(0, 2.35, 0));
        tagPos.project(camera);
        if (tagPos.z < 1) {
            const tx = (tagPos.x * 0.5 + 0.5) * window.innerWidth;
            const ty = (-(tagPos.y * 0.5) + 0.5) * window.innerHeight;
            dom.ally3dTag.style.left = `${tx}px`; dom.ally3dTag.style.top = `${ty}px`;
            dom.allyTagName.textContent = net.ally.isDowned ? `🆘 ${net.ally.name} (FERIDA)` : `🛡️ ${net.ally.name}`;
            dom.ally3dTag.classList.remove('hidden');
        } else { dom.ally3dTag.classList.add('hidden'); }
    } else { dom.ally3dTag.classList.add('hidden'); }

    if (net.connected && elapsedTime - net.lastSyncSent > 0.05) {
        net.lastSyncSent = elapsedTime;
        sendNetMessage({
            type: 'PLAYER_STATE', name: net.myName, x: camera.position.x, y: camera.position.y, z: camera.position.z,
            yaw: state.yaw, pitch: state.pitch, hp: state.health, maxHp: state.maxHealth, isDowned: state.isDowned
        });
        if (net.mode === 'HOST') {
            const zData = zombies.map(z => ({
                uid: z.uid, type: z.type, x: Number(z.mesh.position.x.toFixed(2)), z: Number(z.mesh.position.z.toFixed(2)), ry: Number(z.mesh.rotation.y.toFixed(2)), hp: z.hp
            }));
            sendNetMessage({ type: 'WORLD_SNAPSHOT', wave: state.wave, zombiesToSpawn: state.zombiesToSpawn, zombies: zData });
        }
    }
}
