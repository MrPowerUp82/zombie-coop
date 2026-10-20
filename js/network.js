// ==========================================
// REDE COOPERATIVA (WEBRTC / WEBSOCKET / ABAS LOCAIS)
// Multiplayer online real com salas para 2 jogadores e IA da Sheva Alomar
// ==========================================

// Salas online: WebRTC (PeerJS / sinalização pública). O WebSocket próprio é
// usado quando o jogo é servido pelo server.js ou há uma URL configurada.
const COOP_PEER_PREFIX = 'zombie-coop-v3-';
const COOP_JOIN_TIMEOUT = 14000;

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(5);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return 'RE5' + Array.from(bytes, n => chars[n % chars.length]).join('');
}

function clearNetworkTimeout() {
    if (net.joinTimeout) clearTimeout(net.joinTimeout);
    net.joinTimeout = null;
}

function resetNetworkSession() {
    net.generation = (net.generation || 0) + 1;
    clearNetworkTimeout();
    if (net.localElectionTimer) clearTimeout(net.localElectionTimer);
    net.localElectionTimer = null;
    if (net.bc) { try { net.bc.close(); } catch (e) {} }
    if (net.conn) { try { net.conn.close(); } catch (e) {} }
    if (net.peer) { try { net.peer.destroy(); } catch (e) {} }
    if (net.ws) { try { net.ws.close(); } catch (e) {} }
    net.bc = null; net.peer = null; net.conn = null; net.ws = null;
    net.wsReady = false; net.connected = false; net.botActive = false;
    net.ally.active = false; net.roomCode = ''; net.mode = 'SOLO'; net.transport = null;
    net.lastSyncSent = 0; net.matchId = 0;
    if (net.ally.meshGroup) net.ally.meshGroup.visible = false;
    const codeBox = document.getElementById('host-code-box');
    if (codeBox) codeBox.classList.add('hidden');
    const botBtn = document.getElementById('btn-coop-bot');
    if (botBtn) botBtn.textContent = '👩‍✈️ Ativar Sheva (IA Co-op)';
    updateCoopHUD();
    return net.generation;
}

function networkFailure(message, generation = net.generation) {
    if (generation !== net.generation) return;
    clearNetworkTimeout();
    // Preserva a sala HOST que já está aberta se somente um candidato falhar.
    if (net.connected || (net.mode === 'HOST' && net.transport === 'PEER' && net.peer && net.peer.open)) return;
    setP2PStatus('❌ ' + message, 'text-red-400');
    updateCoopHUD();
}

function beginJoinTimeout(generation) {
    clearNetworkTimeout();
    net.joinTimeout = setTimeout(() => {
        if (net.generation === generation && !net.connected) {
            setP2PStatus('❌ Tempo esgotado. Confira o código, internet e firewall.', 'text-red-400');
            if (net.conn) { try { net.conn.close(); } catch (e) {} }
        }
    }, COOP_JOIN_TIMEOUT);
}

function showHostReady(code) {
    document.getElementById('host-code-box').classList.remove('hidden');
    document.getElementById('host-room-code').textContent = code;
    setP2PStatus(`✅ Sala ${code} pronta. Compartilhe o código e aguarde.`, 'text-emerald-400');
    sound.playPing();
    updateCoopHUD();
}

function markNetworkDisconnected(reason) {
    net.connected = false;
    net.ally.active = false;
    if (net.ally.meshGroup) net.ally.meshGroup.visible = false;
    setP2PStatus('⚠️ ' + reason, 'text-amber-400');
    updateCoopHUD();
}

function onRemotePeerOpen(conn, generation) {
    conn.on('data', (msg) => {
        if (net.generation === generation && net.conn === conn) handleNetMessage(msg);
    });
    conn.on('close', () => {
        if (net.generation !== generation || net.conn !== conn) return;
        net.conn = null;
        markNetworkDisconnected(net.mode === 'HOST' ? 'Parceiro saiu. Sala continua aberta.' : 'Conexão com o host encerrada.');
    });
    conn.on('error', () => {
        if (net.generation !== generation) return;
        if (net.connected) markNetworkDisconnected('Falha de conexão WebRTC.');
        else networkFailure('Falha de conexão WebRTC.', generation);
    });
    conn.on('open', () => {
        if (net.generation !== generation || net.conn !== conn) return;
        if (net.mode === 'CLIENT') {
            setP2PStatus('Conexão estabelecida. Confirmando entrada...', 'text-sky-400');
            sendNetMessage({ type: 'ROOM_JOIN_REQUEST', name: net.myName, room: net.roomCode });
        }
    });
}

function startPeerRoom(role, code, generation) {
    if (typeof Peer !== 'function') {
        networkFailure('A biblioteca PeerJS não carregou. Verifique a internet ou use o servidor local.', generation);
        return;
    }
    let peer;
    try { peer = role === 'HOST' ? new Peer(COOP_PEER_PREFIX + code.toLowerCase()) : new Peer(); }
    catch (error) { networkFailure('Não foi possível inicializar WebRTC. Use o servidor local.', generation); return; }
    net.peer = peer;
    peer.on('open', () => {
        if (net.generation !== generation) return;
        if (role === 'HOST') {
            showHostReady(code);
        } else {
            setP2PStatus('Procurando a sala e negociando conexão WebRTC...', 'text-sky-400');
            const conn = peer.connect(COOP_PEER_PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
            net.conn = conn;
            onRemotePeerOpen(conn, generation);
            beginJoinTimeout(generation);
        }
    });
    peer.on('connection', (conn) => {
        if (net.generation !== generation || net.mode !== 'HOST') { conn.close(); return; }
        if (net.conn && net.conn.open) {
            conn.on('open', () => { conn.send({ type: 'ROOM_FULL' }); conn.close(); });
            return;
        }
        net.conn = conn;
        onRemotePeerOpen(conn, generation);
    });
    peer.on('error', (err) => {
        if (net.generation !== generation) return;
        const code = err && err.type;
        const message = code === 'unavailable-id' ? 'Esse código já está em uso. Crie outra sala.'
            : code === 'peer-unavailable' ? 'Sala não encontrada. Confira o código do host.'
            : code === 'network' || code === 'server-error' || code === 'socket-error' ? 'Servidor de conexão indisponível. Tente o servidor local.'
            : 'Erro na conexão online' + (code ? ` (${code})` : '.');
        if (net.connected) markNetworkDisconnected(message);
        else networkFailure(message, generation);
    });
    peer.on('disconnected', () => {
        if (net.generation !== generation) return;
        if (!net.connected) networkFailure('Sem conexão com o servidor de sinalização.', generation);
        // Canal WebRTC pode permanecer ativo mesmo se o serviço de sinalização cair.
    });
    if (role === 'CLIENT') beginJoinTimeout(generation);
}

function getCoopServerURL() {
    const input = document.getElementById('coop-server-url');
    const custom = input && input.value.trim();
    if (custom) {
        try {
            const url = new URL(custom);
            if ((url.protocol === 'ws:' || url.protocol === 'wss:') && url.hostname) {
                return url.origin + '/ws';
            }
        } catch (e) {}
        return null;
    }
    // Nosso servidor integrado anuncia a disponibilidade na própria página.
    if (typeof window !== 'undefined' && window.COOP_LOCAL_SERVER === true && typeof location !== 'undefined') {
        return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    }
    return '';
}

function startSocketRoom(role, code, generation, url) {
    if (typeof WebSocket === 'undefined') {
        networkFailure('WebSocket indisponível neste navegador.', generation);
        return;
    }
    try {
        const ws = new WebSocket(url);
        net.ws = ws;
        ws.addEventListener('open', () => {
            if (net.generation !== generation) return;
            ws.send(JSON.stringify({ op: role === 'HOST' ? 'create' : 'join', code }));
        });
        ws.addEventListener('message', (event) => {
            if (net.generation !== generation || net.ws !== ws) return;
            let packet;
            try { packet = JSON.parse(event.data); } catch (e) { return; }
            if (packet.op === 'created') { net.wsReady = true; showHostReady(code); }
            else if (packet.op === 'joined') {
                net.wsReady = true;
                setP2PStatus('Conectado ao servidor. Confirmando parceiro...', 'text-sky-400');
                sendNetMessage({ type: 'ROOM_JOIN_REQUEST', name: net.myName, room: code });
            } else if (packet.op === 'peer_joined') {
                setP2PStatus('Parceiro encontrado. Conectando...', 'text-sky-400');
            } else if (packet.op === 'peer_left') {
                markNetworkDisconnected('Parceiro desconectou.');
            } else if (packet.op === 'packet') handleNetMessage(packet.data);
            else if (packet.op === 'error') networkFailure(packet.message || 'Erro no servidor.', generation);
        });
        ws.addEventListener('close', () => {
            if (net.generation === generation && net.ws === ws) markNetworkDisconnected('Servidor desconectado.');
        });
        ws.addEventListener('error', () => {
            if (net.generation === generation) networkFailure('Não foi possível acessar o servidor. Verifique a URL e porta.', generation);
        });
        if (role === 'CLIENT') beginJoinTimeout(generation);
    } catch (e) {
        networkFailure('URL do servidor inválida ou conexão bloqueada.', generation);
    }
}

function initHostP2P() {
    sound.init();
    const serverInput = document.getElementById('coop-server-url');
    const serverURL = getCoopServerURL();
    if (serverInput && serverInput.value.trim() && !serverURL) {
        setP2PStatus('❌ Use uma URL ws:// ou wss:// válida.', 'text-red-400'); return;
    }
    const generation = resetNetworkSession();
    net.myName = (document.getElementById('player-nickname').value || 'Chris Redfield').trim();
    const code = generateRoomCode();
    net.roomCode = code; net.mode = 'HOST';
    net.transport = serverURL ? 'SOCKET' : 'PEER';
    setP2PStatus('Criando sala online...', 'text-sky-400'); updateCoopHUD();
    if (serverURL) startSocketRoom('HOST', code, generation, serverURL);
    else startPeerRoom('HOST', code, generation);
}

function joinRoomP2P() {
    sound.init();
    const rawCode = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (!/^RE5[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(rawCode)) {
        setP2PStatus('❌ Código inválido. Use o código RE5 + 5 caracteres do host.', 'text-red-400'); return;
    }
    const serverInput = document.getElementById('coop-server-url');
    const serverURL = getCoopServerURL();
    if (serverInput && serverInput.value.trim() && !serverURL) {
        setP2PStatus('❌ Use uma URL ws:// ou wss:// válida.', 'text-red-400'); return;
    }
    const generation = resetNetworkSession();
    net.myName = (document.getElementById('player-nickname').value || 'Sheva Alomar').trim();
    net.roomCode = rawCode; net.mode = 'CLIENT'; net.transport = serverURL ? 'SOCKET' : 'PEER';
    setP2PStatus(`Procurando sala ${rawCode}...`, 'text-sky-400'); updateCoopHUD();
    if (serverURL) startSocketRoom('CLIENT', rawCode, generation, serverURL);
    else startPeerRoom('CLIENT', rawCode, generation);
}

function openRoomChannel(channelName) {
    if (net.bc) { try { net.bc.close(); } catch (e) {} }
    if (typeof BroadcastChannel !== 'undefined') {
        net.bc = new BroadcastChannel(channelName);
        net.bc.onmessage = (ev) => {
            const packet = ev.data;
            if (packet && packet.sender !== net.instanceId && packet.room === net.roomCode) handleNetMessage(packet.payload);
        };
    }
}

window.addEventListener('storage', (ev) => {
    if (net.transport !== 'CHANNEL' || net.bc || ev.key !== 're5_p2p_packet' || !ev.newValue) return;
    try {
        const parsed = JSON.parse(ev.newValue);
        if (parsed.room === net.roomCode && parsed.sender !== net.instanceId) handleNetMessage(parsed.payload);
    } catch (e) {}
});

// Compatibilidade opcional para duas abas *da mesma origem*.
function initLocalTabSync() {
    sound.init();
    const generation = resetNetworkSession();
    net.myName = (document.getElementById('player-nickname').value || 'Chris Redfield').trim();
    net.roomCode = 'KIJUJU'; net.transport = 'CHANNEL'; net.mode = 'CLIENT';
    openRoomChannel('re5_coop_channel');
    setP2PStatus('Buscando outra aba deste mesmo site...', 'text-sky-400');
    sendNetMessage({ type: 'TAB_DISCOVER', name: net.myName, sessionId: net.instanceId });
    net.localElectionTimer = setTimeout(() => {
        if (net.generation === generation && !net.connected && net.mode !== 'HOST') {
            net.mode = 'HOST';
            setP2PStatus('Aba anfitriã pronta. Clique em Sincronizar na segunda aba.', 'text-amber-400');
            updateCoopHUD();
        }
    }, 850);
    updateCoopHUD();
}

function toggleCoopBot() {
    sound.init();
    net.myName = (document.getElementById('player-nickname').value || 'Chris Redfield').trim();
    const activatingBot = !net.botActive;
    if (activatingBot) resetNetworkSession();
    net.botActive = activatingBot;
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
    if (!payload || !payload.type) return;
    if (net.transport === 'PEER') {
        if (net.conn && net.conn.open) {
            try { net.conn.send(payload); } catch (e) {}
        }
    } else if (net.transport === 'SOCKET') {
        if (net.ws && net.ws.readyState === 1 && net.wsReady) {
            try { net.ws.send(JSON.stringify({ op: 'packet', data: payload })); } catch (e) {}
        }
    } else if (net.transport === 'CHANNEL') {
        const packet = { room: net.roomCode, sender: net.instanceId, payload };
        if (net.bc) { try { net.bc.postMessage(packet); } catch (e) {} }
        else { try { localStorage.setItem('re5_p2p_packet', JSON.stringify(packet)); } catch (e) {} }
    }
}

function handleNetMessage(msg) {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'ROOM_FULL') {
        networkFailure('Essa sala já possui dois jogadores.', net.generation);
        if (net.conn) net.conn.close();
        return;
    }
    if (msg.type === 'TAB_DISCOVER' && net.transport === 'CHANNEL') {
        if (!msg.sessionId || msg.sessionId === net.instanceId) return;
        if (net.mode === 'HOST' || (net.mode === 'CLIENT' && net.instanceId < msg.sessionId)) {
            net.mode = 'HOST';
            sendNetMessage({ type: 'TAB_WELCOME', name: net.myName, target: msg.sessionId });
            net.connected = true; net.ally.active = true; net.ally.name = msg.name || 'Parceiro B.S.A.A.';
            if (net.ally.meshGroup) net.ally.meshGroup.visible = true;
            updateCoopHUD();
            if (state.status === 'PLAYING' || state.status === 'SHOP') sendNetMessage({ type: 'START_MATCH', matchId: net.matchId });
        } else {
            sendNetMessage({ type: 'ROOM_JOIN_REQUEST', name: net.myName, room: net.roomCode, target: net.instanceId });
        }
        return;
    }
    if (msg.type === 'ROOM_JOIN_REQUEST' && net.mode === 'HOST') {
        if (msg.room && msg.room !== net.roomCode) return;
        if (net.connected && msg.name !== net.ally.name) {
            sendNetMessage({ type: 'ROOM_FULL' }); return;
        }
        net.botActive = false; net.connected = true; net.ally.active = true;
        net.ally.name = msg.name || 'Parceiro B.S.A.A.';
        if (net.ally.meshGroup) net.ally.meshGroup.visible = true;
        sendNetMessage({ type: 'TAB_WELCOME', name: net.myName, target: msg.target || null });
        if (state.status === 'PLAYING' || state.status === 'SHOP') sendNetMessage({ type: 'START_MATCH', matchId: net.matchId });
        sound.playPing();
        setP2PStatus(`✅ ${net.ally.name} entrou na sala!`, 'text-emerald-400');
        updateCoopHUD();
    } else if (msg.type === 'TAB_WELCOME' && net.mode === 'CLIENT') {
        if (msg.target && msg.target !== net.instanceId) return;
        net.botActive = false; net.connected = true; net.ally.active = true;
        net.ally.name = msg.name || 'Host B.S.A.A.';
        if (net.ally.meshGroup) net.ally.meshGroup.visible = true;
        clearNetworkTimeout();
        sound.playPing();
        setP2PStatus(`✅ Conectado ao host (${net.ally.name})!`, 'text-emerald-400');
        updateCoopHUD();
    } else if (msg.type === 'START_MATCH') {
        // O host é dono da partida: cada nova rodada tem um identificador.
        if (net.connected && net.mode === 'CLIENT' && net.matchId !== msg.matchId) {
            net.matchId = msg.matchId;
            if (state.status === 'PAUSED') state.status = 'MENU';
            startGame(true);
        }
    } else if (msg.type === 'MATCH_END' && net.connected && net.mode === 'CLIENT') {
        if (state.status !== 'GAMEOVER') triggerGameOver(true);
    } else if (msg.type === 'PLAYER_STATE' && net.connected) {
        net.ally.active = true; net.ally.name = msg.name || net.ally.name;
        net.ally.x = msg.x; net.ally.y = msg.y; net.ally.z = msg.z;
        net.ally.yaw = msg.yaw; net.ally.pitch = msg.pitch;
        net.ally.hp = msg.hp; net.ally.maxHp = msg.maxHp; net.ally.isDowned = msg.isDowned;
        if (['PISTOL','RIFLE','SHOTGUN','RAILGUN'].includes(msg.weaponId)) net.ally.weaponId = msg.weaponId;
        updateCoopHUD();
    } else if (msg.type === 'SHOOT_FX' && net.connected) {
        if (net.ally.active) {
            sound.playShoot(msg.weaponId, .4);
            net.ally.weaponId = ['PISTOL','RIFLE','SHOTGUN','RAILGUN'].includes(msg.weaponId) ? msg.weaponId : 'RIFLE';
            const rig = net.ally.meshGroup && net.ally.meshGroup.userData.rig;
            if (rig) rig.shotTime = .18;
            if ([msg.sx,msg.sy,msg.sz,msg.ex,msg.ey,msg.ez].every(Number.isFinite)) {
                createBulletTracer(new THREE.Vector3(msg.sx, msg.sy, msg.sz),
                    new THREE.Vector3(msg.ex, msg.ey, msg.ez), shotStyle(msg.weaponId).color, msg.weaponId);
                activateAllyMuzzle(msg.weaponId);
            }
        }
    } else if (msg.type === 'RELOAD_FX' && net.connected && net.ally.active) {
        if (!['PISTOL','RIFLE','SHOTGUN','RAILGUN'].includes(msg.weaponId)) return;
        net.ally.weaponId = msg.weaponId;
        const rig = net.ally.meshGroup && net.ally.meshGroup.userData.rig;
        if (rig) {
            rig.reloadDuration = Number.isFinite(msg.duration) ? Math.max(.3,Math.min(4,msg.duration)) : 1.5;
            rig.reloadRemaining = rig.reloadDuration;
        }
        sound.playReloadStage(msg.weaponId,'mag');
    } else if (msg.type === 'WORLD_SNAPSHOT' && net.mode === 'CLIENT' && net.connected && Array.isArray(msg.zombies)) {
        if (state.wave !== msg.wave) {
            state.wave = msg.wave;
            dom.waveBannerText.textContent = `CAPÍTULO ${state.wave} (CO-OP)`;
            dom.waveBanner.classList.remove('hidden');
            setTimeout(() => dom.waveBanner.classList.add('hidden'), 2600);
        }
        state.zombiesToSpawn = msg.zombiesToSpawn;
        syncClientZombies(msg.zombies);
        updateHUD();
    } else if (msg.type === 'CLIENT_HIT_ZOMBIE' && net.mode === 'HOST' && net.connected) {
        const target = zombies.find(z => z.uid === msg.uid);
        if (target && Number.isFinite(msg.damage) && msg.damage > 0) damageZombie(target, msg.damage, new THREE.Vector3(msg.hx, msg.hy, msg.hz), msg.isHeadshot, true);
    } else if (msg.type === 'REMOTE_DAMAGE' && net.mode === 'CLIENT' && net.connected && state.status === 'PLAYING') {
        if (Number.isFinite(msg.amount) && msg.amount > 0 && msg.amount <= 200) takePlayerDamage(msg.amount);
    } else if (msg.type === 'EXPLODE_BARREL' && net.connected) {
        const barrel = explosiveBarrels.find(b => b.id === msg.id);
        if (barrel && !barrel.exploded) triggerBarrelExplosion(barrel, true);
    } else if (msg.type === 'REVIVE_ALLY' && net.connected) {
        if (state.isDowned) {
            state.isDowned = false; state.health = Math.round(state.maxHealth * 0.6);
            sound.playPickup(); showCenterAlert('REANIMADO PELO PARCEIRO B.S.A.A.!', 2200); updateHUD();
        }
    } else if (msg.type === 'TACTICAL_PING' && net.connected) {
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
        label.textContent = net.mode === 'HOST' ? 'Aguardando Parceiro B.S.A.A....' : net.mode === 'CLIENT' ? 'Conectando ao host...' : 'Modo Solo (Chris / Sheva)';
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
            createBulletTracer(startVec, hitVec, shotStyle('RIFLE').color, 'RIFLE');
            activateAllyMuzzle('RIFLE');
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
            yaw: state.yaw, pitch: state.pitch, hp: state.health, maxHp: state.maxHealth,
            isDowned: state.isDowned, weaponId: WEAPONS[state.currentWeaponIdx].id
        });
        if (net.mode === 'HOST') {
            const zData = zombies.map(z => ({
                uid: z.uid, type: z.type, x: Number(z.mesh.position.x.toFixed(2)), z: Number(z.mesh.position.z.toFixed(2)), ry: Number(z.mesh.rotation.y.toFixed(2)), hp: z.hp
            }));
            sendNetMessage({ type: 'WORLD_SNAPSHOT', wave: state.wave, zombiesToSpawn: state.zombiesToSpawn, zombies: zData });
        }
    }
}
