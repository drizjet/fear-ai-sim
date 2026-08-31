/**
 * Spatial Hash Grid for fast proximity queries
 * Phase 5: Optimization (T5.4)
 */

export class SpatialHash {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Map(); // Using Map for sparse grid
    }

    /**
     * Clear the grid
     */
    clear() {
        this.grid.clear();
    }

    /**
     * Insert an object into the grid
     */
    insert(x, y, obj) {
        const key = this.getKey(x, y);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key).push(obj);
    }

    /**
     * Get the grid key for a coordinate
     */
    getKey(x, y) {
        const col = Math.floor(Math.max(0, Math.min(this.width - 1, x)) / this.cellSize);
        const row = Math.floor(Math.max(0, Math.min(this.height - 1, y)) / this.cellSize);
        return `${col},${row}`;
    }

    /**
     * Query objects within a range
     */
    query(x, y, radius) {
        const found = [];
        const startCol = Math.floor(Math.max(0, x - radius) / this.cellSize);
        const endCol = Math.floor(Math.min(this.width - 1, x + radius) / this.cellSize);
        const startRow = Math.floor(Math.max(0, y - radius) / this.cellSize);
        const endRow = Math.floor(Math.min(this.height - 1, y + radius) / this.cellSize);

        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                const key = `${col},${row}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (let obj of cell) {
                        // Optional: distance check here or in caller
                        found.push(obj);
                    }
                }
            }
        }
        return found;
    }

    /**
     * Update an object's position in the grid
     * (Faster if we know old position, but clear/re-insert is also O(N))
     */
    update(oldX, oldY, newX, newY, obj) {
        const oldKey = this.getKey(oldX, oldY);
        const newKey = this.getKey(newX, newY);
        
        if (oldKey === newKey) return;
        
        const cell = this.grid.get(oldKey);
        if (cell) {
            const index = cell.indexOf(obj);
            if (index !== -1) {
                cell.splice(index, 1);
            }
        }
        
        this.insert(newX, newY, obj);
    }
}
