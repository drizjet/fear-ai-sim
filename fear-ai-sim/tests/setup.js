/**
 * Test Setup for Fear-AI Evolution Simulator
 * Phase 1: Testing Infrastructure (T1.1, T1.5)
 * 
 * This file configures the test environment and provides shared utilities
 */

import { jest } from '@jest/globals';

// Mock Canvas API for Node.js environment
global.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Array(4) })),
    putImageData: jest.fn(),
    createImageData: jest.fn(() => ({ data: new Array(4) })),
    setTransform: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    fillText: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    stroke: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    transform: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
    setLineDash: jest.fn()
}));

// Mock performance.now() for consistent timing in tests
global.performance = global.performance || { now: () => Date.now() };

// Reset Agent ID counter before each test
beforeEach(() => {
    // Import and reset Agent ID counter
    jest.resetModules();
});

// Global test utilities
export const createMockCanvas = (width = 800, height = 600) => ({
    width,
    height,
    getContext: jest.fn(() => global.HTMLCanvasElement.prototype.getContext())
});

export const createMockVisuals = (overrides = {}) => ({
    threats: [],
    food: [],
    neighbors: [],
    ...overrides
});

export const createMockAgent = (x = 100, y = 100, traits = null) => ({
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 4,
    energy: 100,
    dead: false,
    brain: {
        state: 'CALM',
        currentFear: 0,
        traits: traits || { fear: 0.5, skill: 0.5, curiosity: 0.5 },
        morale: 1.0,
        adrenaline: 0
    },
    ...overrides
});

// Silence console during tests unless explicitly needed
const originalConsole = { ...console };
beforeAll(() => {
    // Uncomment to silence console during tests
    // console.log = jest.fn();
    // console.warn = jest.fn();
    // console.error = jest.fn();
});

afterAll(() => {
    // Restore console
    Object.assign(console, originalConsole);
});