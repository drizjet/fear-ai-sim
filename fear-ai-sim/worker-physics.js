/**
 * worker-physics.js - High-Performance Parallel Physics Engine (Phase 3.6)
 * Optimized for thousands of agents using local spatial partitioning.
 */

self.onmessage = function(e) {
    const { type, payload } = e.data;

    if (type === 'UPDATE_BATCH') {
        const { agents, predators, width, height, allAgents } = payload;
        const results = [];

        // 1. Build local spatial grid for this batch's neighborhood
        const cellSize = 50;
        const grid = new Map();
        
        // We use allAgents (lightweight pos data) to check neighbors
        for (let i = 0; i < allAgents.length; i++) {
            const a = allAgents[i];
            const gx = Math.floor(a.x / cellSize);
            const gy = Math.floor(a.y / cellSize);
            const key = `${gx},${gy}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(a);
        }

        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (agent.dead) continue;

            // 2. Advanced Social Forces (Boids: Separation, Alignment, Cohesion)
            let sepX = 0, sepY = 0;
            let aliX = 0, aliY = 0;
            let cohX = 0, cohY = 0;
            let neighborCount = 0;

            const gx = Math.floor(agent.x / cellSize);
            const gy = Math.floor(agent.y / cellSize);

            // Check 3x3 grid neighborhood
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    const key = `${gx + x},${gy + y}`;
                    const neighbors = grid.get(key);
                    if (!neighbors) continue;

                    for (let j = 0; j < neighbors.length; j++) {
                        const other = neighbors[j];
                        if (other.id === agent.id) continue;

                        const dx = agent.x - other.x;
                        const dy = agent.y - other.y;
                        const distSq = dx*dx + dy*dy;

                        if (distSq < 2500) { // 50px radius
                            const dist = Math.sqrt(distSq);
                            // Separation
                            sepX += dx / dist;
                            sepY += dy / dist;
                            
                            // Alignment & Cohesion (simplified)
                            aliX += other.vx;
                            aliY += other.vy;
                            cohX += other.x;
                            cohY += other.y;
                            neighborCount++;
                        }
                    }
                }
            }

            if (neighborCount > 0) {
                agent.vx += (sepX / neighborCount) * 0.2;
                agent.vy += (sepY / neighborCount) * 0.2;
                agent.vx += (aliX / neighborCount - agent.vx) * 0.05;
                agent.vy += (aliY / neighborCount - agent.vy) * 0.05;
                agent.vx += (cohX / neighborCount - agent.x) * 0.01;
                agent.vy += (cohY / neighborCount - agent.y) * 0.01;
            }

            // 3. Threat Avoidance
            let nearestThreatDist = Infinity;
            for (let j = 0; j < predators.length; j++) {
                const p = predators[j];
                const dx = agent.x - p.x;
                const dy = agent.y - p.y;
                const distSq = dx*dx + dy*dy;
                
                if (distSq < 40000) { // 200px
                    const dist = Math.sqrt(distSq);
                    const force = (1 - dist / 200) * 2.0;
                    agent.vx += (dx / dist) * force;
                    agent.vy += (dy / dist) * force;
                    if (dist < nearestThreatDist) nearestThreatDist = dist;
                }
            }

            // 4. Update Fear & Physics
            if (nearestThreatDist < 150) {
                agent.fear = Math.min(1.0, agent.fear + 0.1);
            } else {
                agent.fear *= 0.98;
            }

            agent.x += agent.vx;
            agent.y += agent.vy;
            agent.vx *= 0.92;
            agent.vy *= 0.92;

            // Bounds
            if (agent.x < 0) { agent.x = 0; agent.vx *= -0.5; }
            if (agent.x > width) { agent.x = width; agent.vx *= -0.5; }
            if (agent.y < 0) { agent.y = 0; agent.vy *= -0.5; }
            if (agent.y > height) { agent.y = height; agent.vy *= -0.5; }

            results.push({
                id: agent.id,
                x: agent.x,
                y: agent.y,
                vx: agent.vx,
                vy: agent.vy,
                fear: agent.fear
            });
        }

        self.postMessage({ type: 'BATCH_COMPLETE', result: results });
    }
};
