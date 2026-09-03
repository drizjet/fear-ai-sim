/**
 * 3D Viewport for Fear-AI Omniverse (Phase 10/11)
 * High-Performance Instanced Rendering for Thousands of Agents
 */

import * as THREE from 'three';

export class View3D {
    constructor(container, worldEnv) {
        this.container = container;
        this.worldEnv = worldEnv;
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#050505'); // Deep space
        this.scene.fog = new THREE.FogExp2('#050505', 0.001);
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 5000);
        this.camera.position.set(0, 400, 600);
        this.camera.lookAt(0, 0, 0);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: false }); // Disable for performance
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1.5 : 1);
        this.container.appendChild(this.renderer.domElement);
        
        // WORLD-CLASS PERFORMANCE: Instanced Meshes
        this.maxAgents = 5000;
        this.agentGeometry = new THREE.CylinderGeometry(0, 6, 12, 3); // Triangle cones
        this.agentMaterial = new THREE.MeshPhongMaterial({ flatShading: true });
        this.agentInstances = new THREE.InstancedMesh(this.agentGeometry, this.agentMaterial, this.maxAgents);
        this.agentInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.agentInstances);

        this.maxPredators = 100;
        this.predatorGeometry = new THREE.IcosahedronGeometry(12, 0);
        this.predatorMaterial = new THREE.MeshPhongMaterial({ color: '#ff0055', emissive: '#330011' });
        this.predatorInstances = new THREE.InstancedMesh(this.predatorGeometry, this.predatorMaterial, this.maxPredators);
        this.predatorInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.predatorInstances);

        // Dummy objects for matrix math
        this._dummy = new THREE.Object3D();
        this._color = new THREE.Color();
        
        // Controls
        this.moveState = { forward: false, back: false, left: false, right: false };
        this.yaw = 0;
        this.pitch = 0;
        
        this.initLights();
        this.buildTerrain();
        this.setupInput();
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            if (this.container.style.display === 'none') return;
            switch (e.code) {
                case 'KeyW': this.moveState.forward = true; break;
                case 'KeyS': this.moveState.back = true; break;
                case 'KeyA': this.moveState.left = true; break;
                case 'KeyD': this.moveState.right = true; break;
            }
        });

        window.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW': this.moveState.forward = false; break;
                case 'KeyS': this.moveState.back = false; break;
                case 'KeyA': this.moveState.left = false; break;
                case 'KeyD': this.moveState.right = false; break;
            }
        });

        this.container.addEventListener('mousedown', () => {
            if (this.container.style.display !== 'none') {
                this.container.requestPointerLock();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.container) {
                this.yaw -= e.movementX * 0.002;
                this.pitch -= e.movementY * 0.002;
                this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
                this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
            }
        });
    }

    initLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        const dirLight = new THREE.DirectionalLight(0x00f2ff, 0.8);
        dirLight.position.set(1, 1, 1);
        this.scene.add(dirLight);
    }

    buildTerrain() {
        // High-performance ground plane
        const gridHelper = new THREE.GridHelper(2000, 50, '#00ff88', '#222');
        this.scene.add(gridHelper);
        
        const groundGeo = new THREE.PlaneGeometry(2000, 2000);
        const groundMat = new THREE.MeshPhongMaterial({ color: '#050505' });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        this.scene.add(ground);
    }

    update(agents, predators) {
        // 1. Camera Logic
        const speed = 8.0;
        const camDir = new THREE.Vector3(0, 0, 0);
        if (this.moveState.forward) camDir.z -= 1;
        if (this.moveState.back) camDir.z += 1;
        if (this.moveState.left) camDir.x -= 1;
        if (this.moveState.right) camDir.x += 1;
        
        camDir.normalize().applyQuaternion(this.camera.quaternion);
        this.camera.position.addScaledVector(camDir, speed);

        // 2. Instanced Agent Rendering
        const agentCount = Math.min(agents.length, this.maxAgents);
        this.agentInstances.count = agentCount;

        for (let i = 0; i < agentCount; i++) {
            const a = agents[i];
            this._dummy.position.set(
                a.x - this.worldEnv.width / 2,
                6,
                a.y - this.worldEnv.height / 2
            );
            
            // Orient based on velocity
            const angle = Math.atan2(a.vx, a.vy);
            this._dummy.rotation.set(0, angle, Math.PI / 2);
            
            // Scale based on energy
            const s = (a.energy / 100) * 0.5 + 0.5;
            this._dummy.scale.set(s, s, s);
            
            this._dummy.updateMatrix();
            this.agentInstances.setMatrixAt(i, this._dummy.matrix);
            
            // Color based on fear
            this._color.setHSL(0.6 - a.brain.currentFear * 0.6, 1, 0.5);
            this.agentInstances.setColorAt(i, this._color);
        }
        this.agentInstances.instanceMatrix.needsUpdate = true;
        if (this.agentInstances.instanceColor) this.agentInstances.instanceColor.needsUpdate = true;

        // 3. Instanced Predator Rendering
        const predCount = Math.min(predators.length, this.maxPredators);
        this.predatorInstances.count = predCount;

        for (let i = 0; i < predCount; i++) {
            const p = predators[i];
            this._dummy.position.set(
                p.x - this.worldEnv.width / 2,
                15,
                p.y - this.worldEnv.height / 2
            );
            const pulse = Math.sin(Date.now() * 0.01) * 0.2 + 1.0;
            this._dummy.scale.set(pulse, pulse, pulse);
            this._dummy.updateMatrix();
            this.predatorInstances.setMatrixAt(i, this._dummy.matrix);
        }
        this.predatorInstances.instanceMatrix.needsUpdate = true;

        this.renderer.render(this.scene, this.camera);
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
