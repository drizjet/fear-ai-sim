/**
 * examples/reference-game/DungeonEngine.js
 *
 * Pre-existing 2D Grid Dungeon Crawler Game Engine.
 * Represents an independent host game with complete authority over:
 * - Map geometry and obstacle collision
 * - Entity positioning and movement validation
 * - Health points, damage, and death
 * - Inventory and item pickups
 * - Line-of-sight perception queries
 *
 * This file has ZERO dependencies on Fear AI internals.
 */

export const TILE_TYPES = Object.freeze({
    FLOOR: 0,
    WALL: 1,
    DOOR: 2,
    SANCTUARY: 3
});

export class GridWorld {
    constructor(width = 20, height = 20) {
        this.width = width;
        this.height = height;
        // 2D grid: 0 = floor, 1 = wall
        this.grid = Array.from({ length: height }, () => Array(width).fill(TILE_TYPES.FLOOR));

        // Create boundary walls
        for (let x = 0; x < width; x++) {
            this.grid[0][x] = TILE_TYPES.WALL;
            this.grid[height - 1][x] = TILE_TYPES.WALL;
        }
        for (let y = 0; y < height; y++) {
            this.grid[y][0] = TILE_TYPES.WALL;
            this.grid[y][width - 1] = TILE_TYPES.WALL;
        }

        // Add interior rooms and corridors
        for (let y = 6; y < 14; y++) {
            this.grid[y][10] = TILE_TYPES.WALL; // Dividing wall
        }
        this.grid[10][10] = TILE_TYPES.DOOR; // Doorway
        this.grid[2][2] = TILE_TYPES.SANCTUARY; // Safe haven
    }

    isWalkable(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
        return this.grid[y][x] !== TILE_TYPES.WALL;
    }

    hasLineOfSight(x0, y0, x1, y1) {
        // Bresenham's line algorithm for line-of-sight
        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1;
        let sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        let currX = x0;
        let currY = y0;

        while (true) {
            if (currX === x1 && currY === y1) return true;
            if (this.grid[currY][currX] === TILE_TYPES.WALL) return false;
            let e2 = 2 * err;
            if (e2 > -dy) { err -= dy; currX += sx; }
            if (e2 < dx) { err += dx; currY += sy; }
        }
    }

    findPathBFS(startX, startY, targetX, targetY) {
        if (!this.isWalkable(targetX, targetY)) return [];

        const queue = [[startX, startY]];
        const visited = new Set([`${startX},${startY}`]);
        const parentMap = new Map();

        const directions = [
            [0, -1], [0, 1], [-1, 0], [1, 0]
        ];

        while (queue.length > 0) {
            const [cx, cy] = queue.shift();
            if (cx === targetX && cy === targetY) {
                // Reconstruct path
                const path = [];
                let curr = `${targetX},${targetY}`;
                while (curr !== `${startX},${startY}`) {
                    const [px, py] = curr.split(',').map(Number);
                    path.unshift({ x: px, y: py });
                    curr = parentMap.get(curr);
                }
                return path;
            }

            for (const [dx, dy] of directions) {
                const nx = cx + dx;
                const ny = cy + dy;
                const key = `${nx},${ny}`;
                if (this.isWalkable(nx, ny) && !visited.has(key)) {
                    visited.add(key);
                    parentMap.set(key, `${cx},${cy}`);
                    queue.push([nx, ny]);
                }
            }
        }
        return []; // No path
    }
}

export class DungeonEntity {
    constructor(id, name, x, y, maxHealth = 100, role = 'CIVILIAN') {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.health = maxHealth;
        this.maxHealth = maxHealth;
        this.role = role; // 'GUARD', 'CIVILIAN', 'SCOUT', 'MONSTER'
        this.alive = true;
        this.inventory = [];
        this.lastDamageTaken = 0;
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        this.lastDamageTaken = amount;
        if (this.health <= 0) {
            this.alive = false;
        }
        return this.alive;
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }
}

export class DungeonGameSimulation {
    constructor() {
        this.world = new GridWorld(20, 20);
        this.entities = new Map();
        this.turn = 0;
        this.combatLog = [];
    }

    spawnEntity(entity) {
        if (this.world.isWalkable(entity.x, entity.y)) {
            this.entities.set(entity.id, entity);
            return true;
        }
        return false;
    }

    moveEntity(id, targetX, targetY) {
        const ent = this.entities.get(id);
        if (!ent || !ent.alive) return false;

        // Verify target is adjacent and walkable (host game movement authority)
        const dx = Math.abs(ent.x - targetX);
        const dy = Math.abs(ent.y - targetY);
        if ((dx + dy === 1) && this.world.isWalkable(targetX, targetY)) {
            ent.x = targetX;
            ent.y = targetY;
            return true;
        }
        return false;
    }

    resolveAuthoritativeAttack(attackerId, defenderId, baseDamage = 25) {
        const attacker = this.entities.get(attackerId);
        const defender = this.entities.get(defenderId);
        if (!attacker || !defender || !attacker.alive || !defender.alive) return false;

        // Check melee distance (adjacent)
        const dist = Math.hypot(attacker.x - defender.x, attacker.y - defender.y);
        if (dist <= 1.5) {
            const survived = defender.takeDamage(baseDamage);
            this.combatLog.push({
                turn: this.turn,
                attacker: attacker.name,
                defender: defender.name,
                damage: baseDamage,
                survived
            });
            return true;
        }
        return false;
    }
}
