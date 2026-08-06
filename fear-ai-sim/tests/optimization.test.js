/**
 * Optimization Tests for Fear-AI Evolution Simulator
 * Phase 5: Optimization (T5.2, T5.3, T5.4, T5.5)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { SpatialHash } from '../spatialhash.js';
import { ObjectPool } from '../objectpool.js';
import { LODSystem } from '../lodsystem.js';
import { BrainWorkerManager } from '../brainworker-manager.js';

describe('Optimization Systems', () => {

    describe('SpatialHash (T5.4)', () => {
        let hash;
        const width = 1000;
        const height = 1000;
        const cellSize = 100;

        beforeEach(() => {
            hash = new SpatialHash(width, height, cellSize);
        });

        it('should initialize with correct dimensions', () => {
            expect(hash.cols).toBe(10);
            expect(hash.rows).toBe(10);
        });

        it('should insert and query objects', () => {
            const obj1 = { id: 1 };
            const obj2 = { id: 2 };
            
            hash.insert(150, 150, obj1);
            hash.insert(160, 160, obj2);
            hash.insert(500, 500, { id: 3 }); // Far away
            
            const results = hash.query(155, 155, 50);
            expect(results.length).toBe(2);
            expect(results).toContain(obj1);
            expect(results).toContain(obj2);
        });

        it('should update object positions', () => {
            const obj = { id: 1 };
            hash.insert(150, 150, obj);
            
            hash.update(150, 150, 550, 550, obj);
            
            const oldResults = hash.query(150, 150, 50);
            const newResults = hash.query(550, 550, 50);
            
            expect(oldResults.length).toBe(0);
            expect(newResults.length).toBe(1);
            expect(newResults[0]).toBe(obj);
        });

        it('should handle out-of-bounds coordinates', () => {
            const obj = { id: 1 };
            hash.insert(-10, -10, obj); // Clamped to 0,0
            
            const results = hash.query(0, 0, 50);
            expect(results.length).toBe(1);
        });
    });

    describe('ObjectPool (T5.2)', () => {
        let pool;
        let factoryCount = 0;
        const factory = () => {
            factoryCount++;
            return { id: factoryCount, reset: function(x) { this.x = x; } };
        };

        beforeEach(() => {
            factoryCount = 0;
            pool = new ObjectPool(factory, 5);
        });

        it('should pre-allocate objects', () => {
            expect(factoryCount).toBe(5);
            expect(pool.pool.length).toBe(5);
        });

        it('should acquire and release objects', () => {
            const obj = pool.acquire(10);
            expect(obj.x).toBe(10);
            expect(pool.pool.length).toBe(4);
            expect(pool.active.size).toBe(1);
            
            pool.release(obj);
            expect(pool.pool.length).toBe(5);
            expect(pool.active.size).toBe(0);
        });

        it('should grow when empty', () => {
            for (let i = 0; i < 5; i++) pool.acquire(i);
            expect(pool.pool.length).toBe(0);
            
            const obj = pool.acquire(100);
            expect(factoryCount).toBe(6);
            expect(obj.id).toBe(6);
        });

        it('should reset objects on acquisition', () => {
            const obj = pool.acquire(10);
            pool.release(obj);
            
            const reused = pool.acquire(20);
            expect(reused).toBe(obj);
            expect(reused.x).toBe(20);
        });
    });

    describe('LODSystem (T5.5)', () => {
        let lod;

        beforeEach(() => {
            lod = new LODSystem({ x: 500, y: 500 });
        });

        it('should determine update frequency based on distance', () => {
            const closeAgent = { x: 510, y: 510 }; // Dist ~14
            const medAgent = { x: 1000, y: 500 };  // Dist 500
            const farAgent = { x: 2500, y: 500 };  // Dist 2000
            
            // High detail always updates
            expect(lod.shouldUpdate(closeAgent)).toBe(true);
            
            // Medium detail updates every 2nd frame
            lod.frameCounter = 1;
            expect(lod.shouldUpdate(medAgent)).toBe(false);
            lod.frameCounter = 2;
            expect(lod.shouldUpdate(medAgent)).toBe(true);
            
            // Low detail updates every 4th frame
            lod.frameCounter = 1;
            expect(lod.shouldUpdate(farAgent)).toBe(false);
            lod.frameCounter = 4;
            expect(lod.shouldUpdate(farAgent)).toBe(true);
        });

        it('should return correct detail level', () => {
            expect(lod.getDetailLevel({ x: 510, y: 510 })).toBe('HIGH');
            expect(lod.getDetailLevel({ x: 1000, y: 500 })).toBe('MEDIUM');
            expect(lod.getDetailLevel({ x: 2500, y: 500 })).toBe('LOW');
        });
    });

    describe('BrainWorkerManager (T5.3)', () => {
        let manager;

        beforeEach(() => {
            // Worker is not available in Node.js/Jest by default, 
            // but our manager has a fallback.
            manager = new BrainWorkerManager(2);
        });

        it('should use fallback when Worker is undefined', async () => {
            const payload = { fear: 0.5, state: 'ALERT', adrenaline: 0.5 };
            const result = await manager.submitTask('DECIDE', payload);
            
            expect(result.fear).toBeCloseTo(0.5 * 0.95, 5);
            expect(result.state).toBe('ALERT');
        });

        it('should process batches using fallback', async () => {
            const payloads = [
                { fear: 0.1 },
                { fear: 0.2 },
                { fear: 0.3 }
            ];
            
            const results = await manager.processBatch('DECIDE', payloads);
            expect(results.length).toBe(3);
            expect(results[0].fear).toBeCloseTo(0.1 * 0.95, 5);
        });

        it('should terminate cleanly', () => {
            manager.terminate();
            expect(manager.workers.length).toBe(0);
            expect(manager.pendingTasks.size).toBe(0);
        });
    });
});
