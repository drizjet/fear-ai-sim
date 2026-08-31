use serde::{Serialize, Deserialize};
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RustAgent {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub radius: f32,
    pub fear: f32,
    pub dead: bool,
}

pub struct SimulationEngine {
    pub agents: Vec<RustAgent>,
    pub width: f32,
    pub height: f32,
}

impl SimulationEngine {
    pub fn new(width: f32, height: f32) -> Self {
        Self {
            agents: Vec::new(),
            width,
            height,
        }
    }

    pub fn update(&mut self) {
        // High-performance movement loop
        for agent in &mut self.agents {
            if agent.dead { continue; }

            // Apply velocity
            agent.x += agent.vx;
            agent.y += agent.vy;

            // Simple friction
            agent.vx *= 0.99;
            agent.vy *= 0.99;

            // Boundary collision
            if agent.x < 0.0 { agent.x = 0.0; agent.vx *= -0.5; }
            if agent.x > self.width { agent.x = self.width; agent.vx *= -0.5; }
            if agent.y < 0.0 { agent.y = 0.0; agent.vy *= -0.5; }
            if agent.y > self.height { agent.y = self.height; agent.vy *= -0.5; }
        }
    }
}

pub struct EngineState {
    pub engine: Mutex<SimulationEngine>,
}
