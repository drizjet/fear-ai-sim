/**
 * Fear AI Node.js / Web Reference Client
 * Provides both WebSocket streaming and HTTP REST communication.
 */

import { WebSocket } from 'ws';

export class FearAIClient {
    constructor(options = {}) {
        this.host = options.host || '127.0.0.1';
        this.port = options.port || 8765;
        this.httpBase = `http://${this.host}:${this.port}`;
        this.wsUrl = `ws://${this.host}:${this.port}`;
        this.clientId = options.clientId || `node_client_${Date.now()}`;
        this.ws = null;
        this.listeners = new Map(); // event -> Set<callback>
        this.pendingRequests = new Map();
        this.requestId = 1;
    }

    async checkHealth() {
        const res = await fetch(`${this.httpBase}/health`);
        return res.json();
    }

    async registerAgent(agentId, traits = {}, options = {}) {
        const res = await fetch(`${this.httpBase}/api/v1/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'REGISTER_AGENT',
                agent_id: agentId,
                name: options.name || agentId,
                traits,
                initial_position: options.initial_position
            })
        });
        return res.json();
    }

    async tick(observations = [], dt = 0.0166) {
        const res = await fetch(`${this.httpBase}/api/v1/tick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'BATCH_TICK_REQUEST',
                dt,
                observations
            })
        });
        return res.json();
    }

    connectWs() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', () => {
                this._sendWs({
                    type: 'HANDSHAKE_REQUEST',
                    protocol_version: '1.0.0',
                    client_id: this.clientId,
                    engine: 'NodeJS'
                });
                resolve();
            });

            this.ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    this._emit(msg.type, msg);
                    if (msg.results && Array.isArray(msg.results)) {
                        for (const agentState of msg.results) {
                            this._emit(`agent:${agentState.agent_id}`, agentState);
                        }
                    }
                } catch {
                    // Ignore parse error
                }
            });

            this.ws.on('error', (err) => {
                reject(err);
            });
        });
    }

    sendObservationsWs(observations = [], dt = 0.0166) {
        this._sendWs({
            type: 'BATCH_TICK_REQUEST',
            dt,
            observations
        });
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    _emit(event, data) {
        if (this.listeners.has(event)) {
            for (const cb of this.listeners.get(event)) {
                try { cb(data); } catch (e) { console.error(e); }
            }
        }
    }

    _sendWs(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

export default FearAIClient;
