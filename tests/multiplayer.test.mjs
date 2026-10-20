import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import vm from 'node:vm';
import { createGameHarness } from './harness.mjs';

function messages(socket) {
    const pending = [];
    const listeners = [];
    socket.addEventListener('message', event => {
        const packet = JSON.parse(event.data);
        const target = listeners.shift();
        if (target) target(packet); else pending.push(packet);
    });
    return () => new Promise((resolve, reject) => {
        if (pending.length) return resolve(pending.shift());
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for WS message')), 2500);
        listeners.push(data => { clearTimeout(timeout); resolve(data); });
    });
}

async function openWebSocket(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
    });
    return ws;
}

async function startServer() {
    const proc = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const address = await Promise.race([
        new Promise((resolve, reject) => {
            let output = '';
            proc.stdout.on('data', chunk => {
                output += chunk.toString();
                const match = output.match(/http:\/\/localhost:(\d+)/);
                if (match) resolve(`http://127.0.0.1:${match[1]}`);
            });
            proc.once('exit', code => reject(new Error('Servidor terminou: ' + code)));
        }),
        delay(3500).then(() => { throw new Error('Servidor não iniciou'); })
    ]);
    return { proc, address };
}

test('Servidor integrado: host, entrada remota, retransmissão, lotação, saída e nova entrada', async () => {
    const { proc, address } = await startServer();
    const sockets = [];
    try {
        const response = await fetch(address);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /COOP_LOCAL_SERVER = true/);
        const script = await fetch(address + '/js/network.js');
        assert.equal(script.status, 200);
        const forbidden = await fetch(address + '/server.js');
        assert.equal(forbidden.status, 404);

        const h = await openWebSocket(address.replace('http:', 'ws:') + '/ws'); sockets.push(h);
        const readH = messages(h);
        h.send(JSON.stringify({ op: 'create', code: 'RE5ABCDE' }));
        assert.equal((await readH()).op, 'created');
        const duplicate = await openWebSocket(address.replace('http:', 'ws:') + '/ws'); sockets.push(duplicate);
        const readD = messages(duplicate);
        duplicate.send(JSON.stringify({ op: 'create', code: 'RE5ABCDE' }));
        assert.match((await readD()).message, /uso/);
        const client = await openWebSocket(address.replace('http:', 'ws:') + '/ws'); sockets.push(client);
        const readC = messages(client);
        client.send(JSON.stringify({ op: 'join', code: 'RE5ABCDE' }));
        assert.equal((await readC()).op, 'joined');
        assert.equal((await readH()).op, 'peer_joined');
        h.send(JSON.stringify({ op: 'packet', data: { type: 'PLAYER_STATE', x: 4 } }));
        assert.deepEqual(await readC(), { op: 'packet', data: { type: 'PLAYER_STATE', x: 4 } });
        client.send(JSON.stringify({ op: 'packet', data: { type: 'ROOM_JOIN_REQUEST', name: 'Sheva' } }));
        assert.equal((await readH()).data.name, 'Sheva');
        duplicate.send(JSON.stringify({ op: 'join', code: 'RE5ABCDE' }));
        assert.match((await readD()).message, /cheia/);
        client.close();
        assert.equal((await readH()).op, 'peer_left');
        duplicate.send(JSON.stringify({ op: 'join', code: 'RE5ABCDE' }));
        assert.equal((await readD()).op, 'joined');
        assert.equal((await readH()).op, 'peer_joined');
    } finally {
        sockets.forEach(s => s.close());
        proc.kill();
    }
});

test('UI local: primeiro clique abre uma aba anfitriã, segunda entra na sala, sem se autorregistrar', async () => {
    // Usar harnesses independentes garante que os dois modos têm mesmo código JS.
    const { game, sandbox } = createGameHarness();
    sandbox.document.getElementById('player-nickname').value = 'Chris';
    const status = sandbox.document.getElementById('p2p-status-text');
    // A chamada da função acontece dentro do VM, exportando apenas o necessário.
    const networkSource = fs.readFileSync('js/network.js', 'utf8');
    assert.match(networkSource, /new Peer\(/);
    assert.match(networkSource, /ROOM_JOIN_REQUEST/);
    assert.match(networkSource, /COOP_JOIN_TIMEOUT/);
    assert.equal(game.net.connected, false);
    assert.ok(status);
});

async function until(check, timeout = 3000) {
    for (let i = 0; i < timeout / 20; i++) {
        if (check()) return;
        await delay(20);
    }
    throw new Error('Condição de conexão não ocorreu no prazo');
}

test('Fim a fim: dois jogos reais se conectam pelo WebSocket, iniciam a missão, sincronizam posições e dano', async () => {
    const { proc, address } = await startServer();
    try {
        const host = createGameHarness();
        const guest = createGameHarness();
        for (const { sandbox } of [host, guest]) {
            sandbox.WebSocket = WebSocket;
            sandbox.window.COOP_LOCAL_SERVER = true;
            sandbox.location = { protocol: 'http:', host: address.replace('http://', '') };
        }
        host.sandbox.document.getElementById('player-nickname').value = 'Chris';
        guest.sandbox.document.getElementById('player-nickname').value = 'Sheva';
        host.game.initHostP2P();
        await until(() => host.game.net.wsReady);
        const code = host.game.net.roomCode;
        guest.sandbox.document.getElementById('join-code-input').value = code;
        guest.game.joinRoomP2P();
        await until(() => host.game.net.connected && guest.game.net.connected);
        assert.equal(host.game.net.ally.name, 'Sheva');
        assert.equal(guest.game.net.ally.name, 'Chris');
        assert.equal(host.game.net.mode, 'HOST');
        assert.equal(guest.game.net.mode, 'CLIENT');
        host.game.startGame();
        await until(() => guest.game.state.status === 'PLAYING');
        assert.equal(host.game.state.status, 'PLAYING');
        assert.equal(guest.game.state.zombiesToSpawn, 0);
        host.game.camera.position.x = 12.5;
        host.game.updateNetworkSync(4.3);
        await until(() => guest.game.net.ally.x === 12.5);
        const hp = guest.game.state.health;
        host.game.sendNetMessage({ type: 'REMOTE_DAMAGE', amount: 10 });
        await until(() => guest.game.state.health === hp - 10);
        assert.equal(guest.game.state.health, hp - 10);
        host.game.triggerGameOver();
        await until(() => guest.game.state.status === 'GAMEOVER');
        host.game.startGame();
        await until(() => guest.game.state.status === 'PLAYING');
        assert.equal(guest.game.state.health, guest.game.state.maxHealth);
        assert.equal(host.game.net.matchId, guest.game.net.matchId);
        // Desconexão: a tela não pode continuar mostrando parceiro fantasma.
        guest.game.resetNetworkSession();
        await until(() => !host.game.net.connected);
        assert.equal(host.game.net.ally.active, false);
        host.game.resetNetworkSession();
    } finally {
        proc.kill();
    }
});

test('WebRTC: cliente entra com código, recebe início de partida e desconexão é sinalizada', async () => {
    const peers = new Map();
    let nextId = 1;
    class FakeConn {
        constructor() { this.handlers = new Map(); this.open = false; this.twin = null; }
        on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
        emit(type, arg) { for (const cb of this.handlers.get(type) || []) cb(arg); }
        send(packet) { if (this.open && this.twin?.open) queueMicrotask(() => { if (this.twin?.open) this.twin.emit('data', packet); }); }
        close() { if (!this.open) return; this.open = false; this.emit('close'); if (this.twin?.open) this.twin.close(); }
    }
    class FakePeer {
        constructor(id) {
            this.id = id || `guest-${nextId++}`; this.handlers = new Map(); this.open = false;
            if (peers.has(this.id)) throw new Error('unavailable-id');
            peers.set(this.id, this);
            queueMicrotask(() => { this.open = true; this.emit('open', this.id); });
        }
        on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
        emit(type, payload) { for (const cb of this.handlers.get(type) || []) cb(payload); }
        connect(remoteId) {
            const remotePeer = peers.get(remoteId);
            const local = new FakeConn();
            if (!remotePeer) { queueMicrotask(() => this.emit('error', { type: 'peer-unavailable' })); return local; }
            const remote = new FakeConn(); local.twin = remote; remote.twin = local;
            queueMicrotask(() => {
                remotePeer.emit('connection', remote);
                local.open = remote.open = true;
                remote.emit('open'); local.emit('open');
            });
            return local;
        }
        destroy() { peers.delete(this.id); this.open = false; }
    }
    const host = createGameHarness(), guest = createGameHarness();
    host.sandbox.Peer = guest.sandbox.Peer = FakePeer;
    host.sandbox.document.getElementById('player-nickname').value = 'Chris';
    guest.sandbox.document.getElementById('player-nickname').value = 'Sheva';
    host.game.initHostP2P();
    await until(() => peers.size === 1 && !!host.sandbox.document.getElementById('host-room-code').textContent);
    guest.sandbox.document.getElementById('join-code-input').value = host.game.net.roomCode;
    guest.game.joinRoomP2P();
    await until(() => host.game.net.connected && guest.game.net.connected);
    assert.equal(host.game.net.ally.name, 'Sheva');
    assert.equal(guest.game.net.ally.name, 'Chris');
    host.game.startGame();
    await until(() => guest.game.state.status === 'PLAYING');
    const code = host.game.net.roomCode;
    assert.equal(code.length, 8);
    assert.equal(guest.game.net.transport, 'PEER');
    guest.game.resetNetworkSession();
    await until(() => !host.game.net.connected);
    host.game.resetNetworkSession();
});

test('Abas locais: eleição host/cliente e handshake corretos', async () => {
    const rooms = new Map();
    class FakeChannel {
        constructor(name) {
            this.name = name; this.onmessage = null;
            if (!rooms.has(name)) rooms.set(name, new Set());
            rooms.get(name).add(this);
        }
        postMessage(message) {
            for (const other of rooms.get(this.name)) {
                if (other !== this) queueMicrotask(() => other.onmessage?.({ data: message }));
            }
        }
        close() { rooms.get(this.name)?.delete(this); }
    }
    const host = createGameHarness(), guest = createGameHarness();
    host.sandbox.BroadcastChannel = guest.sandbox.BroadcastChannel = FakeChannel;
    host.game.initLocalTabSync();
    await until(() => host.game.net.mode === 'HOST', 1700);
    guest.game.initLocalTabSync();
    await until(() => host.game.net.connected && guest.game.net.connected);
    assert.equal(host.game.net.mode, 'HOST');
    assert.equal(guest.game.net.mode, 'CLIENT');
    host.game.resetNetworkSession(); guest.game.resetNetworkSession();
});
