import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createNoise2D } from 'simplex-noise';
import { io } from "socket.io-client";

// --- MULTIPLAYER SETUP ---
// Connects to the server
const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3000' : undefined);
const otherPlayers = {};
const playerGeom = new THREE.BoxGeometry(0.6, 1.8, 0.6);
const playerMat = new THREE.MeshLambertMaterial({ color: 0x3366ff });

function spawnOtherPlayer(id, data) {
    const mesh = new THREE.Mesh(playerGeom, playerMat);
    mesh.position.set(data.x, data.y, data.z);
    scene.add(mesh);
    otherPlayers[id] = mesh;
}

socket.on('init', (data) => {
    for (let id in data.players) {
        if (id !== socket.id) spawnOtherPlayer(id, data.players[id]);
    }
    data.modifiedBlocks.forEach(b => {
        if (b.type) {
            const mesh = new THREE.Mesh(blockGeom, materials[b.type]);
            mesh.position.set(b.x, b.y, b.z);
            scene.add(mesh);
            interactableObjects.push(mesh);
            setBlock(b.x, b.y, b.z, b.type);
        } else {
            setBlock(b.x, b.y, b.z, null);
        }
    });
});

socket.on('playerJoined', (id) => spawnOtherPlayer(id, {x:0, y:100, z:0, r:0}));
socket.on('playerLeft', (id) => {
    if (otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; }
});
socket.on('playerMoved', (data) => {
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].position.set(data.data.x, data.data.y, data.data.z);
        otherPlayers[data.id].rotation.y = data.data.r;
    }
});
socket.on('blockUpdate', (b) => {
    if (b.type) {
        const mesh = new THREE.Mesh(blockGeom, materials[b.type]);
        mesh.position.set(b.x, b.y, b.z);
        scene.add(mesh); interactableObjects.push(mesh); setBlock(b.x, b.y, b.z, b.type);
    } else {
        setBlock(b.x, b.y, b.z, null);
        // Removing the exact mesh visual is harder remotely, but the physics block is removed.
    }
});

// --- INIT ENGINE ---
const container = document.getElementById('game-container');
const scene = new THREE.Scene();

const skyDayColor = new THREE.Color(0x71a5d4);
const skyNightColor = new THREE.Color(0x020205);

scene.background = skyDayColor.clone();
scene.fog = new THREE.FogExp2(skyDayColor, 0.015);

const camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.imageRendering = 'pixelated';

container.appendChild(renderer.domElement);

// --- LIGHTING ---
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x556B2F, 0.4);
hemiLight.position.set(0, 200, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff5b6, 1.2);
dirLight.position.set(100, 200, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 400;
const d = 100;
dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// --- CONTROLS & UI ---
const controls = new PointerLockControls(camera, document.body);
const startBtn = document.getElementById('start-btn');
const menu = document.getElementById('menu');
const statsEl = document.getElementById('stats');
const miningProgressUI = document.getElementById('mining-progress');
const miningBar = document.getElementById('mining-bar');

startBtn.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => menu.style.display = 'none');
controls.addEventListener('unlock', () => {
    if(invUI.style.display !== 'block') menu.style.display = 'flex';
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- TEXTURES ---
function createBlockTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    
    if (type === 'grass_top') {
        ctx.fillStyle = '#689f38'; ctx.fillRect(0,0,16,16);
        for(let i=0; i<40; i++) { ctx.fillStyle = Math.random()>0.5?'#558b2f':'#7cb342'; ctx.fillRect(Math.random()*16|0, Math.random()*16|0, 1, 1); }
    } else if (type === 'grass_side') {
        ctx.fillStyle = '#795548'; ctx.fillRect(0,0,16,16);
        for(let i=0; i<40; i++) { ctx.fillStyle = Math.random()>0.5?'#5d4037':'#8d6e63'; ctx.fillRect(Math.random()*16|0, Math.random()*16|0, 1, 1); }
        ctx.fillStyle = '#689f38';
        for(let x=0; x<16; x++) {
            let h = 3 + Math.random()*4|0;
            ctx.fillRect(x, 0, 1, h); ctx.fillStyle = Math.random()>0.5?'#558b2f':'#7cb342'; ctx.fillRect(x, h-1, 1, 1);
            ctx.fillStyle = '#689f38';
        }
    } else if (type === 'dirt') {
        ctx.fillStyle = '#795548'; ctx.fillRect(0,0,16,16);
        for(let i=0; i<50; i++) { ctx.fillStyle = Math.random()>0.5?'#5d4037':'#8d6e63'; ctx.fillRect(Math.random()*16|0, Math.random()*16|0, 1, 1); }
    } else if (type === 'stone') {
        ctx.fillStyle = '#9e9e9e'; ctx.fillRect(0,0,16,16);
        for(let i=0; i<60; i++) { ctx.fillStyle = Math.random()>0.5?'#757575':'#bdbdbd'; ctx.fillRect(Math.random()*16|0, Math.random()*16|0, 1, 1); }
        ctx.fillStyle = '#616161'; ctx.fillRect(0,0,16,1); ctx.fillRect(0,0,1,16);
    } else if (type === 'wood') {
        ctx.fillStyle = '#5d4037'; ctx.fillRect(0,0,16,16);
        for(let x=0; x<16; x+=3) { ctx.fillStyle = '#4e342e'; ctx.fillRect(x, 0, 1, 16); }
        for(let i=0; i<20; i++) { ctx.fillStyle = '#3e2723'; ctx.fillRect(Math.random()*16|0, Math.random()*16|0, 1, 1); }
    } else if (type === 'leaves') {
        ctx.fillStyle = '#2e7d32'; ctx.fillRect(0,0,16,16);
        for(let x=0; x<16; x+=2) { for(let y=0; y<16; y+=2) {
            ctx.fillStyle = Math.random()>0.5?'#1b5e20':(Math.random()>0.5?'#388e3c':'transparent'); ctx.fillRect(x, y, 2, 2);
        }}
    } else if (type === 'sand') {
        ctx.fillStyle = '#eaddca'; ctx.fillRect(0,0,16,16);
        for(let i=0; i<40; i++) { ctx.fillStyle = Math.random()>0.5?'#d4c4a8':'#f5deb3'; ctx.fillRect(Math.random()*16|0, Math.random()*16|0, 1, 1); }
    } else if (type === 'snow') {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,16,16);
        for(let i=0; i<25; i++) { ctx.fillStyle = '#e0e0e0'; ctx.fillRect(Math.random()*16|0, Math.random()*16|0, 1, 1); }
    } else if (type === 'cactus') {
        ctx.fillStyle = '#388e3c'; ctx.fillRect(0,0,16,16);
        ctx.fillStyle = '#1b5e20'; for(let x=2; x<16; x+=4) ctx.fillRect(x, 0, 1, 16);
        ctx.fillStyle = '#000000'; for(let i=0; i<20; i++) ctx.fillRect(Math.random()*16|0, Math.random()*16|0, 1, 1);
    }
    
    if(!['leaves', 'snow', 'grass_top', 'cactus'].includes(type)) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(15,0,1,16); ctx.fillRect(0,15,16,1);
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0,0,16,1); ctx.fillRect(0,0,1,16);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ 
        map: texture, roughness: type==='leaves'?1.0:0.8, transparent: type==='leaves', 
        opacity: type==='leaves'?0.9:1.0, side: type==='leaves'?THREE.DoubleSide:THREE.FrontSide, alphaTest: type==='leaves'?0.1:0
    });
}

const materials = {
    grass: [
        createBlockTexture('grass_side'), createBlockTexture('grass_side'), 
        createBlockTexture('grass_top'), createBlockTexture('dirt'), 
        createBlockTexture('grass_side'), createBlockTexture('grass_side'), 
    ],
    dirt: createBlockTexture('dirt'), stone: createBlockTexture('stone'),
    wood: createBlockTexture('wood'), leaves: createBlockTexture('leaves'),
    sand: createBlockTexture('sand'), snow: createBlockTexture('snow'), cactus: createBlockTexture('cactus'),
};

const blockGeom = new THREE.BoxGeometry(1, 1, 1);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0);

// --- WORLD DATA & COLLISION ---
const worldData = new Map();
let interactableObjects = [];

function getBlockKey(x, y, z) { return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`; }
function getBlock(x, y, z) { return worldData.get(getBlockKey(x, y, z)); }
function setBlock(x, y, z, type) {
    if (type) worldData.set(getBlockKey(x, y, z), type);
    else worldData.delete(getBlockKey(x, y, z));
}
function checkSolidBlock(x, y, z) {
    const b = getBlock(x, y, z); return b && b !== 'leaves';
}

function checkCollisionBox(x, y, z, radius, height) {
    const minX = Math.floor(x - radius); const maxX = Math.floor(x + radius);
    const minY = Math.floor(y); const maxY = Math.floor(y + height);
    const minZ = Math.floor(z - radius); const maxZ = Math.floor(z + radius);

    for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
                if (checkSolidBlock(bx, by, bz)) return true;
            }
        }
    }
    return false;
}

function hasSkyAccess(x, y, z) {
    const cx = Math.floor(x); const cz = Math.floor(z);
    for (let by = Math.floor(y); by <= Math.floor(y) + 15; by++) {
        if (checkSolidBlock(cx, by, cz)) return false;
    }
    return true;
}

// --- INVENTORY & CRAFTING ---
const inventory = { wood: 0, dirt: 0, stone: 0, sand: 0, leaves: 0, grass: 0, cactus: 0, snow: 0, planks: 0, sticks: 0 };
const tools = { sword: false, pickaxe: false };
const invUI = document.getElementById('inventory-ui');
const invList = document.getElementById('inv-list');

document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') {
        if (controls.isLocked) {
            controls.unlock();
            invUI.style.display = 'block';
            menu.style.display = 'none';
            updateInvUI();
        } else if (invUI.style.display === 'block') {
            invUI.style.display = 'none';
            controls.lock();
        }
    }
});

function updateInvUI() {
    invList.innerHTML = `
        <div>Madera (Tronco): ${inventory.wood}</div>
        <div>Tierra: ${inventory.dirt}</div>
        <div>Piedra: ${inventory.stone}</div>
        <div>Arena: ${inventory.sand}</div>
        <div style="color:#ffccaa">Tablones: ${inventory.planks}</div>
        <div style="color:#d4a373">Palos: ${inventory.sticks}</div>
        <div style="color:#ffcc00;">Espada de Piedra: ${tools.sword ? 'Sí' : 'No'}</div>
        <div style="color:#00ccff;">Pico de Piedra: ${tools.pickaxe ? 'Sí' : 'No'}</div>
    `;
}

document.getElementById('craft-planks').onclick = () => { if (inventory.wood >= 1) { inventory.wood -= 1; inventory.planks += 4; updateInvUI(); } };
document.getElementById('craft-sticks').onclick = () => { if (inventory.planks >= 2) { inventory.planks -= 2; inventory.sticks += 4; updateInvUI(); } };
document.getElementById('craft-sword').onclick = () => { if (inventory.stone >= 2 && inventory.sticks >= 1 && !tools.sword) { inventory.stone -= 2; inventory.sticks -= 1; tools.sword = true; updateInvUI(); } };
document.getElementById('craft-pickaxe').onclick = () => { if (inventory.stone >= 3 && inventory.sticks >= 2 && !tools.pickaxe) { inventory.stone -= 3; inventory.sticks -= 2; tools.pickaxe = true; updateInvUI(); } };

// --- ENTITIES ---
const entities = [];
const items = [];
const entMats = {
    pig: new THREE.MeshStandardMaterial({ color: 0xffaacc, roughness: 0.9 }),
    cow: new THREE.MeshStandardMaterial({ color: 0x442211, roughness: 0.9 }),
    zombie: new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 }), 
    creeper: new THREE.MeshStandardMaterial({ color: 0x64dd17, roughness: 0.9 }), 
    enderman: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }) 
};
const meatGeom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const meatMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.5 });

function spawnEntity(x, y, z, type) {
    const group = new THREE.Group();
    const isEnderman = type === 'enderman';
    const mat = entMats[type];
    
    const bodyGeom = isEnderman ? new THREE.BoxGeometry(0.6, 1.8, 0.6) : new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const body = new THREE.Mesh(bodyGeom, mat);
    body.position.y = isEnderman ? 0.9 : 0.3; body.castShadow = true; body.receiveShadow = true;
    
    const headGeom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const head = new THREE.Mesh(headGeom, mat);
    head.position.set(0, isEnderman ? 2.1 : 0.9, 0); head.castShadow = true; head.receiveShadow = true;
    
    if(isEnderman) {
        const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.1), new THREE.MeshBasicMaterial({color: 0xaa00ff}));
        eyes.position.set(0, 0, 0.3); head.add(eyes);
    } else if (type === 'creeper') {
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), new THREE.MeshBasicMaterial({color: 0x000000}));
        face.position.set(0, 0, 0.31); head.add(face);
    } else if (type === 'zombie') {
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), new THREE.MeshBasicMaterial({color: 0x111111}));
        face.position.set(0, -0.1, 0.31); head.add(face);
    }

    group.add(body); group.add(head); group.position.set(x, y, z); scene.add(group);
    
    interactableObjects.push(body, head);
    body.userData = { isEntity: true, parentGroup: group };
    head.userData = { isEntity: true, parentGroup: group };
    
    entities.push({
        type: type, mesh: group, velocity: new THREE.Vector3(),
        health: isEnderman ? 8 : (type === 'zombie' ? 5 : 4),
        isHostile: ['zombie', 'creeper', 'enderman'].includes(type),
        isAggro: type !== 'enderman', moveTimer: 0, attackTimer: 0,
        direction: new THREE.Vector2(), isDead: false
    });
}

function dropMeat(x, y, z) {
    const mesh = new THREE.Mesh(meatGeom, meatMat); mesh.position.set(x, y, z);
    mesh.castShadow = true; scene.add(mesh); items.push(mesh);
}

// --- PROCEDURAL GENERATION ---
const noise2D = createNoise2D();
const tempNoise2D = createNoise2D();
const chunkSize = 16;
const renderDistance = 4;

function getTerrainHeight(wx, wz) {
    let e = 1 * noise2D(wx * 0.015, wz * 0.015) + 0.5 * noise2D(wx * 0.05, wz * 0.05); e /= 1.5;
    return Math.floor((e + 1) * 0.5 * 25) + 10;
}

function generateChunk(cx, cz) {
    const chunkGroup = new THREE.Group();
    chunkGroup.position.set(cx * chunkSize, 0, cz * chunkSize);
    const blockData = { grass: [], dirt: [], stone: [], wood: [], leaves: [], sand: [], snow: [], cactus: [] };

    for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
            const worldX = cx * chunkSize + x; const worldZ = cz * chunkSize + z;
            const h = getTerrainHeight(worldX, worldZ);
            const temp = tempNoise2D(worldX * 0.01, worldZ * 0.01);
            
            let biome = 'plains'; let blockTop = 'grass'; let blockMid = 'dirt';
            if (temp > 0.3) { biome = 'desert'; blockTop = 'sand'; blockMid = 'sand'; } 
            else if (temp < -0.3) { biome = 'snow'; blockTop = 'snow'; blockMid = 'dirt'; }
            
            for (let y = 0; y <= h; y++) {
                let type = 'stone';
                if (y === h) type = blockTop; else if (y > h - 4) type = blockMid;
                blockData[type].push(new THREE.Vector3(x, y, z)); setBlock(worldX, y, worldZ, type);
            }
            
            if (biome === 'plains' && h > 12 && Math.random() < 0.02) {
                const treeHeight = 4 + Math.floor(Math.random() * 2);
                for(let ty = 1; ty <= treeHeight; ty++) { blockData.wood.push(new THREE.Vector3(x, h + ty, z)); setBlock(worldX, h + ty, worldZ, 'wood'); }
                for(let lx = -2; lx <= 2; lx++) {
                    for(let lz = -2; lz <= 2; lz++) {
                        for(let ly = 0; ly <= 2; ly++) {
                            if (lx*lx + lz*lz + ly*ly <= 5) { blockData.leaves.push(new THREE.Vector3(x + lx, h + treeHeight - 1 + ly, z + lz)); setBlock(worldX + lx, h + treeHeight - 1 + ly, worldZ + lz, 'leaves'); }
                        }
                    }
                }
            } else if (biome === 'desert' && h > 12 && Math.random() < 0.01) {
                const cHeight = 2 + Math.floor(Math.random() * 3);
                for(let ty = 1; ty <= cHeight; ty++) { blockData.cactus.push(new THREE.Vector3(x, h + ty, z)); setBlock(worldX, h + ty, worldZ, 'cactus'); }
            } else if (biome === 'snow' && h > 12 && Math.random() < 0.02) {
                const treeHeight = 5 + Math.floor(Math.random() * 3);
                for(let ty = 1; ty <= treeHeight; ty++) { blockData.wood.push(new THREE.Vector3(x, h + ty, z)); setBlock(worldX, h + ty, worldZ, 'wood'); }
                for(let ly = 2; ly <= treeHeight; ly++) {
                    let rad = Math.floor((treeHeight - ly) / 2) + 1;
                    for(let lx = -rad; lx <= rad; lx++) {
                        for(let lz = -rad; lz <= rad; lz++) {
                            if(lx===0 && lz===0) continue;
                            blockData.leaves.push(new THREE.Vector3(x + lx, h + ly, z + lz)); setBlock(worldX + lx, h + ly, worldZ + lz, 'leaves');
                        }
                    }
                }
            }
            if (Math.random() < 0.005) spawnEntity(worldX, h + 1, worldZ, Math.random() > 0.5 ? 'pig' : 'cow');
        }
    }

    for (const [type, positions] of Object.entries(blockData)) {
        if (positions.length === 0) continue;
        const mat = materials[type];
        const instancedMesh = new THREE.InstancedMesh(blockGeom, mat, positions.length);
        instancedMesh.castShadow = true; instancedMesh.receiveShadow = true;
        
        const dummy = new THREE.Object3D();
        positions.forEach((pos, i) => { dummy.position.copy(pos); dummy.updateMatrix(); instancedMesh.setMatrixAt(i, dummy.matrix); });
        
        chunkGroup.add(instancedMesh); interactableObjects.push(instancedMesh);
    }
    scene.add(chunkGroup);
}

for (let cx = -renderDistance; cx <= renderDistance; cx++) {
    for (let cz = -renderDistance; cz <= renderDistance; cz++) { generateChunk(cx, cz); }
}

const startHeight = getTerrainHeight(0, 0);
camera.position.set(0, startHeight + 2.5, 0);

// --- HUD ---
let health = 10; let hunger = 10;
const healthBar = document.getElementById('health-bar');
const hungerBar = document.getElementById('hunger-bar');
const dmgOverlay = document.getElementById('damage-overlay');

function updateHUD() {
    healthBar.innerHTML = ''; hungerBar.innerHTML = '';
    for(let i=0; i<10; i++) {
        const h = document.createElement('div'); h.className = `heart ${i < health ? 'full' : 'empty'}`; healthBar.appendChild(h);
        const f = document.createElement('div'); f.className = `food ${i < hunger ? 'full' : 'empty'}`; hungerBar.appendChild(f);
    }
}

function takeDamage(amount) {
    health -= amount;
    if(health <= 0) {
        health = 10; hunger = 10;
        const newH = getTerrainHeight(Math.round(camera.position.x), Math.round(camera.position.z));
        camera.position.y = newH + 2.5; velocityY = 0;
    }
    updateHUD();
    dmgOverlay.style.background = 'rgba(255, 0, 0, 0.4)'; dmgOverlay.style.opacity = '1';
    setTimeout(() => { dmgOverlay.style.opacity = '0'; }, 300);
}

function creeperExplode() {
    health -= 5;
    if(health <= 0) {
        health = 10; hunger = 10;
        const newH = getTerrainHeight(Math.round(camera.position.x), Math.round(camera.position.z));
        camera.position.y = newH + 2.5; velocityY = 0;
    }
    updateHUD();
    dmgOverlay.style.background = 'rgba(255, 255, 255, 0.9)'; dmgOverlay.style.opacity = '1';
    setTimeout(() => { dmgOverlay.style.opacity='0'; }, 500);
}
updateHUD();

// --- CONTROLS ---
let velocityY = 0; const gravity = 40; let canJump = false; let distanceMoved = 0; let healthRegenTimer = 0;
const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
document.addEventListener('keydown', (e) => {
    if(!controls.isLocked) return;
    switch (e.code) { case 'KeyW': keys.w=true; break; case 'KeyA': keys.a=true; break; case 'KeyS': keys.s=true; break; case 'KeyD': keys.d=true; break; case 'Space': keys.space=true; break; case 'ShiftLeft': keys.shift=true; break; }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) { case 'KeyW': keys.w=false; break; case 'KeyA': keys.a=false; break; case 'KeyS': keys.s=false; break; case 'KeyD': keys.d=false; break; case 'Space': keys.space=false; break; case 'ShiftLeft': keys.shift=false; break; }
});

let activeSlot = 1;
const slotTypes = {1: 'grass', 2: 'sand', 3: 'stone', 4: 'wood', 5: 'leaves', 6: 'snow'};
document.addEventListener('wheel', (e) => {
    if(!controls.isLocked) return;
    document.getElementById(`slot-${activeSlot}`).classList.remove('active');
    if (e.deltaY > 0) activeSlot = activeSlot < 9 ? activeSlot + 1 : 1; else activeSlot = activeSlot > 1 ? activeSlot - 1 : 9;
    document.getElementById(`slot-${activeSlot}`).classList.add('active');
});

// MINING
let isMining = false; let miningBlockPos = null; let miningProgress = 0; 

document.addEventListener('mousedown', (e) => {
    if(!controls.isLocked) return;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);
    
    if (intersects.length > 0 && intersects[0].distance < 6) {
        const hit = intersects[0].object;
        
        if (e.button === 0) {
            if (hit.userData.isEntity) {
                const entityData = entities.find(a => a.mesh === hit.userData.parentGroup);
                if (entityData && !entityData.isDead) {
                    const dmg = tools.sword ? 3 : 1; // SWORD BUFF
                    entityData.health -= dmg;
                    hit.material.emissive.setHex(0xff0000); setTimeout(() => hit.material.emissive.setHex(0x000000), 150);
                    const kb = new THREE.Vector3().subVectors(entityData.mesh.position, camera.position).normalize();
                    entityData.velocity.x = kb.x * 8; entityData.velocity.z = kb.z * 8; entityData.velocity.y = 5;
                    if(entityData.type === 'enderman') entityData.isAggro = true;

                    if (entityData.health <= 0) {
                        entityData.isDead = true; scene.remove(entityData.mesh);
                        interactableObjects = interactableObjects.filter(o => o.userData.parentGroup !== entityData.mesh);
                        if(!entityData.isHostile) dropMeat(entityData.mesh.position.x, entityData.mesh.position.y + 0.5, entityData.mesh.position.z);
                    }
                }
            } else {
                isMining = true; miningProgress = 0;
                let bx, by, bz;
                if (hit.isInstancedMesh) {
                    const pos = new THREE.Vector3().setFromMatrixPosition(hit.matrixWorld);
                    const dummy = new THREE.Matrix4(); hit.getMatrixAt(intersects[0].instanceId, dummy);
                    const worldPos = new THREE.Vector3().setFromMatrixPosition(dummy).add(pos);
                    bx = Math.round(worldPos.x); by = Math.round(worldPos.y); bz = Math.round(worldPos.z);
                } else {
                    bx = Math.round(hit.position.x); by = Math.round(hit.position.y); bz = Math.round(hit.position.z);
                }
                miningBlockPos = new THREE.Vector3(bx, by, bz);
                miningProgressUI.style.display = 'block'; miningBar.style.width = '0%';
            }
        } 
        else if (e.button === 2) {
            const type = slotTypes[activeSlot] || 'dirt';
            if (hit.userData.isEntity) return;
            const placePos = intersects[0].point.clone().add(intersects[0].face.normal.clone().multiplyScalar(0.5));
            const bx = Math.round(placePos.x); const by = Math.round(placePos.y); const bz = Math.round(placePos.z);
            if (checkCollisionBox(camera.position.x, camera.position.y - 1.6, camera.position.z, 0.3, 1.8)) return;

            const mesh = new THREE.Mesh(blockGeom, materials[type]);
            mesh.position.set(bx, by, bz); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
            interactableObjects.push(mesh); setBlock(bx, by, bz, type);
            socket.emit('setBlock', {x: bx, y: by, z: bz, type: type});
        }
    }
});

document.addEventListener('mouseup', (e) => { if (e.button === 0) { isMining = false; miningProgressUI.style.display = 'none'; } });

// --- GAME LOOP ---
let prevTime = performance.now();
let frames = 0; let lastFpsTime = performance.now();
const playerRadius = 0.3; const eyeOffset = 1.6;
const cycleDuration = 300; let mobSpawnTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1);
    prevTime = time;

    // --- DAY / NIGHT ---
    const timeRatio = (time / 1000 % cycleDuration) / cycleDuration;
    let isNight = timeRatio > 0.45 && timeRatio < 0.95;
    
    let blend = 0;
    if (timeRatio < 0.4) blend = 0;
    else if (timeRatio < 0.5) blend = (timeRatio - 0.4) * 10;
    else if (timeRatio < 0.9) blend = 1;
    else blend = 1 - ((timeRatio - 0.9) * 10);
    
    scene.background = skyDayColor.clone().lerp(skyNightColor, blend);
    scene.fog.color = scene.background; scene.fog.density = 0.015 + (blend * 0.01);
    dirLight.intensity = 1.2 * (1 - blend) + 0.0 * blend;
    hemiLight.intensity = 0.4 * (1 - blend) + 0.05 * blend;

    frames++;
    if (time - lastFpsTime >= 1000) {
        statsEl.innerHTML = `FPS: ${frames}<br>Pos: ${Math.round(camera.position.x)}, ${Math.round(camera.position.y)}, ${Math.round(camera.position.z)}`;
        frames = 0; lastFpsTime = time;
    }

    if (controls.isLocked) {
        // MULTIPLAYER BROADCAST
        socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, r: camera.rotation.y });

        if (health < 10 && hunger > 8) {
            healthRegenTimer += delta;
            if (healthRegenTimer > 4) { health += 1; updateHUD(); healthRegenTimer = 0; }
        } else { healthRegenTimer = 0; }

        if (isMining && miningBlockPos) {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(interactableObjects, true);
            let sameBlock = false; let targetObj = null; let targetInstId = null;

            if (intersects.length > 0 && intersects[0].distance < 6 && !intersects[0].object.userData.isEntity) {
                const hit = intersects[0].object; let bx, by, bz;
                if (hit.isInstancedMesh) {
                    const pos = new THREE.Vector3().setFromMatrixPosition(hit.matrixWorld);
                    const dummy = new THREE.Matrix4(); hit.getMatrixAt(intersects[0].instanceId, dummy);
                    const worldPos = new THREE.Vector3().setFromMatrixPosition(dummy).add(pos);
                    bx = Math.round(worldPos.x); by = Math.round(worldPos.y); bz = Math.round(worldPos.z);
                    targetInstId = intersects[0].instanceId;
                } else {
                    bx = Math.round(hit.position.x); by = Math.round(hit.position.y); bz = Math.round(hit.position.z);
                }
                if (bx === miningBlockPos.x && by === miningBlockPos.y && bz === miningBlockPos.z) { sameBlock = true; targetObj = hit; }
            }

            if (sameBlock) {
                miningProgress += delta;
                const reqTime = tools.pickaxe ? 0.2 : 0.6; // PICKAXE BUFF
                miningBar.style.width = `${Math.min((miningProgress / reqTime) * 100, 100)}%`;

                if (miningProgress >= reqTime) {
                    const bType = getBlock(miningBlockPos.x, miningBlockPos.y, miningBlockPos.z);
                    if (bType) {
                        if(inventory[bType] !== undefined) inventory[bType]++;
                        else inventory[bType] = 1;
                    }

                    if (targetObj.isInstancedMesh) {
                        const mat = new THREE.Matrix4(); mat.makeScale(0, 0, 0);
                        targetObj.setMatrixAt(targetInstId, mat); targetObj.instanceMatrix.needsUpdate = true;
                    } else {
                        scene.remove(targetObj); interactableObjects.splice(interactableObjects.indexOf(targetObj), 1);
                    }
                    socket.emit('setBlock', {x: miningBlockPos.x, y: miningBlockPos.y, z: miningBlockPos.z, type: null});
                    setBlock(miningBlockPos.x, miningBlockPos.y, miningBlockPos.z, null);
                    isMining = false; miningProgressUI.style.display = 'none';
                }
            } else { isMining = false; miningProgressUI.style.display = 'none'; }
        }

        // MOVEMENT
        let targetSpeed = keys.shift && hunger > 3 ? 14 : 7; // Much more realistic speeds
        const forward = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
        const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
        const moveDir = new THREE.Vector3();
        if (keys.w) moveDir.add(forward); if (keys.s) moveDir.sub(forward);
        if (keys.d) moveDir.add(right); if (keys.a) moveDir.sub(right);
        if (moveDir.lengthSq() > 0) moveDir.normalize();

        let moveX = moveDir.x * targetSpeed * delta; let moveZ = moveDir.z * targetSpeed * delta;
        const px = camera.position.x; const py = camera.position.y; const pz = camera.position.z; const feetY = py - eyeOffset;

        if (checkCollisionBox(px + moveX, feetY, pz, playerRadius, 1.8)) moveX = 0;
        if (checkCollisionBox(px, feetY, pz + moveZ, playerRadius, 1.8)) moveZ = 0;

        let spd = Math.sqrt(moveX**2 + moveZ**2) / delta; distanceMoved += spd * delta;
        if(distanceMoved > 250) { 
            distanceMoved = 0; if(hunger > 0) { hunger -= 1; updateHUD(); } else if(health > 1) { takeDamage(1); }
        }
        camera.position.x += moveX; camera.position.z += moveZ;

        velocityY -= gravity * delta; const newFeetY = (camera.position.y + velocityY * delta) - eyeOffset;
        if (velocityY < 0) {
            if (checkCollisionBox(camera.position.x, newFeetY - 0.05, camera.position.z, playerRadius, 1.8)) {
                if (velocityY < -18) { let dmg = Math.floor(Math.abs(velocityY) / 5) - 2; if(dmg > 0) takeDamage(dmg); }
                velocityY = 0; camera.position.y = Math.floor(newFeetY) + 1 + eyeOffset; canJump = true;
            } else { canJump = false; }
        } else if (velocityY > 0) {
            if (checkCollisionBox(camera.position.x, newFeetY, camera.position.z, playerRadius, 1.8)) velocityY = 0;
        }

        if (keys.space && canJump) { velocityY = 15; canJump = false; }

        // MOBS
        if (isNight) {
            mobSpawnTimer += delta;
            if (mobSpawnTimer > 3) {
                mobSpawnTimer = 0; const activeHostiles = entities.filter(e => e.isHostile && !e.isDead);
                if (activeHostiles.length < 15) {
                    const ang = Math.random() * Math.PI * 2; const dist = 15 + Math.random() * 20;
                    const sx = camera.position.x + Math.cos(ang) * dist; const sz = camera.position.z + Math.sin(ang) * dist;
                    const sh = getTerrainHeight(sx, sz); const type = Math.random() < 0.5 ? 'zombie' : (Math.random() < 0.8 ? 'creeper' : 'enderman');
                    spawnEntity(sx, sh + 2, sz, type);
                }
            }
        }

        const camForward = new THREE.Vector3(); camera.getWorldDirection(camForward);

        for (let i = entities.length - 1; i >= 0; i--) {
            const a = entities[i]; if (a.isDead) continue;
            const distToPlayer = a.mesh.position.distanceTo(camera.position);

            if (!isNight && a.isHostile) {
                const underSky = hasSkyAccess(a.mesh.position.x, a.mesh.position.y, a.mesh.position.z);
                if (underSky) {
                    a.health -= 1 * delta;
                    a.mesh.children.forEach(c => { c.material.emissive.setHex(0xffaa00); setTimeout(()=>c.material.emissive.setHex(0x000000), 100) });
                    if(a.health <= 0) {
                        a.isDead = true; scene.remove(a.mesh); interactableObjects = interactableObjects.filter(o => o.userData.parentGroup !== a.mesh); continue;
                    }
                    a.moveTimer -= delta;
                    if (a.moveTimer <= 0) {
                        a.moveTimer = 0.5; a.direction.set(Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(8);
                        a.mesh.rotation.y = Math.atan2(a.direction.x, a.direction.y);
                    }
                } else { a.direction.set(0,0); }
            } else if (a.isHostile) {
                if (a.type === 'enderman' && !a.isAggro && camForward.dot(new THREE.Vector3().subVectors(a.mesh.position, camera.position).normalize()) > 0.96) a.isAggro = true;
                
                if (a.isAggro && distToPlayer < 30) {
                    const dx = camera.position.x - a.mesh.position.x; const dz = camera.position.z - a.mesh.position.z;
                    const angle = Math.atan2(dx, dz); const spdMult = a.type === 'enderman' ? 6 : (a.type === 'creeper' ? 3.0 : 2.5);
                    a.direction.set(Math.sin(angle), Math.cos(angle)).multiplyScalar(spdMult); a.mesh.rotation.y = angle;

                    if (a.type === 'enderman' && Math.random() < 0.005 && distToPlayer > 8) {
                        a.mesh.position.x = camera.position.x + (Math.random()-0.5)*10; a.mesh.position.z = camera.position.z + (Math.random()-0.5)*10;
                        a.mesh.position.y = getTerrainHeight(a.mesh.position.x, a.mesh.position.z) + 2;
                    }

                    if (distToPlayer < 2.5) {
                        a.attackTimer -= delta;
                        if (a.attackTimer <= 0) {
                            if (a.type === 'creeper') { creeperExplode(); a.health = 0; a.isDead = true; scene.remove(a.mesh); interactableObjects = interactableObjects.filter(o => o.userData.parentGroup !== a.mesh); continue; } 
                            else { takeDamage(a.type === 'enderman' ? 2 : 1); a.attackTimer = 1.2; }
                        }
                    }
                } else if (!a.isAggro && a.type === 'enderman') { a.direction.set(0,0); }
            } else {
                a.moveTimer -= delta;
                if (a.moveTimer <= 0) {
                    a.moveTimer = 2 + Math.random() * 3; a.direction.set(Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2);
                    if (Math.random() < 0.3) a.direction.set(0,0);
                    if (a.direction.lengthSq() > 0.1) a.mesh.rotation.y = Math.atan2(a.direction.x, a.direction.y);
                }
            }
            
            a.velocity.x = a.direction.x; a.velocity.z = a.direction.y;
            let aMoveX = a.velocity.x * delta; let aMoveZ = a.velocity.z * delta;
            const ax = a.mesh.position.x; const ay = a.mesh.position.y; const az = a.mesh.position.z;
            const entRadius = 0.4; const entHeight = a.type === 'enderman' ? 1.8 : 0.6;

            if (checkCollisionBox(ax + aMoveX, ay, az, entRadius, entHeight)) { a.velocity.x = 0; aMoveX = 0; }
            if (checkCollisionBox(ax, ay, az + aMoveZ, entRadius, entHeight)) { a.velocity.z = 0; aMoveZ = 0; }

            a.mesh.position.x += aMoveX; a.mesh.position.z += aMoveZ;
            a.velocity.y -= gravity * delta; const newAx = a.mesh.position.x; let newAy = a.mesh.position.y + a.velocity.y * delta; const newAz = a.mesh.position.z;
            
            if (checkCollisionBox(newAx, newAy - 0.05, newAz, entRadius, entHeight)) {
                a.velocity.y = 0; newAy = Math.floor(newAy) + 1;
                if (a.isHostile && a.isAggro && distToPlayer < 20 && Math.random() < 0.05) {
                    if (checkCollisionBox(newAx + aMoveX*2, newAy, newAz, entRadius, entHeight) || checkCollisionBox(newAx, newAy, newAz + aMoveZ*2, entRadius, entHeight)) a.velocity.y = 12; 
                }
            }
            a.mesh.position.y = newAy;
        }

        for(let i=items.length-1; i>=0; i--) {
            const item = items[i]; item.rotation.y += delta; item.position.y += Math.sin(time/200) * 0.005;
            if (item.position.distanceTo(camera.position) < 2) {
                hunger += 4; if(hunger > 10) { hunger = 10; health += 2; if(health > 10) health = 10; }
                updateHUD(); scene.remove(item); items.splice(i, 1);
            }
        }
    }
    renderer.render(scene, camera);
}
animate();
