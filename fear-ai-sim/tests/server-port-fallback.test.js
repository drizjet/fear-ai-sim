import { describe, it, expect } from '@jest/globals';
import { DesignerDashboardServer, FearServer } from '../packages/runtime/index.js';

// R6: port-0 fallback defect. `options.port || DEFAULT` coerced port 0 to
// the fixed default, forcing parallel matrix workers and sandboxes onto
// 8765/8766 (EACCES). Port 0 must survive to the OS bind and resolve to
// the actual ephemeral port; garbage must fall back to the default.

describe('R6: server port handling', () => {
    it('1. Dashboard keeps port 0 and reports the OS-bound port', async () => {
        const server = new DesignerDashboardServer({ host: '127.0.0.1', port: 0 });
        expect(server.port).toBe(0);
        const res = await server.start();
        expect(res.port).toBeGreaterThan(0);
        expect(server.port).toBe(res.port);
        expect(res.url).toBe(`http://127.0.0.1:${res.port}`);
        await server.stop();
    });

    it('2. Dashboard falls back to 8766 on missing or garbage ports', () => {
        expect(new DesignerDashboardServer({}).port).toBe(8766);
        expect(new DesignerDashboardServer({ port: undefined }).port).toBe(8766);
        expect(new DesignerDashboardServer({ port: NaN }).port).toBe(8766);
        expect(new DesignerDashboardServer({ port: 'hot' }).port).toBe(8766);
        expect(new DesignerDashboardServer({ port: -5 }).port).toBe(8766);
        expect(new DesignerDashboardServer({ port: 9001 }).port).toBe(9001);
    });

    it('3. Middleware server keeps port 0 and reports the OS-bound port', async () => {
        const server = new FearServer({ host: '127.0.0.1', port: 0 });
        expect(server.port).toBe(0);
        const res = await server.start();
        expect(res.port).toBeGreaterThan(0);
        expect(server.port).toBe(res.port);
        await server.stop();
    });

    it('4. Middleware server falls back to 8765 on missing or garbage ports', () => {
        expect(new FearServer({}).port).toBe(8765);
        expect(new FearServer({ port: NaN }).port).toBe(8765);
        expect(new FearServer({ port: 'hot' }).port).toBe(8765);
        expect(new FearServer({ port: -1 }).port).toBe(8765);
        expect(new FearServer({ port: 9002 }).port).toBe(9002);
    });

    it('5. Two dashboard servers start concurrently without collision', async () => {
        const a = new DesignerDashboardServer({ host: '127.0.0.1', port: 0 });
        const b = new DesignerDashboardServer({ host: '127.0.0.1', port: 0 });
        const [ra, rb] = await Promise.all([a.start(), b.start()]);
        expect(ra.port).toBeGreaterThan(0);
        expect(rb.port).toBeGreaterThan(0);
        expect(rb.port).not.toBe(ra.port);
        await a.stop();
        await b.stop();
    });
});
