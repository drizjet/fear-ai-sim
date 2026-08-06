/**
 * Jest Configuration for Fear-AI Evolution Simulator
 * Phase 1: Testing Infrastructure (T1.1)
 */

export default {
    // Use jsdom environment for browser APIs (Canvas, etc.)
    testEnvironment: 'jsdom',
    
    // Test file patterns
    testMatch: [
        '**/tests/**/*.test.js'
    ],
    
    // Module file extensions
    moduleFileExtensions: ['js', 'json'],
    
    // Transform ES modules
    transform: {},
    
    // Coverage configuration
    collectCoverageFrom: [
        '*.js',
        '!jest.config.js',
        '!vite.config.js',
        '!main.js' // Entry point, less critical to test
    ],
    
    coverageThreshold: {
        global: {
            branches: 0,
            functions: 0,
            lines: 0,
            statements: 0
        },
        './agent.js': {
            statements: 15,
            branches: 10,
            functions: 40,
            lines: 15
        },
        './brain.js': {
            statements: 15,
            branches: 10,
            functions: 40,
            lines: 15
        }
    },
    
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'text-summary', 'html', 'lcov'],
    
    // Setup files
    setupFilesAfterEnv: ['./tests/setup.js'],
    
    // Verbose output
    verbose: true,
    
    // Clear mocks between tests
    clearMocks: true,
    
    // Mock static assets and 3D library
    moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '^three$': '<rootDir>/tests/mocks/three.js'
    }
    };