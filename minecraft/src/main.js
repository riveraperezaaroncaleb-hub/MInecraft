import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createNoise2D } from 'simplex-noise';

// --- INIT ENGINE ---
const container = document.getElementById('game-container');
const scene = new THREE.Scene();

// Beautiful sky color
const skyColor = new THREE.Color(0x87CEEB);
scene.background = skyColor;
scene.fog = new THREE.FogExp2(skyColor, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(100, 200, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 500;
const d = 100;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
scene.add(dirLight);

// --- CONTROLS & UI ---
const controls = new PointerLockControls(camera, document.body);
const startBtn = document.getElementById('start-btn');
const menu = document.getElementById('menu');
const statsEl = document.getElementById('stats');

startBtn.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => menu.style.display = 'none');
controls.addEventListener('unlock', () => menu.style.display = 'flex');

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- TEXTURE GENERATION ---
// Simple pixelated textures using Canvas for now to not rely on external assets
function createBlockTexture(colorBase, colorDark, colorHighlight, type = 'solid') {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    
    // Fill base
    ctx.fillStyle = colorBase;
    ctx.fillRect(0, 0, 16, 16);
    
    // Noise/Detail
    for(let i=0; i<40; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? colorDark : colorHighlight;
        ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
    }
    
    // Borders
    if(type === 'solid') {
        ctx.fillStyle = colorHighlight;
        ctx.fillRect(0, 0, 16, 1);
        ctx.fillRect(0, 0, 1, 16);
        ctx.fillStyle = colorDark;
        ctx.fillRect(15, 0, 1, 16);
        ctx.fillRect(0, 15, 16, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshLambertMaterial({ map: texture });
}

const materials = {
    dirt: createBlockTexture('#8B5A2B', '#5c3a18', '#a8733b'),
    grass: [
        createBlockTexture('#8B5A2B', '#5c3a18', '#a8733b'), // Right (dirt)
        createBlockTexture('#8B5A2B', '#5c3a18', '#a8733b'), // Left (dirt)
        createBlockTexture('#556B2F', '#3b4d1c', '#759142'), // Top (grass)
        createBlockTexture('#8B5A2B', '#5c3a18', '#a8733b'), // Bottom (dirt)
        createBlockTexture('#8B5A2B', '#5c3a18', '#a8733b'), // Front (dirt)
        createBlockTexture('#8B5A2B', '#5c3a18', '#a8733b'), // Back (dirt)
    ],
    stone: createBlockTexture('#808080', '#505050', '#a0a0a0'),
    wood: createBlockTexture('#6B4226', '#3e2413', '#8f5c38'),
    leaves: createBlockTexture('#228B22', '#145214', '#32cd32', 'transparent'),
};
materials.leaves.transparent = true;
materials.leaves.opacity = 0.8;
materials.leaves.side = THREE.DoubleSide;

const blockGeom = new THREE.BoxGeometry(1, 1, 1);

// --- PROCEDURAL GENERATION ---
const noise2D = createNoise2D();
const chunkSize = 16;
const renderDistance = 3;
const activeChunks = new Map();

function generateChunk(cx, cz) {
    const chunkGroup = new THREE.Group();
    chunkGroup.position.set(cx * chunkSize, 0, cz * chunkSize);
    
    const blockData = {
        grass: [], dirt: [], stone: [], wood: [], leaves: []
    };

    for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
            const worldX = cx * chunkSize + x;
            const worldZ = cz * chunkSize + z;
            
            // Multiple octaves for smoother terrain
            let e = 1 * noise2D(worldX * 0.02, worldZ * 0.02) + 
                    0.5 * noise2D(worldX * 0.05, worldZ * 0.05) + 
                    0.25 * noise2D(worldX * 0.1, worldZ * 0.1);
            e = e / (1 + 0.5 + 0.25);
            
            const h = Math.floor((e + 1) * 0.5 * 30) + 10;
            
            for (let y = 0; y <= h; y++) {
                let type = 'stone';
                if (y === h) type = 'grass';
                else if (y > h - 4) type = 'dirt';
                
                blockData[type].push(new THREE.Vector3(x, y, z));
            }
            
            // Trees
            if (h > 12 && Math.random() < 0.015) {
                const treeHeight = 4 + Math.floor(Math.random() * 3);
                for(let ty = 1; ty <= treeHeight; ty++) {
                    blockData.wood.push(new THREE.Vector3(x, h + ty, z));
                }
                for(let lx = -2; lx <= 2; lx++) {
                    for(let lz = -2; lz <= 2; lz++) {
                        for(let ly = 0; ly <= 2; ly++) {
                            if (lx*lx + lz*lz + ly*ly <= 5) {
                                blockData.leaves.push(new THREE.Vector3(x + lx, h + treeHeight - 1 + ly, z + lz));
                            }
                        }
                    }
                }
            }
        }
    }

    for (const [type, positions] of Object.entries(blockData)) {
        if (positions.length === 0) continue;
        const mat = materials[type];
        const instancedMesh = new THREE.InstancedMesh(blockGeom, mat, positions.length);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        
        const dummy = new THREE.Object3D();
        positions.forEach((pos, i) => {
            dummy.position.copy(pos);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        });
        
        chunkGroup.add(instancedMesh);
    }

    scene.add(chunkGroup);
    activeChunks.set(`${cx},${cz}`, chunkGroup);
}

// Generate initial area
for (let cx = -renderDistance; cx <= renderDistance; cx++) {
    for (let cz = -renderDistance; cz <= renderDistance; cz++) {
        generateChunk(cx, cz);
    }
}

// --- PLAYER PHYSICS & LOGIC ---
camera.position.set(0, 50, 0);

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveSpeed = 10;
const gravity = 35;
let canJump = false;

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
document.addEventListener('keydown', (e) => {
    if(!controls.isLocked) return;
    switch (e.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space': keys.space = true; break;
        case 'ShiftLeft': keys.shift = true; break;
    }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
        case 'ShiftLeft': keys.shift = false; break;
    }
});

// HUD Logic
let activeSlot = 1;
document.addEventListener('wheel', (e) => {
    if(!controls.isLocked) return;
    document.getElementById(`slot-${activeSlot}`).classList.remove('active');
    if (e.deltaY > 0) activeSlot = activeSlot < 9 ? activeSlot + 1 : 1;
    else activeSlot = activeSlot > 1 ? activeSlot - 1 : 9;
    document.getElementById(`slot-${activeSlot}`).classList.add('active');
});

// Add block logic (MVP click to add a floating block)
document.addEventListener('mousedown', (e) => {
    if(!controls.isLocked) return;
    if (e.button === 0 || e.button === 2) {
        // Just place a block in front of camera for MVP
        const matIdx = activeSlot === 1 ? 'grass' : activeSlot === 2 ? 'stone' : activeSlot === 3 ? 'wood' : 'dirt';
        const mesh = new THREE.Mesh(blockGeom, materials[matIdx]);
        mesh.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3));
        mesh.position.round(); // Snap to grid
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    }
});

// --- GAME LOOP ---
let prevTime = performance.now();
let frames = 0;
let lastFpsTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1);
    prevTime = time;

    frames++;
    if (time - lastFpsTime >= 1000) {
        statsEl.innerHTML = `FPS: ${frames}<br>Chunks: ${activeChunks.size}<br>Pos: ${Math.round(camera.position.x)}, ${Math.round(camera.position.y)}, ${Math.round(camera.position.z)}`;
        frames = 0;
        lastFpsTime = time;
    }

    if (controls.isLocked) {
        moveSpeed = keys.shift ? 16 : 10;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= gravity * delta;

        direction.z = Number(keys.w) - Number(keys.s);
        direction.x = Number(keys.d) - Number(keys.a);
        direction.normalize();

        if (keys.w || keys.s) velocity.z -= direction.z * moveSpeed * delta;
        if (keys.a || keys.d) velocity.x -= direction.x * moveSpeed * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        camera.position.y += velocity.y * delta;

        // Simple mock collision with terrain height
        const worldX = camera.position.x;
        const worldZ = camera.position.z;
        let e = 1 * noise2D(worldX * 0.02, worldZ * 0.02) + 
                0.5 * noise2D(worldX * 0.05, worldZ * 0.05) + 
                0.25 * noise2D(worldX * 0.1, worldZ * 0.1);
        e = e / (1 + 0.5 + 0.25);
        const terrainHeight = Math.floor((e + 1) * 0.5 * 30) + 10;
        
        const playerHeight = terrainHeight + 2;

        if (camera.position.y < playerHeight) {
            velocity.y = 0;
            camera.position.y = playerHeight;
            canJump = true;
        }

        if (keys.space && canJump) {
            velocity.y += 12;
            canJump = false;
        }
    }

    renderer.render(scene, camera);
}

animate();
