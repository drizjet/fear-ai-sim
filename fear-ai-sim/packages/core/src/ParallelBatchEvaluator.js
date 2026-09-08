/**
 * @file ParallelBatchEvaluator.js
 * Frontier D / Sections 136–140: Multi-Threaded Parallel Batch Evaluator
 * & Shared-Memory Buffer Striping for 100k+ Entity Living Worlds.
 * 
 * Host Game Authority Invariant:
 * Evaluates advisory affect and intent without mutating host state, physics, or entity positions.
 */

import path from 'path';
import os from 'os';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { evaluateChunk, STRIDE } from './batch_evaluator_worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ENTITY_FIELD_OFFSETS = Object.freeze({
  ID: 0,
  POS_X: 1,
  POS_Y: 2,
  POS_Z: 3,
  THREAT_X: 4,
  THREAT_Y: 5,
  THREAT_Z: 6,
  THREAT_SEVERITY: 7,
  FEAR: 8,
  AROUSAL: 9,
  OUT_FEAR: 10,
  OUT_INTENT: 11,
  STRIDE: 12
});

export const INTENT_CODES = Object.freeze({
  CALM_IDLE: 0,
  ALERT_INVESTIGATE: 1,
  ANXIOUS_WITHDRAW: 2,
  PANIC_FLEE: 3
});

export const INTENT_NAMES = Object.freeze({
  0: 'CALM_IDLE',
  1: 'ALERT_INVESTIGATE',
  2: 'ANXIOUS_WITHDRAW',
  3: 'PANIC_FLEE'
});

/**
 * Contiguous typed memory buffer representing a batch of entities.
 * Supports SharedArrayBuffer for zero-copy multi-core worker evaluation.
 */
export class SharedMemoryEntityBuffer {
  /**
   * @param {number} capacity Maximum number of entities in this buffer
   * @param {object} [options]
   * @param {boolean} [options.shared=true] Use SharedArrayBuffer if available
   */
  constructor(capacity, options = {}) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`Invalid buffer capacity: ${capacity}. Must be positive integer.`);
    }

    this.capacity = capacity;
    this.byteLength = capacity * STRIDE * 4;
    
    const requestShared = options.shared !== false;
    this.isShared = requestShared && typeof SharedArrayBuffer !== 'undefined';

    if (this.isShared) {
      this.buffer = new SharedArrayBuffer(this.byteLength);
    } else {
      this.buffer = new ArrayBuffer(this.byteLength);
    }

    this.floatView = new Float32Array(this.buffer);
    this.intView = new Int32Array(this.buffer);
  }

  /**
   * Sets entity attributes at specified index.
   * @param {number} index
   * @param {object} entity
   */
  setEntity(index, entity) {
    if (index < 0 || index >= this.capacity) {
      throw new RangeError(`Entity index ${index} out of bounds [0, ${this.capacity})`);
    }

    const base = index * STRIDE;
    this.intView[base + ENTITY_FIELD_OFFSETS.ID] = entity.id !== undefined ? entity.id : index;
    this.floatView[base + ENTITY_FIELD_OFFSETS.POS_X] = entity.posX || 0;
    this.floatView[base + ENTITY_FIELD_OFFSETS.POS_Y] = entity.posY || 0;
    this.floatView[base + ENTITY_FIELD_OFFSETS.POS_Z] = entity.posZ || 0;
    this.floatView[base + ENTITY_FIELD_OFFSETS.THREAT_X] = entity.threatX || 0;
    this.floatView[base + ENTITY_FIELD_OFFSETS.THREAT_Y] = entity.threatY || 0;
    this.floatView[base + ENTITY_FIELD_OFFSETS.THREAT_Z] = entity.threatZ || 0;
    this.floatView[base + ENTITY_FIELD_OFFSETS.THREAT_SEVERITY] = entity.threatSeverity || 0;
    this.floatView[base + ENTITY_FIELD_OFFSETS.FEAR] = entity.fear || 0;
    this.floatView[base + ENTITY_FIELD_OFFSETS.AROUSAL] = entity.arousal || 0;
    this.floatView[base + ENTITY_FIELD_OFFSETS.OUT_FEAR] = entity.outFear || 0;
    this.intView[base + ENTITY_FIELD_OFFSETS.OUT_INTENT] = entity.outIntent || 0;
  }

  /**
   * Retrieves entity attributes at specified index.
   * @param {number} index
   * @returns {object}
   */
  getEntity(index) {
    if (index < 0 || index >= this.capacity) {
      throw new RangeError(`Entity index ${index} out of bounds [0, ${this.capacity})`);
    }

    const base = index * STRIDE;
    return {
      id: this.intView[base + ENTITY_FIELD_OFFSETS.ID],
      posX: this.floatView[base + ENTITY_FIELD_OFFSETS.POS_X],
      posY: this.floatView[base + ENTITY_FIELD_OFFSETS.POS_Y],
      posZ: this.floatView[base + ENTITY_FIELD_OFFSETS.POS_Z],
      threatX: this.floatView[base + ENTITY_FIELD_OFFSETS.THREAT_X],
      threatY: this.floatView[base + ENTITY_FIELD_OFFSETS.THREAT_Y],
      threatZ: this.floatView[base + ENTITY_FIELD_OFFSETS.THREAT_Z],
      threatSeverity: this.floatView[base + ENTITY_FIELD_OFFSETS.THREAT_SEVERITY],
      fear: this.floatView[base + ENTITY_FIELD_OFFSETS.FEAR],
      arousal: this.floatView[base + ENTITY_FIELD_OFFSETS.AROUSAL],
      outFear: this.floatView[base + ENTITY_FIELD_OFFSETS.OUT_FEAR],
      outIntent: this.intView[base + ENTITY_FIELD_OFFSETS.OUT_INTENT],
      intentName: INTENT_NAMES[this.intView[base + ENTITY_FIELD_OFFSETS.OUT_INTENT]] || 'UNKNOWN'
    };
  }

  /**
   * Populates buffer from an array of entity objects.
   * @param {Array<object>} entities
   * @param {number} [offset=0]
   */
  bulkLoad(entities, offset = 0) {
    for (let i = 0; i < entities.length; i++) {
      this.setEntity(offset + i, entities[i]);
    }
  }

  /**
   * Generates a procedurally populated buffer for high-scale testing.
   * @param {number} count 
   * @param {object} [options]
   */
  static createProcedural(count, options = {}) {
    const buffer = new SharedMemoryEntityBuffer(count, options);
    const threatDist = options.threatDist !== undefined ? options.threatDist : 50.0;
    const severity = options.severity !== undefined ? options.severity : 0.85;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2.0;
      const radius = 10.0 + (i % 100) * 1.5;
      buffer.setEntity(i, {
        id: 100000 + i,
        posX: Math.cos(angle) * radius,
        posY: 0,
        posZ: Math.sin(angle) * radius,
        threatX: 0,
        threatY: 0,
        threatZ: threatDist,
        threatSeverity: severity,
        fear: 0.10,
        arousal: 0.05
      });
    }

    return buffer;
  }
}

/**
 * Multi-threaded parallel batch evaluator managing worker pool threads
 * and chunked contiguous buffer evaluation.
 */
export class ParallelBatchEvaluator {
  /**
   * @param {object} [options]
   * @param {number} [options.workerCount] Number of worker threads (defaults to physical/logical CPU count, clamped to [1, 16])
   * @param {number} [options.chunkSize=5000] Minimum chunk size per worker
   * @param {boolean} [options.useWorkers=true] Whether to enable multi-threading or force sync fallback
   * @param {string} [options.workerPath] Custom path to worker script
   */
  constructor(options = {}) {
    const detectedCpus = typeof os !== 'undefined' && os.cpus ? os.cpus().length : 4;
    this.workerCount = Math.max(1, Math.min(options.workerCount || detectedCpus, 16));
    this.chunkSize = options.chunkSize || 5000;
    this.useWorkers = options.useWorkers !== false && typeof Worker !== 'undefined';
    this.workerPath = options.workerPath || path.join(__dirname, 'batch_evaluator_worker.js');
    
    this.workers = [];
    this.isTerminated = false;

    if (this.useWorkers && this.workerCount > 1) {
      this._initWorkers();
    }
  }

  _initWorkers() {
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(this.workerPath);
      worker.unref(); // Prevent worker threads from blocking process exit
      this.workers.push({
        id: i,
        worker,
        busy: false,
        currentResolve: null,
        currentReject: null
      });

      worker.on('message', (msg) => {
        const item = this.workers[i];
        if (item && item.currentResolve) {
          const resolve = item.currentResolve;
          item.busy = false;
          item.currentResolve = null;
          item.currentReject = null;
          resolve(msg);
        }
      });

      worker.on('error', (err) => {
        const item = this.workers[i];
        if (item && item.currentReject) {
          const reject = item.currentReject;
          item.busy = false;
          item.currentResolve = null;
          item.currentReject = null;
          reject(err);
        }
      });
    }
  }

  /**
   * Synchronously evaluates entity buffer within the current thread.
   * @param {SharedMemoryEntityBuffer} entityBuffer 
   * @param {number} [startIdx=0] 
   * @param {number} [endIdx] 
   */
  evaluateSync(entityBuffer, startIdx = 0, endIdx) {
    const end = endIdx !== undefined ? endIdx : entityBuffer.capacity;
    evaluateChunk(entityBuffer.floatView, entityBuffer.intView, startIdx, end);
  }

  /**
   * Evaluates an entity batch either in parallel via worker pool or synchronous fallback.
   * @param {SharedMemoryEntityBuffer} entityBuffer 
   * @param {number} [entityCount] Total entities to evaluate (defaults to buffer.capacity)
   * @returns {Promise<object>} Evaluation telemetry and metrics
   */
  async evaluateBatch(entityBuffer, entityCount) {
    if (this.isTerminated) {
      throw new Error('ParallelBatchEvaluator has been terminated.');
    }

    const count = entityCount !== undefined ? entityCount : entityBuffer.capacity;
    if (count <= 0) {
      return {
        entityCount: 0,
        elapsedMs: 0,
        throughput: 0,
        workerCount: 0,
        mode: 'NOOP'
      };
    }

    const startTime = process.hrtime.bigint();

    // Use synchronous mode if worker pool is disabled, single worker, or tiny cohort
    const useParallel = this.useWorkers && 
                        this.workers.length > 1 && 
                        count >= Math.min(this.chunkSize, 2000) &&
                        entityBuffer.isShared;

    if (!useParallel) {
      this.evaluateSync(entityBuffer, 0, count);
      const endTime = process.hrtime.bigint();
      const elapsedNs = Number(endTime - startTime);
      const elapsedMs = Math.max(0.001, elapsedNs / 1_000_000);
      const throughput = Math.round((count / elapsedMs) * 1000);

      return {
        entityCount: count,
        elapsedMs: Number(elapsedMs.toFixed(3)),
        throughput,
        workerCount: 1,
        mode: 'SYNCHRONOUS_EVALUATION'
      };
    }

    // Parallel multi-worker execution over SharedArrayBuffer
    const activeWorkers = Math.min(this.workers.length, Math.ceil(count / 1000));
    const itemsPerWorker = Math.ceil(count / activeWorkers);
    const chunkPromises = [];

    for (let w = 0; w < activeWorkers; w++) {
      const startIdx = w * itemsPerWorker;
      const endIdx = Math.min(count, startIdx + itemsPerWorker);

      if (startIdx >= endIdx) break;

      const workerItem = this.workers[w];
      const promise = new Promise((resolve, reject) => {
        workerItem.busy = true;
        workerItem.currentResolve = resolve;
        workerItem.currentReject = reject;
        workerItem.worker.postMessage({
          type: 'EVALUATE_CHUNK',
          buffer: entityBuffer.buffer,
          startIdx,
          endIdx,
          isShared: true
        });
      });

      chunkPromises.push(promise);
    }

    await Promise.all(chunkPromises);

    const endTime = process.hrtime.bigint();
    const elapsedNs = Number(endTime - startTime);
    const elapsedMs = Math.max(0.001, elapsedNs / 1_000_000);
    const throughput = Math.round((count / elapsedMs) * 1000);

    return {
      entityCount: count,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      throughput,
      workerCount: activeWorkers,
      mode: 'PARALLEL_WORKER_POOL'
    };
  }

  /**
   * Gracefully terminates all worker threads.
   */
  async terminate() {
    this.isTerminated = true;
    const terminations = this.workers.map(item => item.worker.terminate());
    await Promise.all(terminations);
    this.workers = [];
  }
}
