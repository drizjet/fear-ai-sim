/**
 * Object Pooling System
 * Phase 5: Optimization (T5.2)
 * 
 * Reuses objects to reduce memory allocations and GC pressure
 */

export class ObjectPool {
    constructor(factory, size = 100) {
        this.factory = factory; // Function to create a new object
        this.pool = [];
        this.active = new Set();
        
        // Pre-allocate
        for (let i = 0; i < size; i++) {
            this.pool.push(this.factory());
        }
    }

    /**
     * Get an object from the pool
     */
    acquire(...args) {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            // Grow pool if empty
            obj = this.factory();
        }
        
        // Reset object state if it has a reset method
        if (obj.reset) {
            obj.reset(...args);
        }
        
        this.active.add(obj);
        return obj;
    }

    /**
     * Release an object back to the pool
     */
    release(obj) {
        if (this.active.has(obj)) {
            this.active.delete(obj);
            this.pool.push(obj);
        }
    }

    /**
     * Release all active objects
     */
    releaseAll() {
        for (let obj of this.active) {
            this.pool.push(obj);
        }
        this.active.clear();
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            total: this.pool.length + this.active.size,
            active: this.active.size,
            available: this.pool.length
        };
    }
}
