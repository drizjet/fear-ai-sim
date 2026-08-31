/**
 * Quadtree implementation for spatial partitioning
 */
export class Point {
    constructor(x, y, data) {
        this.x = x;
        this.y = y;
        this.data = data; // Reference to the agent
    }
}

export class Boundary {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    contains(point) {
        return (point.x >= this.x - this.w &&
            point.x <= this.x + this.w &&
            point.y >= this.y - this.h &&
            point.y <= this.y + this.h);
    }

    intersects(range) {
        return !(range.x - range.w > this.x + this.w ||
            range.x + range.w < this.x - this.w ||
            range.y - range.h > this.y + this.h ||
            range.y + range.h < this.y - this.h);
    }
}

export class QuadTree {
    constructor(boundary, capacity) {
        this.boundary = boundary;
        this.capacity = capacity;
        this.points = [];
        this.divided = false;
    }

    subdivide() {
        let x = this.boundary.x;
        let y = this.boundary.y;
        let w = this.boundary.w / 2;
        let h = this.boundary.h / 2;

        let ne = new Boundary(x + w, y - h, w, h);
        this.northEast = new QuadTree(ne, this.capacity);
        let nw = new Boundary(x - w, y - h, w, h);
        this.northWest = new QuadTree(nw, this.capacity);
        let se = new Boundary(x + w, y + h, w, h);
        this.southEast = new QuadTree(se, this.capacity);
        let sw = new Boundary(x - w, y + h, w, h);
        this.southWest = new QuadTree(sw, this.capacity);

        this.divided = true;
    }

    insert(point) {
        if (!this.boundary.contains(point)) {
            return false;
        }

        if (this.points.length < this.capacity) {
            this.points.push(point);
            return true;
        } else {
            if (!this.divided) {
                this.subdivide();
            }

            if (this.northEast.insert(point)) return true;
            if (this.northWest.insert(point)) return true;
            if (this.southEast.insert(point)) return true;
            if (this.southWest.insert(point)) return true;
        }
    }

    query(range, found = []) {
        if (!this.boundary.intersects(range)) {
            return found;
        } else {
            for (let p of this.points) {
                if (range.contains(p)) {
                    found.push(p);
                }
            }
            if (this.divided) {
                this.northWest.query(range, found);
                this.northEast.query(range, found);
                this.southWest.query(range, found);
                this.southEast.query(range, found);
            }
        }
        return found;
    }
}
