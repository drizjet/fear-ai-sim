/**
 * NavMesh Graph Generation & Pathfinding
 * Phase 10: Environmental Interaction (T10.2)
 * 
 * Generates a grid-based navigation mesh to route around complex obstacles,
 * complementing the local steering forces.
 */

/**
 * Simple Priority Queue (Binary Heap) for A* optimization
 */
class PriorityQueue {
    constructor(comparator = (a, b) => a < b) {
        this.heap = [];
        this.comparator = comparator;
    }
    push(item) {
        this.heap.push(item);
        this.siftUp();
    }
    pop() {
        if (this.size() === 0) return null;
        const top = this.heap[0];
        const bottom = this.heap.pop();
        if (this.size() > 0) {
            this.heap[0] = bottom;
            this.siftDown();
        }
        return top;
    }
    size() { return this.heap.length; }
    siftUp() {
        let node = this.size() - 1;
        while (node > 0) {
            const parent = (node - 1) >> 1;
            if (this.comparator(this.heap[node], this.heap[parent])) {
                [this.heap[node], this.heap[parent]] = [this.heap[parent], this.heap[node]];
                node = parent;
            } else break;
        }
    }
    siftDown() {
        let node = 0;
        while (true) {
            const left = (node << 1) + 1;
            const right = (node << 1) + 2;
            let smallest = node;
            if (left < this.size() && this.comparator(this.heap[left], this.heap[smallest])) smallest = left;
            if (right < this.size() && this.comparator(this.heap[right], this.heap[smallest])) smallest = right;
            if (smallest !== node) {
                [this.heap[node], this.heap[smallest]] = [this.heap[smallest], this.heap[node]];
                node = smallest;
            } else break;
        }
    }
}

export class NavMesh {
    constructor(width, height, cellSize = 20) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Uint8Array(this.cols * this.rows); // 0 = walkable, 1 = obstacle
        
        // T12.2: Path Caching
        this.pathCache = new Map();
    }

    buildFromObstacles(obstacles) {
        // Reset grid
        this.grid.fill(0);
        this.pathCache.clear();

        // Mark obstacles
        for (const obs of obstacles) {
            const startCol = Math.max(0, Math.floor(obs.x / this.cellSize));
            const endCol = Math.min(this.cols - 1, Math.floor((obs.x + obs.w) / this.cellSize));
            const startRow = Math.max(0, Math.floor(obs.y / this.cellSize));
            const endRow = Math.min(this.rows - 1, Math.floor((obs.y + obs.h) / this.cellSize));

            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                    this.grid[r * this.cols + c] = 1;
                }
            }
        }
    }

    isWalkable(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
        return this.grid[row * this.cols + col] === 0;
    }

    findPath(startX, startY, endX, endY) {
        const startCol = Math.floor(startX / this.cellSize);
        const startRow = Math.floor(startY / this.cellSize);
        const endCol = Math.floor(endX / this.cellSize);
        const endRow = Math.floor(endY / this.cellSize);

        if (!this.isWalkable(startCol, startRow) || !this.isWalkable(endCol, endRow)) {
            return [{ x: endX, y: endY }];
        }

        // T12.2: Path Caching
        const cacheKey = `${startCol},${startRow}_to_${endCol},${endRow}`;
        if (this.pathCache.has(cacheKey)) {
            return this.pathCache.get(cacheKey);
        }

        // Optimized A* with Priority Queue (T12.1)
        const openSet = new PriorityQueue((a, b) => a.f < b.f);
        const closedSet = new Set();
        const cameFrom = new Map();

        const gScore = new Map();
        const startId = `${startCol},${startRow}`;
        const endId = `${endCol},${endRow}`;

        gScore.set(startId, 0);
        openSet.push({ id: startId, f: this.heuristic(startCol, startRow, endCol, endRow) });

        const inOpenSet = new Set([startId]);

        while (openSet.size() > 0) {
            const current = openSet.pop();
            const currentId = current.id;
            inOpenSet.delete(currentId);

            if (currentId === endId) {
                const path = this.reconstructPath(cameFrom, currentId);
                // Cache the path
                if (this.pathCache.size < 500) {
                    this.pathCache.set(cacheKey, path);
                }
                return path;
            }

            closedSet.add(currentId);

            const [curCol, curRow] = currentId.split(',').map(Number);

            const neighbors = [
                [0, -1], [1, 0], [0, 1], [-1, 0],
                [1, -1], [1, 1], [-1, 1], [-1, -1]
            ];

            for (const [dc, dr] of neighbors) {
                const neighborCol = curCol + dc;
                const neighborRow = curRow + dr;
                
                if (dc !== 0 && dr !== 0) {
                    if (!this.isWalkable(curCol + dc, curRow) || !this.isWalkable(curCol, curRow + dr)) {
                        continue;
                    }
                }

                if (!this.isWalkable(neighborCol, neighborRow)) continue;

                const neighborId = `${neighborCol},${neighborRow}`;
                if (closedSet.has(neighborId)) continue;

                const dist = (dc === 0 || dr === 0) ? 1 : 1.414;
                const tentativeGScore = gScore.get(currentId) + dist;

                if (tentativeGScore < (gScore.get(neighborId) || Infinity)) {
                    cameFrom.set(neighborId, currentId);
                    gScore.set(neighborId, tentativeGScore);
                    const f = tentativeGScore + this.heuristic(neighborCol, neighborRow, endCol, endRow);
                    
                    if (!inOpenSet.has(neighborId)) {
                        openSet.push({ id: neighborId, f });
                        inOpenSet.add(neighborId);
                    }
                }
            }
        }

        return [{ x: endX, y: endY }];
    }

    heuristic(col1, row1, col2, row2) {
        // Octile distance
        const dx = Math.abs(col1 - col2);
        const dy = Math.abs(row1 - row2);
        return 1 * (dx + dy) + (1.414 - 2 * 1) * Math.min(dx, dy);
    }

    reconstructPath(cameFrom, currentId) {
        const path = [];
        let curr = currentId;
        
        while (cameFrom.has(curr)) {
            const [c, r] = curr.split(',').map(Number);
            path.unshift({
                x: c * this.cellSize + (this.cellSize / 2),
                y: r * this.cellSize + (this.cellSize / 2)
            });
            curr = cameFrom.get(curr);
        }
        
        return path;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r * this.cols + c] === 1) {
                    ctx.fillRect(c * this.cellSize, r * this.cellSize, this.cellSize, this.cellSize);
                }
            }
        }
        ctx.restore();
    }
}
