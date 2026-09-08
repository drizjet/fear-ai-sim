/**
 * @file batch_evaluator_worker.js
 * Worker thread script for parallel batch affective evaluation across large entity cohorts.
 * Operates on contiguous typed buffers with zero-copy shared memory or transferable arrays.
 * 
 * Host Game Authority Invariant:
 * Evaluates advisory affect and intent without mutating host state or physics.
 */

import { parentPort } from 'worker_threads';

export const STRIDE = 12;

/**
 * Evaluates a chunk of entities from index startIdx to endIdx.
 * @param {Float32Array} floatView 
 * @param {Int32Array} intView 
 * @param {number} startIdx 
 * @param {number} endIdx 
 */
export function evaluateChunk(floatView, intView, startIdx, endIdx) {
  for (let i = startIdx; i < endIdx; i++) {
    const base = i * STRIDE;

    const posX = floatView[base + 1];
    const posY = floatView[base + 2];
    const posZ = floatView[base + 3];

    const threatX = floatView[base + 4];
    const threatY = floatView[base + 5];
    const threatZ = floatView[base + 6];
    const severity = floatView[base + 7];

    const currentFear = floatView[base + 8];
    const currentArousal = floatView[base + 9];

    // Spatial distance to threat
    const dx = posX - threatX;
    const dy = posY - threatY;
    const dz = posZ - threatZ;
    const distSq = dx * dx + dy * dy + dz * dz;
    const dist = Math.sqrt(distSq);

    // Distance attenuation: factor in [0.0, 1.0]
    const factor = dist < 0.001 ? 1.0 : (1.0 / (1.0 + 0.05 * dist));
    const perceivedThreat = severity * factor;

    // Hysteresis fear update
    let updatedFear = currentFear;
    if (perceivedThreat > 0.01) {
      const targetFear = Math.min(1.0, Math.max(0.0, perceivedThreat));
      if (targetFear > currentFear) {
        // Threat onset acceleration
        updatedFear = Math.min(1.0, currentFear + 0.35 * (targetFear - currentFear) + 0.05);
      } else {
        // Slow recovery cooldown
        updatedFear = Math.max(0.0, currentFear - 0.05 * (currentFear - targetFear));
      }
    } else {
      // Natural baseline decay
      updatedFear = Math.max(0.0, currentFear - 0.04);
    }

    // Dynamic arousal tracking
    const updatedArousal = Math.min(1.0, Math.max(0.0, 0.45 * updatedFear + 0.55 * severity));

    // Intent resolution
    // 0: CALM_IDLE, 1: ALERT_INVESTIGATE, 2: ANXIOUS_WITHDRAW, 3: PANIC_FLEE
    let intentCode = 0;
    if (updatedFear >= 0.70) {
      intentCode = 3; // PANIC_FLEE
    } else if (updatedFear >= 0.45) {
      intentCode = 2; // ANXIOUS_WITHDRAW
    } else if (updatedFear >= 0.15) {
      intentCode = 1; // ALERT_INVESTIGATE
    } else {
      intentCode = 0; // CALM_IDLE
    }

    // Write back outputs
    floatView[base + 10] = updatedFear;
    intView[base + 11] = intentCode;
  }
}

if (parentPort) {
  parentPort.on('message', (msg) => {
    if (!msg) return;

    if (msg.type === 'EVALUATE_CHUNK') {
      const { buffer, startIdx, endIdx, isShared } = msg;
      const floatView = new Float32Array(buffer);
      const intView = new Int32Array(buffer);

      evaluateChunk(floatView, intView, startIdx, endIdx);

      if (isShared) {
        parentPort.postMessage({
          type: 'CHUNK_DONE',
          startIdx,
          endIdx
        });
      } else {
        // Transfer buffer back if not shared
        parentPort.postMessage({
          type: 'CHUNK_DONE',
          startIdx,
          endIdx,
          buffer
        }, [buffer]);
      }
    }
  });
}
