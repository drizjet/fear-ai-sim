/**
 * DangerMap: A grid-based memory system for agents to remember environmental risks
 */
export class DangerMap {
    constructor(width, height, resolution = 40) {
        this.width = width;
        this.height = height;
        this.res = resolution;
        this.cols = Math.ceil(width / resolution);
        this.rows = Math.ceil(height / resolution);
        this.grid = new Float32Array(this.cols * this.rows);
    }

    record(x, y, intensity = 0.5) {
        const c = Math.floor(x / this.res);
        const r = Math.floor(y / this.res);
        if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
            this.grid[r * this.cols + c] = Math.min(1.0, this.grid[r * this.cols + c] + intensity);
        }
    }

    getRisk(x, y) {
        const c = Math.floor(x / this.res);
        const r = Math.floor(y / this.res);
        if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
            return this.grid[r * this.cols + c];
        }
        return 0;
    }

    decay(rate = 0.995) {
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i] *= rate;
        }
    }

    save() {
        localStorage.setItem('fear_ai_danger_map', JSON.stringify(Array.from(this.grid)));
    }

    load() {
        const data = localStorage.getItem('fear_ai_danger_map');
        if (data) {
            const arr = JSON.parse(data);
            if (arr.length === this.grid.length) {
                this.grid.set(arr);
                return true;
            }
        }
        return false;
    }
}
