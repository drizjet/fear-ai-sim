/**
 * Mock for Three.js
 */
const createObject3D = () => {
    const obj = {
        position: { 
            x: 0, y: 0, z: 0, 
            set: function(x,y,z) { this.x=x; this.y=y; this.z=z; return this; },
            addScaledVector: function(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; },
            copy: function(v) { this.x=v.x; this.y=v.y; this.z=v.z; return this; }
        },
        rotation: { 
            x: 0, y: 0, z: 0, 
            set: function(x,y,z) { this.x=x; this.y=y; this.z=z; return this; } 
        },
        quaternion: { setFromEuler: function() {} },
        add: function() {},
        lookAt: function() {}
    };
    return obj;
};

export const Scene = class { 
    constructor() { Object.assign(this, createObject3D()); }
};
export const PerspectiveCamera = class { 
    constructor() { Object.assign(this, createObject3D()); }
    updateProjectionMatrix() {} 
};
export const WebGLRenderer = class { 
    constructor() { this.domElement = document.createElement('div'); }
    setSize() {}
    setPixelRatio() {}
    render() {}
};
export const AmbientLight = class {};
export const DirectionalLight = class { 
    constructor() { this.position = { set: function() {} }; }
};
export const FogExp2 = class {
    constructor(color, density) { this.color = color; this.density = density; }
};
export const BoxGeometry = class {};
export const SphereGeometry = class {};
export const CylinderGeometry = class {};
export const IcosahedronGeometry = class {};
export const PlaneGeometry = class {};
export const GridHelper = class {};
export const DynamicDrawUsage = 0;
export const Object3D = class {
    constructor() { Object.assign(this, createObject3D()); }
    updateMatrix() {}
};
export const InstancedMesh = class {
    constructor() {
        Object.assign(this, createObject3D());
        this.instanceMatrix = { setUsage: function() {}, setXYZAt: function() {}, needsUpdate: false };
        this.setColorAt = function() {};
        this.count = 0;
    }
};
export const MeshPhongMaterial = class {
    constructor(opts = {}) {
        this.color = { set: function() {}, setHSL: function() {} };
        this.emissive = { set: function() {} };
        Object.assign(this, opts);
    }
};
export const MeshStandardMaterial = class { 
    constructor() { this.color = { setHSL: function() {} }; }
};
export const Mesh = class { 
    constructor() { 
        Object.assign(this, createObject3D()); 
        this.material = { color: { setHSL: function() {} } };
    }
};
export const Color = class { 
    constructor() { this.r = 0; this.g = 0; this.b = 0; }
    set() {} 
};
export const Vector3 = class { 
    constructor(x=0, y=0, z=0) { this.x=x; this.y=y; this.z=z; }
    set(x,y,z) { this.x=x; this.y=y; this.z=z; return this; }
    normalize() { return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    applyAxisAngle() { return this; }
};
export const Euler = class { 
    constructor(x=0, y=0, z=0, order='XYZ') { this.x=x; this.y=y; this.z=z; this.order=order; }
};
export const Quaternion = class { 
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
    setFromEuler() {} 
};
