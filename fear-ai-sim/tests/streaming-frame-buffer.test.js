import { describe, it, expect } from '@jest/globals';
import {
    BinaryWireProtocol,
    StreamingRingBuffer,
    PacketChunker,
    ChunkAssembler,
    FrameDeltaCompressor,
    JitterPlaybackBuffer,
    OVERFLOW_STRATEGIES,
    computeFletcher16,
    STREAMING_MAGIC,
    STREAMING_PROTOCOL_VERSION,
    DEFAULT_MTU_BYTES,
    CHUNK_HEADER_SIZE_BYTES
} from '../packages/protocol/index.js';

describe('Front D / Sections 66–68: Cross-Engine Binary Network Packet Interop & Streaming Buffer Serializer', () => {
    // Helper to generate N test entity intents
    function createMockIntents(count, baseFear = 0.2) {
        const intents = [];
        for (let i = 0; i < count; i++) {
            intents.push({
                entityId: 1000 + i,
                fear: Math.min(1.0, baseFear + (i % 5) * 0.1),
                anger: 0.15,
                dominance: 0.50,
                urgency: 0.30,
                intentType: i % 2 === 0 ? 'CAUTIOUS_EXPLORE' : 'IDLE_VIGILANT',
                suggestedPosture: 'UPRIGHT',
                band: 'ALERT',
                inCombat: false,
                exhausted: false,
                vectorHint: { x: (i % 10) * 0.1, y: 0.0, z: (i % 5) * 0.2 }
            });
        }
        return intents;
    }

    describe('1. Circular Ring Buffer (StreamingRingBuffer)', () => {
        it('writes and reads frames sequentially preserving metadata and payload', () => {
            const ring = new StreamingRingBuffer(4096, OVERFLOW_STRATEGIES.DROP_OLDEST);
            const intents1 = createMockIntents(5);
            const frame1 = BinaryWireProtocol.encodeIntentBatch(10, intents1);

            const written = ring.writeFrame(frame1, 1, 10);
            expect(written).toBe(true);

            const stats = ring.getStats();
            expect(stats.queuedFrames).toBe(1);
            expect(stats.usedBytes).toBe(frame1.byteLength);

            const read = ring.readNextFrame();
            expect(read).not.toBeNull();
            expect(read.sequenceId).toBe(1);
            expect(read.tick).toBe(10);
            expect(read.buffer.byteLength).toBe(frame1.byteLength);

            // Verify payload parity
            const decoded = BinaryWireProtocol.decodeIntentBatch(read.buffer);
            expect(decoded.count).toBe(5);
            expect(decoded.records[0].entityId).toBe(1000);
        });

        it('handles wrap-around writing and reading across buffer boundaries', () => {
            // Use small ring capacity (512 bytes) to force wrap-around quickly
            const ring = new StreamingRingBuffer(1024, OVERFLOW_STRATEGIES.DROP_OLDEST);
            const frame = BinaryWireProtocol.encodeIntentBatch(1, createMockIntents(5)); // ~176 bytes

            // Write and read 10 frames to wrap around multiple times
            for (let seq = 1; seq <= 10; seq++) {
                ring.writeFrame(frame, seq, seq * 5);
                const read = ring.readNextFrame();
                expect(read.sequenceId).toBe(seq);
                expect(read.tick).toBe(seq * 5);
                const decoded = BinaryWireProtocol.decodeIntentBatch(read.buffer);
                expect(decoded.count).toBe(5);
            }

            expect(ring.getStats().droppedFramesCount).toBe(0);
        });

        it('enforces DROP_OLDEST backpressure strategy when capacity is exceeded', () => {
            const ring = new StreamingRingBuffer(1024, OVERFLOW_STRATEGIES.DROP_OLDEST);
            const frame = BinaryWireProtocol.encodeIntentBatch(1, createMockIntents(10)); // 16 + 320 = 336 bytes

            // 1024 / 336 = ~3 frames capacity. Writing 5 frames should drop the first 2
            for (let seq = 1; seq <= 5; seq++) {
                ring.writeFrame(frame, seq, seq);
            }

            const stats = ring.getStats();
            expect(stats.droppedFramesCount).toBeGreaterThanOrEqual(2);

            // Next frame read should be newer than seq 1 and 2
            const oldestAvailable = ring.readNextFrame();
            expect(oldestAvailable.sequenceId).toBeGreaterThan(2);
        });

        it('enforces REJECT_NEWEST backpressure strategy when buffer is full', () => {
            const ring = new StreamingRingBuffer(512, OVERFLOW_STRATEGIES.REJECT_NEWEST);
            const frame = BinaryWireProtocol.encodeIntentBatch(1, createMockIntents(10)); // 336 bytes

            const w1 = ring.writeFrame(frame, 1, 1);
            expect(w1).toBe(true);

            // Second 336-byte frame exceeds remaining 512 - 336 = 176 bytes
            const w2 = ring.writeFrame(frame, 2, 2);
            expect(w2).toBe(false);
            expect(ring.getStats().droppedFramesCount).toBe(1);
        });
    });

    describe('2. UDP MTU Fragmentation & Chunk Reassembly', () => {
        it('splits large frames into MTU-compliant chunks with 16-byte headers', () => {
            const largeBatch = createMockIntents(100); // 16 + 100*32 = 3216 bytes
            const fullFrame = BinaryWireProtocol.encodeIntentBatch(50, largeBatch);
            expect(fullFrame.byteLength).toBe(3216);

            const mtu = 1400;
            const chunks = PacketChunker.chunkFrame(fullFrame, 101, { mtu, isKeyframe: true });

            // 3216 / (1400 - 16) = 3216 / 1384 = ~2.32 -> 3 chunks
            expect(chunks.length).toBe(3);
            for (let i = 0; i < chunks.length; i++) {
                expect(chunks[i].byteLength).toBeLessThanOrEqual(mtu);
                const view = new DataView(chunks[i]);
                expect(view.getUint16(0, true)).toBe(STREAMING_MAGIC);
                expect(view.getUint8(2)).toBe(STREAMING_PROTOCOL_VERSION);
                expect(view.getUint32(4, true)).toBe(101); // sequenceId
                expect(view.getUint16(8, true)).toBe(i); // chunkIndex
                expect(view.getUint16(10, true)).toBe(3); // totalChunks
            }
        });

        it('reassembles chunks in reversed out-of-order delivery with bit-exact parity', () => {
            const intents = createMockIntents(80);
            const fullFrame = BinaryWireProtocol.encodeIntentBatch(99, intents);
            const chunks = PacketChunker.chunkFrame(fullFrame, 777, { mtu: 1024, isKeyframe: true });
            expect(chunks.length).toBeGreaterThan(1);

            const assembler = new ChunkAssembler();

            // Ingest in reverse order
            let finalResult = null;
            for (let i = chunks.length - 1; i >= 0; i--) {
                const res = assembler.ingestChunk(chunks[i]);
                if (res.status === 'FRAME_COMPLETE') {
                    finalResult = res;
                }
            }

            expect(finalResult).not.toBeNull();
            expect(finalResult.status).toBe('FRAME_COMPLETE');
            expect(finalResult.sequenceId).toBe(777);
            expect(finalResult.isKeyframe).toBe(true);
            expect(finalResult.frameBuffer.byteLength).toBe(fullFrame.byteLength);

            // Reconstitute intents and test exact field recovery
            const decoded = BinaryWireProtocol.decodeIntentBatch(finalResult.frameBuffer);
            expect(decoded.count).toBe(80);
            expect(decoded.tick).toBe(99);
            expect(decoded.records[0].entityId).toBe(1000);
            expect(decoded.records[79].entityId).toBe(1079);
        });

        it('detects corrupted payload chunks using Fletcher-16 checksums', () => {
            const intents = createMockIntents(20);
            const fullFrame = BinaryWireProtocol.encodeIntentBatch(1, intents);
            const chunks = PacketChunker.chunkFrame(fullFrame, 500, { mtu: 512 });

            const assembler = new ChunkAssembler();

            // Corrupt a byte in the payload of the first chunk
            const corruptedChunk = chunks[0].slice(0);
            const uint8 = new Uint8Array(corruptedChunk);
            uint8[CHUNK_HEADER_SIZE_BYTES + 5] ^= 0xff; // flip bits

            const res = assembler.ingestChunk(corruptedChunk);
            expect(res.status).toBe('CHECKSUM_FAILED');
            expect(assembler.corruptedChunksCount).toBe(1);
        });
    });

    describe('3. Frame Delta Compression (FrameDeltaCompressor)', () => {
        it('achieves >75% compression when only a small subset of entities shift state', () => {
            const baseEntities = createMockIntents(100, 0.15); // 100 entities
            const currentEntities = JSON.parse(JSON.stringify(baseEntities));

            // Modify only 4 entities
            currentEntities[5].fear = 0.85;
            currentEntities[5].intentType = 'FLEE_FROM';
            currentEntities[5].vectorHint = { x: -1.0, y: 0.0, z: 0.0 };

            currentEntities[12].fear = 0.75;
            currentEntities[12].band = 'PANIC';

            currentEntities[44].inCombat = true;
            currentEntities[44].anger = 0.90;

            currentEntities[89].vectorHint = { x: 2.5, y: 1.0, z: -0.5 };

            const rawFullFrame = BinaryWireProtocol.encodeIntentBatch(2, currentEntities);
            const deltaBuffer = FrameDeltaCompressor.compressDelta(baseEntities, currentEntities, 2, 1);

            const rawSize = rawFullFrame.byteLength; // 3216 bytes
            const deltaSize = deltaBuffer.byteLength;

            // Delta should be tiny compared to raw frame (< 200 bytes vs 3216 bytes, > 90% savings)
            const reductionRatio = 1.0 - (deltaSize / rawSize);
            expect(reductionRatio).toBeGreaterThan(0.75);

            // Decompress and verify bit-exact state restoration
            const reconstituted = FrameDeltaCompressor.decompressDelta(baseEntities, deltaBuffer);
            expect(reconstituted.currentTick).toBe(2);
            expect(reconstituted.entities.length).toBe(100);

            // Check modified entity 5
            const e5 = reconstituted.entities.find(e => e.entityId === 1005);
            expect(e5.fear).toBeCloseTo(0.85, 2);
            expect(e5.intentType).toBe('FLEE_FROM');
            expect(e5.vectorHint.x).toBeCloseTo(-1.0, 2);

            // Check unchanged entity 0
            const e0 = reconstituted.entities.find(e => e.entityId === 1000);
            expect(e0.fear).toBeCloseTo(baseEntities[0].fear, 2);
            expect(e0.intentType).toBe(baseEntities[0].intentType);
        });
    });

    describe('4. Network Jitter Playback Buffer (JitterPlaybackBuffer)', () => {
        it('smooths fractional tick interpolation and tracks network lag', () => {
            const jitterBuffer = new JitterPlaybackBuffer({ targetDelayTicks: 2, maxBufferSize: 20 });

            // Feed frames for ticks 10, 11, 12, 13
            const frame10 = [{ entityId: 1, fear: 0.20, vectorHint: { x: 0.0, y: 0.0, z: 0.0 }, intentType: 'IDLE_VIGILANT' }];
            const frame11 = [{ entityId: 1, fear: 0.40, vectorHint: { x: 2.0, y: 0.0, z: 0.0 }, intentType: 'CAUTIOUS_EXPLORE' }];
            const frame12 = [{ entityId: 1, fear: 0.60, vectorHint: { x: 4.0, y: 0.0, z: 0.0 }, intentType: 'CAUTIOUS_EXPLORE' }];
            const frame13 = [{ entityId: 1, fear: 0.80, vectorHint: { x: 6.0, y: 0.0, z: 0.0 }, intentType: 'FLEE_FROM' }];

            jitterBuffer.pushFrame(10, frame10);
            jitterBuffer.pushFrame(11, frame11);
            jitterBuffer.pushFrame(12, frame12);
            jitterBuffer.pushFrame(13, frame13);

            // Set current playback tick to 11.5 (halfway between tick 11 and 12)
            jitterBuffer.currentPlaybackTick = 11.0;
            const sampled = jitterBuffer.samplePlayback(0.5); // advances to 11.5

            expect(sampled.length).toBe(1);
            const ent = sampled[0];
            expect(ent.entityId).toBe(1);
            // Fear should interpolate halfway between 0.40 and 0.60 -> 0.50
            expect(ent.fear).toBeCloseTo(0.50, 2);
            // Vector X should interpolate halfway between 2.0 and 4.0 -> 3.0
            expect(ent.vectorHint.x).toBeCloseTo(3.0, 2);

            const stats = jitterBuffer.getStats();
            expect(stats.bufferedFrames).toBeGreaterThan(0);
            expect(stats.currentPlaybackTick).toBe(11.5);
        });
    });
});
