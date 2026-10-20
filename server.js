#!/usr/bin/env node
'use strict';
// Servidor HTTP + WebSocket para co-op na rede local, sem npm ou dependências.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const MAX_FRAME = 256 * 1024;
const ROOM_RE = /^RE5[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
const rooms = new Map();

function serve(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end(); return; }
    if (pathname === '/') pathname = '/index.html';
    const rel = pathname.replace(/^\/+/, '');
    if (rel.split('/').some(part => part.startsWith('.') || part === 'tests' || part === 'docs' || part === 'node_modules') || rel === 'server.js') {
        res.writeHead(404); res.end(); return;
    }
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT + path.sep) || !MIME[path.extname(full)]) { res.writeHead(404); res.end(); return; }
    fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404); res.end('Arquivo não encontrado'); return; }
        if (rel === 'index.html') {
            data = Buffer.from(data.toString('utf8').replace('<script src="js/config.js"></script>',
                '<script>window.COOP_LOCAL_SERVER = true;</script>\n    <script src="js/config.js"></script>'));
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(full)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        if (req.method === 'HEAD') res.end(); else res.end(data);
    });
}

function wsWrite(socket, opcode, payload = Buffer.alloc(0)) {
    if (socket.destroyed || !socket.writable) return;
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    let header;
    if (body.length < 126) { header = Buffer.from([0x80 | opcode, body.length]); }
    else if (body.length <= 65535) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(body.length, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(body.length), 2); }
    socket.write(Buffer.concat([header, body]));
}

function send(client, data) {
    wsWrite(client.socket, 1, JSON.stringify(data));
}

function removeFromRoom(client) {
    const room = client.room;
    if (!room) return;
    client.room = null;
    const players = rooms.get(room);
    if (!players) return;
    players.delete(client);
    if (players.size === 0) rooms.delete(room);
    else for (const other of players) send(other, { op: 'peer_left' });
}

function onPacket(client, message) {
    let msg;
    try { msg = JSON.parse(message); } catch { send(client, { op: 'error', message: 'Mensagem inválida.' }); return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.op === 'create') {
        if (client.room) { send(client, { op: 'error', message: 'Você já está em uma sala.' }); return; }
        if (!ROOM_RE.test(msg.code || '')) { send(client, { op: 'error', message: 'Código inválido.' }); return; }
        if (rooms.has(msg.code)) { send(client, { op: 'error', message: 'Código já está em uso.' }); return; }
        rooms.set(msg.code, new Set([client]));
        client.room = msg.code;
        send(client, { op: 'created' });
    } else if (msg.op === 'join') {
        if (client.room) { send(client, { op: 'error', message: 'Você já está em uma sala.' }); return; }
        const players = rooms.get(msg.code);
        if (!players) { send(client, { op: 'error', message: 'Sala não encontrada.' }); return; }
        if (players.size >= 2) { send(client, { op: 'error', message: 'Sala cheia (máximo de 2 jogadores).' }); return; }
        players.add(client);
        client.room = msg.code;
        send(client, { op: 'joined' });
        for (const other of players) if (other !== client) send(other, { op: 'peer_joined' });
    } else if (msg.op === 'packet' && client.room && msg.data && typeof msg.data.type === 'string') {
        const players = rooms.get(client.room);
        // Mensagens de jogo só vão para o outro integrante, nunca voltam para o remetente.
        if (players) for (const other of players) if (other !== client) send(other, { op: 'packet', data: msg.data });
    }
}

function parseFrames(client, incoming) {
    client.buffer = Buffer.concat([client.buffer, incoming]);
    while (client.buffer.length >= 2) {
        const first = client.buffer[0], second = client.buffer[1];
        const fin = !!(first & 0x80), opcode = first & 0x0f, masked = !!(second & 0x80);
        let length = second & 0x7f, offset = 2;
        if (!masked || !fin) { client.socket.destroy(); return; }
        if (length === 126) {
            if (client.buffer.length < 4) return;
            length = client.buffer.readUInt16BE(2); offset = 4;
        } else if (length === 127) {
            if (client.buffer.length < 10) return;
            const size = client.buffer.readBigUInt64BE(2);
            if (size > BigInt(MAX_FRAME)) { client.socket.destroy(); return; }
            length = Number(size); offset = 10;
        }
        if (length > MAX_FRAME) { client.socket.destroy(); return; }
        if (client.buffer.length < offset + 4 + length) return;
        const mask = client.buffer.subarray(offset, offset + 4);
        const body = Buffer.from(client.buffer.subarray(offset + 4, offset + 4 + length));
        client.buffer = client.buffer.subarray(offset + 4 + length);
        for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
        if (opcode === 0x8) { client.socket.end(); return; }
        if (opcode === 0x9) { wsWrite(client.socket, 0xA, body); continue; }
        if (opcode === 0xA) continue;
        if (opcode !== 0x1) { client.socket.destroy(); return; }
        onPacket(client, body.toString('utf8'));
    }
}

const server = http.createServer(serve);
server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
    if (url.pathname !== '/ws' || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
        !/^[A-Za-z0-9+/]{22}==$/.test(req.headers['sec-websocket-key'] || '') || req.headers['sec-websocket-version'] !== '13') {
        socket.destroy(); return;
    }
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const client = { socket, room: null, buffer: Buffer.alloc(0) };
    socket.on('data', data => parseFrames(client, data));
    socket.on('error', () => {});
    socket.on('close', () => removeFromRoom(client));
    if (head.length) parseFrames(client, head);
});
server.listen(PORT, HOST, () => {
    const address = server.address();
    console.log(`🧟 Zombie Co-op em http://localhost:${address.port}`);
    console.log(`🌐 Na mesma rede: http://IP-DO-SEU-PC:${address.port}`);
    console.log('Pressione Ctrl+C para encerrar.');
});
