import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createNoise2D } from 'simplex-noise';
import { multiplayer as socket } from './multiplayer.js';

// --- MULTIPLAYER SETUP ---
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
            removeBlockVisual(b.x, b.y, b.z);
            const mesh = new THREE.Mesh(blockGeom, materials[b.type]);
            mesh.position.set(b.x, b.y, b.z);
            scene.add(mesh);
            interactableObjects.push(mesh);
            setBlock(b.x, b.y, b.z, b.type);
        } else {
            removeBlockVisual(b.x, b.y, b.z);
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
        removeBlockVisual(b.x, b.y, b.z);
        const mesh = new THREE.Mesh(blockGeom, materials[b.type]);
        mesh.position.set(b.x, b.y, b.z);
        scene.add(mesh); interactableObjects.push(mesh); setBlock(b.x, b.y, b.z, b.type);
    } else {
        removeBlockVisual(b.x, b.y, b.z);
        setBlock(b.x, b.y, b.z, null);
    }
});

// --- INIT ENGINE ---
const container = document.getElementById('game-container');
const scene = new THREE.Scene();

const skyDayColor = new THREE.Color(0x71a5d4);
const skyNightColor = new THREE.Color(0x1b2d49);
const dayLightColor = new THREE.Color(0xfff5b6);
const moonLightColor = new THREE.Color(0xa9c6ff);
const dayHemisphereColor = new THREE.Color(0xffffff);
const nightHemisphereColor = new THREE.Color(0xa7c3ef);

scene.background = skyDayColor.clone();
scene.fog = new THREE.FogExp2(skyDayColor, 0.015);

const camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
const isMobileDevice = navigator.userAgentData?.mobile ?? /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
if (isMobileDevice) document.body.classList.add('mobile-device');
const lowPowerDisplay = isMobileDevice || window.matchMedia('(max-width: 700px)').matches || navigator.hardwareConcurrency <= 2;
let maxPixelRatio = Math.min(window.devicePixelRatio, lowPowerDisplay ? 1.5 : 2);
const minPixelRatio = Math.min(maxPixelRatio, isMobileDevice ? 1 : 1.1);
let renderPixelRatio = maxPixelRatio;
const renderer = new THREE.WebGLRenderer({ antialias: !lowPowerDisplay, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(renderPixelRatio);
renderer.shadowMap.enabled = !lowPowerDisplay;
renderer.shadowMap.type = THREE.PCFShadowMap;

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.imageRendering = 'auto';

container.appendChild(renderer.domElement);

// --- LIGHTING ---
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x556B2F, 0.4);
hemiLight.position.set(0, 200, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(dayLightColor, 1.2);
dirLight.position.set(100, 200, 50);
dirLight.castShadow = !lowPowerDisplay;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 400;
const d = 70;
dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// --- CONTROLS & UI ---
const controls = new PointerLockControls(camera, document.body);
let gameActive = false;
let gameMode = 'survival';
const useTouchGameplay = isMobileDevice || typeof document.body.requestPointerLock !== 'function';
let pointerLockUnavailable = false;
const startBtn = document.getElementById('start-btn');
const menu = document.getElementById('menu');
const statsEl = document.getElementById('stats');
const mountHintEl = document.getElementById('mount-hint');
const mountButton = document.getElementById('mount-button');
const miningProgressUI = document.getElementById('mining-progress');
const miningBar = document.getElementById('mining-bar');

let hasStarted = false;
function requestLandscape() {
    if (isMobileDevice && screen.orientation?.lock) {
        screen.orientation.lock('landscape').catch(() => {});
    }
}

function beginGame() {
    requestLandscape();
    if (!hasStarted) {
        applyGameMode(gameMode);
        hasStarted = true;
    }
    if (useTouchGameplay || pointerLockUnavailable) {
        gameActive = true;
        menu.style.display = 'none';
    } else {
        controls.lock();
    }
}

startBtn.addEventListener('click', beginGame);
document.getElementById('rotate-start').addEventListener('click', requestLandscape);
menu.addEventListener('click', (event) => {
    if (event.target === menu && !useTouchGameplay) beginGame();
});
document.querySelectorAll('.mode-option').forEach((option) => {
    option.addEventListener('click', () => {
        gameMode = option.dataset.mode;
        document.querySelectorAll('.mode-option').forEach((modeOption) => {
            const selected = modeOption === option;
            modeOption.classList.toggle('selected', selected);
            modeOption.setAttribute('aria-pressed', String(selected));
        });
    });
});
controls.addEventListener('lock', () => {
    dragLook = null;
    gameActive = true;
    menu.style.display = 'none';
});
controls.addEventListener('unlock', () => {
    gameActive = false;
    releaseAllInput();
    if (invUI.style.display !== 'flex') menu.style.display = 'flex';
});
document.addEventListener('pointerlockerror', () => {
    pointerLockUnavailable = true;
    gameActive = true;
    menu.style.display = 'none';
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    maxPixelRatio = Math.min(window.devicePixelRatio, lowPowerDisplay ? 1.5 : 2);
    renderPixelRatio = Math.min(renderPixelRatio, maxPixelRatio);
    renderer.setPixelRatio(renderPixelRatio);
});

// --- TEXTURES ---
function createBlockTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.scale(16, 16);
    
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
    } else if (type === 'torch') {
        ctx.fillStyle = '#684322'; ctx.fillRect(7, 5, 3, 10);
        ctx.fillStyle = '#ff8f00'; ctx.fillRect(6, 3, 5, 4);
        ctx.fillStyle = '#ffeb3b'; ctx.fillRect(7, 2, 3, 3);
    } else if (type === 'bed') {
        ctx.fillStyle = '#70452d'; ctx.fillRect(1, 10, 14, 5);
        ctx.fillStyle = '#b52c32'; ctx.fillRect(2, 5, 12, 6);
        ctx.fillStyle = '#f0e8dc'; ctx.fillRect(2, 5, 4, 4);
        ctx.fillStyle = '#563322'; ctx.fillRect(1, 14, 2, 2); ctx.fillRect(13, 14, 2, 2);
    }
    
    if(!['leaves', 'snow', 'grass_top', 'cactus'].includes(type)) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(15,0,1,16); ctx.fillRect(0,15,16,1);
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0,0,16,1); ctx.fillRect(0,0,1,16);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!['leaves', 'torch', 'bed'].includes(type)) {
        const detailColors = type === 'stone' ? ['#777873', '#c3c1b8', '#85857e'] :
            type === 'grass' || type === 'grass_top' ? ['#526d35', '#91a84b', '#6e853c'] :
            type === 'wood' ? ['#382a20', '#9a7044', '#563c29'] :
            type === 'sand' ? ['#cbbb9b', '#f4e5c8', '#dfd0b1'] :
            type === 'snow' ? ['#d9e5e8', '#ffffff', '#eef4f2'] :
            type === 'cactus' ? ['#286a35', '#4b9b4b', '#347c3c'] :
            ['#5b4032', '#9a7660', '#725342'];
        ctx.globalAlpha = 0.18;
        for (let pixel = 0; pixel < 6000; pixel++) {
            ctx.fillStyle = detailColors[Math.random() * detailColors.length | 0];
            ctx.fillRect(Math.random() * 256 | 0, Math.random() * 256 | 0, Math.random() < 0.9 ? 1 : 3, Math.random() < 0.9 ? 1 : 3);
        }
        ctx.globalAlpha = 1;
    }
    if (['stone', 'grass', 'grass_top', 'grass_side', 'dirt'].includes(type)) {
        ctx.globalAlpha = 0.24;
        for (let patch = 0; patch < 18; patch++) {
            ctx.fillStyle = type === 'stone' ? ['#596344', '#718052', '#464e39'][patch % 3] :
                type === 'dirt' ? ['#483a2d', '#90745a', '#614b37'][patch % 3] :
                ['#355d32', '#8da34e', '#55733a'][patch % 3];
            const x = Math.random() * 248 | 0;
            const y = Math.random() * 248 | 0;
            ctx.fillRect(x, y, 8 + (Math.random() * 26 | 0), 5 + (Math.random() * 20 | 0));
        }
        ctx.globalAlpha = 1;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 128;
    bumpCanvas.height = 128;
    const bumpContext = bumpCanvas.getContext('2d');
    bumpContext.drawImage(canvas, 0, 0, 128, 128);
    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    bumpMap.magFilter = THREE.LinearFilter;
    bumpMap.minFilter = THREE.LinearMipmapLinearFilter;

    const roughnessCanvas = document.createElement('canvas');
    roughnessCanvas.width = 128;
    roughnessCanvas.height = 128;
    const roughnessContext = roughnessCanvas.getContext('2d');
    roughnessContext.fillStyle = '#b8b8b8';
    roughnessContext.fillRect(0, 0, 128, 128);
    for (let detail = 0; detail < 2200; detail++) {
        const shade = 110 + (Math.random() * 130 | 0);
        roughnessContext.fillStyle = `rgb(${shade},${shade},${shade})`;
        roughnessContext.fillRect(Math.random() * 128 | 0, Math.random() * 128 | 0, 1 + (Math.random() * 2 | 0), 1 + (Math.random() * 2 | 0));
    }
    const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
    roughnessMap.magFilter = THREE.LinearFilter;
    roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
    return new THREE.MeshStandardMaterial({ 
        map: texture, bumpMap, bumpScale: type === 'leaves' ? 0.018 : 0.04,
        roughnessMap, roughness: type==='leaves'?1.0:0.82, transparent: type==='leaves', 
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
    torch: createBlockTexture('torch'), bed: createBlockTexture('bed'),
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
function removeBlockVisual(x, y, z) {
    const target = new THREE.Vector3(Math.floor(x), Math.floor(y), Math.floor(z));
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    for (let objectIndex = interactableObjects.length - 1; objectIndex >= 0; objectIndex--) {
        const object = interactableObjects[objectIndex];
        if (!object.isInstancedMesh) {
            if (object.userData.isEntity || Math.round(object.position.x) !== target.x || Math.round(object.position.y) !== target.y || Math.round(object.position.z) !== target.z) continue;
            scene.remove(object);
            interactableObjects.splice(objectIndex, 1);
            return;
        }

        object.updateMatrixWorld(true);
        for (let instanceIndex = 0; instanceIndex < object.count; instanceIndex++) {
            object.getMatrixAt(instanceIndex, matrix);
            position.setFromMatrixPosition(matrix).applyMatrix4(object.matrixWorld);
            if (Math.round(position.x) === target.x && Math.round(position.y) === target.y && Math.round(position.z) === target.z) {
                matrix.makeScale(0, 0, 0);
                object.setMatrixAt(instanceIndex, matrix);
                object.instanceMatrix.needsUpdate = true;
                return;
            }
        }
    }
}
function checkSolidBlock(x, y, z) {
    const b = getBlock(x, y, z); return b && b !== 'leaves';
}

function checkCollisionBox(x, y, z, radius, height) {
    const epsilon = 1e-6;
    const minX = Math.ceil(x - radius - 0.5 + epsilon); const maxX = Math.floor(x + radius + 0.5 - epsilon);
    const minY = Math.ceil(y - 0.5 + epsilon); const maxY = Math.floor(y + height + 0.5 - epsilon);
    const minZ = Math.ceil(z - radius - 0.5 + epsilon); const maxZ = Math.floor(z + radius + 0.5 - epsilon);

    for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
                if (checkSolidBlock(bx, by, bz)) return true;
            }
        }
    }
    return false;
}

function getLandingHeight(x, previousFeetY, nextFeetY, z, radius) {
    const epsilon = 1e-6;
    const minX = Math.ceil(x - radius - 0.5 + epsilon); const maxX = Math.floor(x + radius + 0.5 - epsilon);
    const minZ = Math.ceil(z - radius - 0.5 + epsilon); const maxZ = Math.floor(z + radius + 0.5 - epsilon);
    const highestBlockY = Math.floor(previousFeetY - 0.5 + epsilon);
    const lowestBlockY = Math.floor(nextFeetY - 0.5 + epsilon);
    let landingHeight = null;

    for (let bx = minX; bx <= maxX; bx++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
            for (let by = highestBlockY; by >= lowestBlockY; by--) {
                const blockTop = by + 0.5;
                if (blockTop <= previousFeetY + epsilon && blockTop >= nextFeetY - epsilon && checkSolidBlock(bx, by, bz)) {
                    landingHeight = Math.max(landingHeight ?? -Infinity, blockTop);
                    break;
                }
            }
        }
    }

    return landingHeight;
}

function hasSkyAccess(x, y, z) {
    const cx = Math.floor(x); const cz = Math.floor(z);
    for (let by = Math.floor(y); by <= Math.floor(y) + 15; by++) {
        if (checkSolidBlock(cx, by, cz)) return false;
    }
    return true;
}

// --- INVENTORY & CRAFTING ---
const inventory = { wood: 0, dirt: 0, stone: 0, sand: 0, leaves: 0, grass: 0, cactus: 0, snow: 0, planks: 0, sticks: 0, meat: 0, torch: 0, bed: 0 };
const tools = { sword: false, pickaxe: false, shovel: false, axe: false };
const invUI = document.getElementById('inventory-ui');
const invList = document.getElementById('inv-list');
const inventoryHotbar = document.getElementById('inventory-hotbar');

const inventoryItems = [
    { id: 'wood', name: 'Tronco', color: '#80552e' },
    { id: 'dirt', name: 'Tierra', color: '#795548' },
    { id: 'stone', name: 'Piedra', color: '#9e9e9e' },
    { id: 'sand', name: 'Arena', color: '#eaddca' },
    { id: 'leaves', name: 'Hojas', color: '#2e7d32' },
    { id: 'grass', name: 'Cesped', color: '#689f38' },
    { id: 'cactus', name: 'Cactus', color: '#388e3c' },
    { id: 'snow', name: 'Nieve', color: '#ffffff' },
    { id: 'planks', name: 'Tablones', color: '#a8753e' },
    { id: 'sticks', name: 'Palos', color: '#c18b4d' },
    { id: 'meat', name: 'Carne', color: '#b83a36' },
    { id: 'torch', name: 'Antorcha', color: '#ff9d18' },
    { id: 'bed', name: 'Cama', color: '#b52c32' },
    { id: 'sword', name: 'Espada de piedra', color: '#b9c3c9' },
    { id: 'shovel', name: 'Pala de piedra', color: '#9daab0' },
    { id: 'axe', name: 'Hacha de piedra', color: '#89959b' },
    { id: 'pickaxe', name: 'Pico de piedra', color: '#8c979d' }
];
const inventorySlots = [...inventoryItems, ...Array(27 - inventoryItems.length).fill(null)];

document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') {
        if (gameActive) {
            gameActive = false;
            controls.unlock();
            invUI.style.display = 'flex';
            menu.style.display = 'none';
            updateInvUI();
        } else if (invUI.style.display === 'flex') {
            invUI.style.display = 'none';
            if (useTouchGameplay) {
                gameActive = true;
                menu.style.display = 'none';
            } else {
                controls.lock();
            }
        }
    }
});

function updateInvUI() {
    invList.replaceChildren();
    for (let slotNumber = 0; slotNumber < 27; slotNumber++) {
        const item = inventorySlots[slotNumber];
        const count = item ? (Object.hasOwn(tools, item.id) ? Number(tools[item.id]) : inventory[item.id]) : 0;
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = `inventory-slot${item && count > 0 ? '' : ' slot-empty'}`;
        slot.setAttribute('aria-label', item && count > 0 ? `${item.name}: ${count}` : 'Espacio vacio');
        if (item && count > 0) {
            slot.title = `${item.name} x${count}`;
            slot.innerHTML = `<span class="slot-sprite" style="--item-color:${item.color}"></span><span class="slot-count">${count}</span>`;
                slot.draggable = true;
                slot.addEventListener('dragstart', (event) => {
                    event.dataTransfer.setData('application/x-inventory-item', item.id);
                event.dataTransfer.setData('application/x-inventory-slot', String(slotNumber));
                event.dataTransfer.effectAllowed = 'copyMove';
                    slot.classList.add('dragging');
                });
                slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
            slot.addEventListener('click', () => {
                if (!slotColors[item.id]) return;
                let quickbarSlot = Object.keys(slotTypes).find((number) => slotTypes[number] === item.id);
                if (!quickbarSlot) {
                    quickbarSlot = Array.from({ length: 9 }, (_, index) => String(index + 1)).find((number) => !slotTypes[number]);
                    if (!quickbarSlot) quickbarSlot = String(activeSlot);
                    slotTypes[quickbarSlot] = item.id;
                }
                activeSlot = Number(quickbarSlot);
                updateHotbar();
                updateInvUI();
            });
        }
        slot.addEventListener('dragover', (event) => {
            if (event.dataTransfer.types.includes('application/x-inventory-slot')) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                slot.classList.add('drag-target');
            }
        });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-target'));
        slot.addEventListener('drop', (event) => {
            if (!event.dataTransfer.types.includes('application/x-inventory-slot')) return;
            const sourceSlot = Number(event.dataTransfer.getData('application/x-inventory-slot'));
            if (!Number.isInteger(sourceSlot) || sourceSlot < 0 || sourceSlot >= inventorySlots.length || sourceSlot === slotNumber) return;
            event.preventDefault();
            slot.classList.remove('drag-target');
            [inventorySlots[sourceSlot], inventorySlots[slotNumber]] = [inventorySlots[slotNumber], inventorySlots[sourceSlot]];
            updateInvUI();
        });
        invList.appendChild(slot);
    }

    inventoryHotbar.replaceChildren();
    for (let slotNumber = 1; slotNumber <= 9; slotNumber++) {
        const itemType = slotTypes[slotNumber];
        const count = itemType ? inventory[itemType] : 0;
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = `inventory-slot${slotNumber === activeSlot ? ' selected' : ''}${!itemType || (gameMode !== 'creative' && count <= 0) ? ' slot-empty' : ''}`;
        slot.setAttribute('aria-label', itemType ? `Barra ${slotNumber}: ${itemType}, ${gameMode === 'creative' ? 'infinito' : count}` : `Barra ${slotNumber}: vacia`);
        slot.dataset.quickbarSlot = String(slotNumber);
        if (itemType && (gameMode === 'creative' || count > 0)) {
            slot.innerHTML = `<span class="slot-sprite" style="--item-color:${slotColors[itemType]}"></span><span class="slot-count">${gameMode === 'creative' ? '∞' : count}</span>`;
            slot.draggable = true;
            slot.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('application/x-quickbar-slot', String(slotNumber));
                event.dataTransfer.effectAllowed = 'move';
                slot.classList.add('dragging');
            });
            slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
        }
        slot.addEventListener('dragover', (event) => {
            if (event.dataTransfer.types.includes('application/x-inventory-item') || event.dataTransfer.types.includes('application/x-quickbar-slot')) {
                event.preventDefault();
                event.dataTransfer.dropEffect = event.dataTransfer.types.includes('application/x-inventory-item') ? 'copy' : 'move';
                slot.classList.add('drag-target');
            }
        });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-target'));
        slot.addEventListener('drop', (event) => {
            event.preventDefault();
            slot.classList.remove('drag-target');
            const draggedItem = event.dataTransfer.getData('application/x-inventory-item');
            const draggedSlot = event.dataTransfer.getData('application/x-quickbar-slot');
            if (draggedItem && slotColors[draggedItem]) {
                slotTypes[slotNumber] = draggedItem;
            } else if (draggedSlot && Number(draggedSlot) !== slotNumber) {
                const sourceItem = slotTypes[draggedSlot];
                slotTypes[draggedSlot] = slotTypes[slotNumber];
                if (sourceItem) slotTypes[slotNumber] = sourceItem;
                else delete slotTypes[slotNumber];
            }
            activeSlot = slotNumber;
            updateHotbar();
            updateInvUI();
        });
        slot.addEventListener('click', () => {
            activeSlot = slotNumber;
            updateHotbar();
            updateInvUI();
        });
        inventoryHotbar.appendChild(slot);
    }

    document.getElementById('craft-torch').disabled = gameMode !== 'creative' && (inventory.wood < 1 || inventory.sticks < 1);
    document.getElementById('craft-bed').disabled = gameMode !== 'creative' && inventory.planks < 3;
    document.getElementById('craft-planks').disabled = gameMode !== 'creative' && inventory.wood < 1;
    document.getElementById('craft-sticks').disabled = gameMode !== 'creative' && inventory.planks < 2;
    document.getElementById('craft-sword').disabled = tools.sword || (gameMode !== 'creative' && (inventory.stone < 2 || inventory.sticks < 1));
    document.getElementById('craft-shovel').disabled = tools.shovel || (gameMode !== 'creative' && (inventory.stone < 1 || inventory.sticks < 2));
    document.getElementById('craft-axe').disabled = tools.axe || (gameMode !== 'creative' && (inventory.stone < 3 || inventory.sticks < 2));
    document.getElementById('craft-pickaxe').disabled = tools.pickaxe || (gameMode !== 'creative' && (inventory.stone < 3 || inventory.sticks < 2));
}

document.getElementById('craft-torch').onclick = () => {
    if (gameMode === 'creative' || (inventory.wood >= 1 && inventory.sticks >= 1)) {
        if (gameMode !== 'creative') { inventory.wood--; inventory.sticks--; }
        inventory.torch += 4;
        updateHotbar(); updateInvUI();
    }
};
document.getElementById('craft-bed').onclick = () => {
    if (gameMode === 'creative' || inventory.planks >= 3) {
        if (gameMode !== 'creative') inventory.planks -= 3;
        inventory.bed++;
        updateHotbar(); updateInvUI();
    }
};
document.getElementById('craft-planks').onclick
document.getElementById('craft-planks').onclick = () => { if (inventory.wood >= 1) { if (gameMode !== 'creative') inventory.wood--; inventory.planks += 4; updateHotbar(); updateInvUI(); } };
document.getElementById('craft-sticks').onclick = () => { if (inventory.planks >= 2) { if (gameMode !== 'creative') inventory.planks -= 2; inventory.sticks += 4; updateHotbar(); updateInvUI(); } };
document.getElementById('craft-sword').onclick = () => { if (inventory.stone >= 2 && inventory.sticks >= 1 && !tools.sword) { if (gameMode !== 'creative') { inventory.stone -= 2; inventory.sticks--; } tools.sword = true; updateHotbar(); updateInvUI(); } };
document.getElementById('craft-shovel').onclick = () => { if ((gameMode === 'creative' || (inventory.stone >= 1 && inventory.sticks >= 2)) && !tools.shovel) { if (gameMode !== 'creative') { inventory.stone--; inventory.sticks -= 2; } tools.shovel = true; updateHotbar(); updateInvUI(); } };
document.getElementById('craft-axe').onclick = () => { if ((gameMode === 'creative' || (inventory.stone >= 3 && inventory.sticks >= 2)) && !tools.axe) { if (gameMode !== 'creative') { inventory.stone -= 3; inventory.sticks -= 2; } tools.axe = true; updateHotbar(); updateInvUI(); } };
document.getElementById('craft-pickaxe').onclick = () => { if (inventory.stone >= 3 && inventory.sticks >= 2 && !tools.pickaxe) { if (gameMode !== 'creative') { inventory.stone -= 3; inventory.sticks -= 2; } tools.pickaxe = true; updateHotbar(); updateInvUI(); } };

// --- ENTITIES ---
const entities = [];
let mountedBird = null;
let passiveEntityCount = 0;
const passiveEntityLimit = 20;
const items = [];
function createCreatureMaterial(baseColor, detailColors, roughness = 0.92) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = baseColor;
    context.fillRect(0, 0, 64, 64);
    for (let detail = 0; detail < 1500; detail++) {
        context.fillStyle = detailColors[Math.random() * detailColors.length | 0];
        const size = Math.random() < 0.88 ? 1 : 2 + (Math.random() * 2 | 0);
        context.fillRect(Math.random() * 64 | 0, Math.random() * 64 | 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return new THREE.MeshStandardMaterial({ map: texture, roughness });
}

const entMats = {
    pig: new THREE.MeshStandardMaterial({ color: 0xffaacc, roughness: 0.9 }),
    cow: new THREE.MeshStandardMaterial({ color: 0xe8dfcb, roughness: 0.9 }),
    zombie: createCreatureMaterial('#4c7d4c', ['#2f5035', '#68905b', '#425f40']),
    creeper: createCreatureMaterial('#5d9d38', ['#326331', '#79ad43', '#477b31']),
    enderman: createCreatureMaterial('#17131c', ['#29202d', '#33283b', '#100f17'])
};
const cowSpotMat = new THREE.MeshStandardMaterial({ color: 0x442211, roughness: 0.9 });
const pigMuzzleMat = new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.9 });
const hoofMat = new THREE.MeshStandardMaterial({ color: 0x3a2921, roughness: 0.9 });
const animalEyeMat = new THREE.MeshBasicMaterial({ color: 0x211713 });
const zombieSkinMat = createCreatureMaterial('#568b58', ['#304a32', '#79a766', '#476c46']);
const zombieShirtMat = createCreatureMaterial('#207c78', ['#125b58', '#39928a', '#183f3d']);
const zombiePantsMat = createCreatureMaterial('#353c92', ['#222861', '#4c56a6', '#30365f']);
const zombieFaceMat = new THREE.MeshBasicMaterial({ color: 0x18211a });
const zombieToothMat = new THREE.MeshStandardMaterial({ color: 0xc5c19a, roughness: 0.8 });
const creeperMarkMat = new THREE.MeshStandardMaterial({ color: 0x2b701a, roughness: 0.9 });
const hostileEyeMat = new THREE.MeshBasicMaterial({ color: 0xe400ff });
const hostileFaceMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
const endermanMouthMat = new THREE.MeshBasicMaterial({ color: 0x100817 });
const endermanInnerMouthMat = new THREE.MeshBasicMaterial({ color: 0xb12bdb });
const pigLegGeom = new THREE.BoxGeometry(0.18, 0.3, 0.18);
const cowLegGeom = new THREE.BoxGeometry(0.18, 0.3, 0.18);
const pigMuzzleGeom = new THREE.BoxGeometry(0.3, 0.22, 0.14);
const nostrilGeom = new THREE.BoxGeometry(0.055, 0.065, 0.025);
const animalEyeGeom = new THREE.BoxGeometry(0.07, 0.07, 0.04);
const pigEarGeom = new THREE.BoxGeometry(0.14, 0.18, 0.12);
const cowHornGeom = new THREE.BoxGeometry(0.1, 0.18, 0.1);
const cowEarGeom = new THREE.BoxGeometry(0.16, 0.1, 0.12);
const cowSpotSideGeom = new THREE.BoxGeometry(0.04, 0.22, 0.2);
const cowSpotTopGeom = new THREE.BoxGeometry(0.26, 0.04, 0.2);
const hostileEyeGeom = new THREE.BoxGeometry(0.14, 0.11, 0.05);
const hostileMouthGeom = new THREE.BoxGeometry(0.18, 0.09, 0.045);
const zombieArmGeom = new THREE.BoxGeometry(0.2, 0.68, 0.22);
const zombieLegGeom = new THREE.BoxGeometry(0.25, 0.62, 0.28);
const creeperLegGeom = new THREE.BoxGeometry(0.23, 0.28, 0.24);
const creeperMarkGeom = new THREE.BoxGeometry(0.035, 0.2, 0.16);
const endermanArmGeom = new THREE.BoxGeometry(0.15, 1.55, 0.17);
const endermanLegGeom = new THREE.BoxGeometry(0.16, 1.1, 0.17);
const meatGeom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const meatMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.5 });
const birdFeatherMat = new THREE.MeshStandardMaterial({ color: 0x8a4f2d, roughness: 0.88 });
const birdWingMat = new THREE.MeshStandardMaterial({ color: 0x5c3426, roughness: 0.92 });
const birdBeakMat = new THREE.MeshStandardMaterial({ color: 0xe5a33d, roughness: 0.75 });
const birdEyeMat = new THREE.MeshBasicMaterial({ color: 0x15120f });

function addVoxelPart(parent, geometry, material, x, y, z) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
}

function spawnEntity(x, y, z, type) {
    const group = new THREE.Group();
    const isEnderman = type === 'enderman';
    const isZombie = type === 'zombie';
    const isCreeper = type === 'creeper';
    const mat = entMats[type].clone();

    const bodyGeom = isEnderman ? new THREE.BoxGeometry(0.42, 1.25, 0.34) :
        isZombie ? new THREE.BoxGeometry(0.6, 0.75, 0.38) :
        isCreeper ? new THREE.BoxGeometry(0.7, 0.9, 0.55) : new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const body = new THREE.Mesh(bodyGeom, mat);
    body.position.y = isEnderman ? 1.4 : isZombie ? 0.95 : isCreeper ? 0.75 : 0.3;
    body.castShadow = true; body.receiveShadow = true;
    
    const headGeom = isEnderman ? new THREE.BoxGeometry(0.58, 0.65, 0.46) :
        new THREE.BoxGeometry(isCreeper ? 0.65 : 0.6, 0.6, isCreeper ? 0.65 : 0.6);
    const head = new THREE.Mesh(headGeom, mat);
    head.position.set(0, isEnderman ? 2.3 : isZombie || isCreeper ? 1.5 : 0.9, 0);
    head.castShadow = true; head.receiveShadow = true;

    if (isZombie) {
        body.material = zombieShirtMat.clone();
        head.material = zombieSkinMat.clone();
        for (const side of [-1, 1]) {
            addVoxelPart(group, zombieLegGeom, zombiePantsMat, side * 0.16, 0.31, 0);
            const arm = addVoxelPart(group, zombieArmGeom, zombieSkinMat, side * 0.4, 1.05, 0.08);
            arm.rotation.x = 0.65;
            addVoxelPart(group, new THREE.BoxGeometry(0.25, 0.3, 0.25), zombieShirtMat, side * 0.4, 1.2, 0);
            addVoxelPart(head, hostileEyeGeom, zombieFaceMat, side * 0.15, 0.08, 0.31);
            addVoxelPart(head, new THREE.BoxGeometry(0.2, 0.06, 0.06), zombieFaceMat, side * 0.15, 0.17, 0.33);
            addVoxelPart(group, new THREE.BoxGeometry(0.1, 0.14, 0.1), zombieSkinMat, side * 0.4, 0.72, 0.34);
        }
        addVoxelPart(head, new THREE.BoxGeometry(0.11, 0.14, 0.12), zombieSkinMat, 0, -0.02, 0.32);
        addVoxelPart(head, new THREE.BoxGeometry(0.26, 0.1, 0.055), zombieFaceMat, 0, -0.17, 0.33);
        addVoxelPart(head, new THREE.BoxGeometry(0.16, 0.025, 0.02), zombieToothMat, 0, -0.13, 0.37);
    } else if (isCreeper) {
        for (const side of [-1, 1]) {
            for (const frontBack of [-1, 1]) {
                addVoxelPart(group, creeperLegGeom, creeperMarkMat, side * 0.2, 0.14, frontBack * 0.16);
            }
            addVoxelPart(head, hostileEyeGeom, hostileFaceMat, side * 0.15, 0.1, 0.33);
            addVoxelPart(body, creeperMarkGeom, creeperMarkMat, side * 0.36, 0.04, 0.08);
            addVoxelPart(head, new THREE.BoxGeometry(0.035, 0.13, 0.2), creeperMarkMat, side * 0.33, -0.02, 0);
        }
        addVoxelPart(head, new THREE.BoxGeometry(0.12, 0.2, 0.05), hostileFaceMat, 0, -0.13, 0.33);
        addVoxelPart(head, new THREE.BoxGeometry(0.3, 0.07, 0.05), hostileFaceMat, 0, -0.23, 0.33);
    } else if (isEnderman) {
        for (const side of [-1, 1]) {
            addVoxelPart(group, endermanArmGeom, mat, side * 0.32, 1.15, 0);
            addVoxelPart(group, endermanLegGeom, mat, side * 0.12, 0.55, 0);
            addVoxelPart(head, hostileEyeGeom, hostileEyeMat, side * 0.15, 0.04, 0.25);
        }
        addVoxelPart(head, new THREE.BoxGeometry(0.21, 0.2, 0.035), endermanMouthMat, 0, -0.19, 0.26);
        addVoxelPart(head, new THREE.BoxGeometry(0.12, 0.12, 0.02), endermanInnerMouthMat, 0, -0.2, 0.282);
        const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xc352ff });
        for (let particle = 0; particle < 7; particle++) {
            const mote = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.025), particleMaterial);
            mote.position.set((Math.random() - 0.5) * 1.1, 1.4 + Math.random() * 1.2, (Math.random() - 0.5) * 0.7);
            group.add(mote);
        }
    }

    if (type === 'pig' || type === 'cow') {
        const legGeom = type === 'pig' ? pigLegGeom : cowLegGeom;
        const legMat = type === 'pig' ? pigMuzzleMat : hoofMat;
        for (const side of [-1, 1]) {
            for (const frontBack of [-1, 1]) {
                addVoxelPart(group, legGeom, legMat, side * 0.24, 0.15, frontBack * 0.24);
            }
        }

        if (type === 'pig') {
            addVoxelPart(head, pigMuzzleGeom, pigMuzzleMat, 0, -0.08, 0.35);
            addVoxelPart(head, nostrilGeom, hoofMat, -0.07, -0.07, 0.43);
            addVoxelPart(head, nostrilGeom, hoofMat, 0.07, -0.07, 0.43);
            for (const side of [-1, 1]) {
                addVoxelPart(head, pigEarGeom, pigMuzzleMat, side * 0.2, 0.34, 0.02);
                addVoxelPart(head, animalEyeGeom, animalEyeMat, side * 0.17, 0.1, 0.31);
            }
        } else {
            addVoxelPart(body, cowSpotSideGeom, cowSpotMat, -0.41, 0.08, 0.12);
            addVoxelPart(body, cowSpotSideGeom, cowSpotMat, 0.41, -0.08, -0.16);
            addVoxelPart(body, cowSpotTopGeom, cowSpotMat, 0, 0.31, 0.08);
            addVoxelPart(head, new THREE.BoxGeometry(0.22, 0.16, 0.12), pigMuzzleMat, 0, -0.12, 0.34);
            for (const side of [-1, 1]) {
                addVoxelPart(head, cowHornGeom, hoofMat, side * 0.2, 0.36, 0);
                addVoxelPart(head, cowEarGeom, cowSpotMat, side * 0.34, 0.2, 0);
                addVoxelPart(head, animalEyeGeom, animalEyeMat, side * 0.17, 0.08, 0.31);
            }
        }
    }
    
    group.add(body); group.add(head); group.position.set(x, y, z); scene.add(group);
    group.traverse((part) => {
        if (!part.isMesh) return;
        part.userData = { isEntity: true, parentGroup: group };
        interactableObjects.push(part);
    });
    
    entities.push({
        type: type, mesh: group, velocity: new THREE.Vector3(),
        health: isEnderman ? 8 : (type === 'zombie' ? 5 : 4),
        isHostile: ['zombie', 'creeper', 'enderman'].includes(type),
        isAggro: type !== 'enderman', moveTimer: 0, attackTimer: 0, sunlit: false,
        direction: new THREE.Vector2(), isDead: false
    });
}

function spawnBird(x, y, z) {
    const group = new THREE.Group();
    const body = addVoxelPart(group, new THREE.BoxGeometry(0.8, 0.7, 1.5), birdFeatherMat, 0, 1.35, 0.1);
    body.castShadow = true;
    const head = addVoxelPart(group, new THREE.BoxGeometry(0.55, 0.55, 0.55), birdFeatherMat, 0, 1.72, -0.72);
    addVoxelPart(group, new THREE.ConeGeometry(0.17, 0.42, 4), birdBeakMat, 0, 1.62, -1.12).rotation.x = -Math.PI / 2;
    for (const side of [-1, 1]) {
        addVoxelPart(group, new THREE.BoxGeometry(0.075, 0.075, 0.035), birdEyeMat, side * 0.2, 1.82, -1.0);
        addVoxelPart(group, new THREE.BoxGeometry(0.14, 0.25, 0.2), birdBeakMat, side * 0.2, 0.62, 0.38);
    }
    head.castShadow = true;

    const wings = [];
    for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.28, 1.62, 0.02);
        group.add(pivot);
        addVoxelPart(pivot, new THREE.BoxGeometry(2.3, 0.14, 0.72), birdWingMat, side * 1.1, 0, 0);
        for (let feather = 0; feather < 4; feather++) {
            addVoxelPart(pivot, new THREE.BoxGeometry(0.48, 0.08, 0.64), birdFeatherMat, side * (0.35 + feather * 0.48), -0.08, 0.28);
        }
        wings.push({ pivot, side });
    }

    group.position.set(x, y, z);
    group.traverse((part) => {
        if (part.isMesh) part.castShadow = true;
    });
    scene.add(group);
    entities.push({
        type: 'bird', mesh: group, wings, homeY: y, phase: Math.random() * Math.PI * 2,
        flightState: 'perched', stateTimer: 2 + Math.random() * 4,
        flightTarget: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(), health: 100, isHostile: false, isAggro: false,
        isDead: false, direction: new THREE.Vector2()
    });
}

function toggleBirdMount() {
    if (mountedBird) {
        const birdPosition = mountedBird.mesh.position;
        camera.position.set(birdPosition.x + 1.2, birdPosition.y + 2.4, birdPosition.z);
        mountedBird = null;
        velocityY = 0;
        canJump = false;
        return;
    }

    const nearbyBird = entities.find((entity) => entity.type === 'bird' && !entity.isDead && entity.mesh.position.distanceTo(camera.position) < 4.5);
    if (nearbyBird) mountedBird = nearbyBird;
}

function updateMountPrompt() {
    const nearbyBird = entities.some((entity) => entity.type === 'bird' && !entity.isDead && entity.mesh.position.distanceTo(camera.position) < 4.5);
    const canToggleMount = gameActive && (nearbyBird || mountedBird);
    mountHintEl.textContent = mountedBird ? 'F · DESMONTAR  |  ESPACIO SUBE  |  C BAJA' : 'F · MONTAR AVE';
    mountHintEl.style.display = canToggleMount && !useTouchGameplay ? 'block' : 'none';
    mountButton.style.display = canToggleMount && useTouchGameplay ? 'block' : 'none';
    mountButton.textContent = mountedBird ? 'DESMONTAR' : 'MONTAR';
}
mountButton.addEventListener('click', toggleBirdMount);

function dropMeat(x, y, z) {
    const mesh = new THREE.Mesh(meatGeom, meatMat); mesh.position.set(x, y, z);
    mesh.castShadow = true; scene.add(mesh); items.push(mesh);
}

// --- PROCEDURAL GENERATION ---
function createSeededRandom(seed) {
    return () => {
        let value = seed += 0x6D2B79F5;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

const worldRandom = createSeededRandom(20261001);
const noise2D = createNoise2D(worldRandom);
const tempNoise2D = createNoise2D(worldRandom);
const chunkSize = 16;
const renderDistance = lowPowerDisplay ? 3 : 4;

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
            
            if (biome === 'plains' && h > 12 && worldRandom() < 0.02) {
                const treeHeight = 4 + Math.floor(worldRandom() * 2);
                for(let ty = 1; ty <= treeHeight; ty++) { blockData.wood.push(new THREE.Vector3(x, h + ty, z)); setBlock(worldX, h + ty, worldZ, 'wood'); }
                for(let lx = -2; lx <= 2; lx++) {
                    for(let lz = -2; lz <= 2; lz++) {
                        for(let ly = 0; ly <= 2; ly++) {
                            if (lx*lx + lz*lz + ly*ly <= 5) { blockData.leaves.push(new THREE.Vector3(x + lx, h + treeHeight - 1 + ly, z + lz)); setBlock(worldX + lx, h + treeHeight - 1 + ly, worldZ + lz, 'leaves'); }
                        }
                    }
                }
            } else if (biome === 'desert' && h > 12 && worldRandom() < 0.01) {
                const cHeight = 2 + Math.floor(worldRandom() * 3);
                for(let ty = 1; ty <= cHeight; ty++) { blockData.cactus.push(new THREE.Vector3(x, h + ty, z)); setBlock(worldX, h + ty, worldZ, 'cactus'); }
            } else if (biome === 'snow' && h > 12 && worldRandom() < 0.02) {
                const treeHeight = 5 + Math.floor(worldRandom() * 3);
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
            if (passiveEntityCount < passiveEntityLimit && Math.random() < 0.002) {
                spawnEntity(worldX, h + 1, worldZ, Math.random() > 0.5 ? 'pig' : 'cow');
                passiveEntityCount++;
            }
        }
    }

    for (const [type, positions] of Object.entries(blockData)) {
        if (positions.length === 0) continue;
        const mat = materials[type];
        const instancedMesh = new THREE.InstancedMesh(blockGeom, mat, positions.length);
        instancedMesh.castShadow = type === 'wood' || type === 'leaves';
        instancedMesh.receiveShadow = true;
        
        const dummy = new THREE.Object3D();
        positions.forEach((pos, i) => {
            dummy.position.copy(pos);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
            const shade = 0.88 + Math.random() * 0.24;
            instancedMesh.setColorAt(i, new THREE.Color(shade, shade, shade));
        });
        
        chunkGroup.add(instancedMesh); interactableObjects.push(instancedMesh);
    }
    scene.add(chunkGroup);
}

for (let cx = -renderDistance; cx <= renderDistance; cx++) {
    for (let cz = -renderDistance; cz <= renderDistance; cz++) { generateChunk(cx, cz); }
}

const startHeight = getTerrainHeight(0, 0);
camera.position.set(0, startHeight + 2.5, 0);
for (let birdIndex = 0; birdIndex < 11; birdIndex++) {
    const angle = birdIndex * Math.PI * 2 / 11;
    const distance = birdIndex === 0 ? 2 : 9 + birdIndex * 2;
    const birdX = Math.round(Math.cos(angle) * distance);
    const birdZ = Math.round(Math.sin(angle) * distance);
    spawnBird(birdX, getTerrainHeight(birdX, birdZ) + 0.5, birdZ);
}

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

function returnToStartAfterDeath() {
    gameActive = false;
    hasStarted = false;
    mountedBird = null;
    isMining = false;
    miningProgressUI.style.display = 'none';
    invUI.style.display = 'none';
    velocityY = 0;
    camera.position.set(0, startHeight + 2.5, 0);
    releaseAllInput();
    controls.unlock();
    menu.style.display = 'flex';
}

function takeDamage(amount) {
    if (gameMode === 'creative') return;
    health = Math.max(0, health - amount);
    updateHUD();
    dmgOverlay.style.background = 'rgba(255, 0, 0, 0.4)'; dmgOverlay.style.opacity = '1';
    setTimeout(() => { dmgOverlay.style.opacity = '0'; }, 300);
    if (health === 0) returnToStartAfterDeath();
}

function creeperExplode() {
    if (gameMode === 'creative') return;
    takeDamage(5);
    dmgOverlay.style.background = 'rgba(255, 255, 255, 0.9)'; dmgOverlay.style.opacity = '1';
    setTimeout(() => { dmgOverlay.style.opacity='0'; }, 500);
}
updateHUD();

// --- CONTROLS ---
let velocityY = 0; const gravity = 9.81; let canJump = false; let distanceMoved = 0; let healthRegenTimer = 0;
const keys = { w: false, a: false, s: false, d: false, space: false, shift: false, descend: false };
let jumpQueued = false;

function releaseAllInput() {
    for (const key of Object.keys(keys)) keys[key] = false;
    jumpQueued = false;
    dragLook = null;
}

window.addEventListener('blur', releaseAllInput);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllInput();
});

document.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    switch (e.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'KeyF': if (!e.repeat) toggleBirdMount(); break;
        case 'KeyC': keys.descend = true; break;
        case 'Space':
            e.preventDefault();
            if (!keys.space && canJump) jumpQueued = true;
            keys.space = true;
            break;
        case 'ShiftLeft': keys.shift = true; break;
    }
});

function closeInventory() {
    invUI.style.display = 'none';
    if (useTouchGameplay) {
        gameActive = true;
        menu.style.display = 'none';
    } else {
        controls.lock();
    }
}

document.getElementById('inventory-close').addEventListener('click', closeInventory);
document.addEventListener('keyup', (e) => {
    switch (e.code) { case 'KeyW': keys.w=false; break; case 'KeyA': keys.a=false; break; case 'KeyS': keys.s=false; break; case 'KeyD': keys.d=false; break; case 'KeyC': keys.descend=false; break; case 'Space': keys.space=false; break; case 'ShiftLeft': keys.shift=false; break; }
});

document.querySelectorAll('#touch-controls [data-key]').forEach((button) => {
    const key = button.dataset.key;
    const release = () => { keys[key] = false; };
    button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        if (!gameActive) return;
        button.setPointerCapture(event.pointerId);
        if (key === 'space' && canJump) jumpQueued = true;
        keys[key] = true;
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
});

let dragLook = null;
renderer.domElement.addEventListener('pointerdown', (event) => {
    if (!gameActive) return;
    if (event.pointerType === 'mouse') {
        if (!pointerLockUnavailable && !controls.isLocked && typeof document.body.requestPointerLock === 'function') controls.lock();
        if (!controls.isLocked) {
            dragLook = { id: event.pointerId, x: event.clientX, y: event.clientY };
            renderer.domElement.setPointerCapture(event.pointerId);
        }
        return;
    }
    dragLook = { id: event.pointerId, x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', (event) => {
    if (!dragLook || event.pointerId !== dragLook.id) return;
    const deltaX = event.clientX - dragLook.x;
    const deltaY = event.clientY - dragLook.y;
    dragLook.x = event.clientX;
    dragLook.y = event.clientY;
    camera.rotation.y -= deltaX * 0.004;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - deltaY * 0.004, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
});
renderer.domElement.addEventListener('pointerup', (event) => {
    if (dragLook && event.pointerId === dragLook.id) dragLook = null;
});
renderer.domElement.addEventListener('pointercancel', () => { dragLook = null; });

let activeSlot = 1;
const slotTypes = {1: 'grass', 2: 'dirt', 3: 'stone', 4: 'wood', 5: 'leaves', 6: 'sand', 7: 'snow', 8: 'cactus'};
const slotColors = {grass: '#689f38', dirt: '#795548', stone: '#9e9e9e', wood: '#5d4037', leaves: '#2e7d32', sand: '#eaddca', snow: '#ffffff', cactus: '#388e3c'};

function updateHotbar() {
    for (let slotNumber = 1; slotNumber <= 9; slotNumber++) {
        const slot = document.getElementById(`slot-${slotNumber}`);
        const itemType = slotTypes[slotNumber];
        let item = slot.querySelector('.slot-item');
        if (!item) {
            item = document.createElement('div');
            item.className = 'slot-item';
            slot.appendChild(item);
        }

        const count = itemType ? inventory[itemType] : 0;
        const available = gameMode === 'creative' || count > 0;
        item.style.backgroundColor = available ? slotColors[itemType] : 'transparent';
        item.style.border = available ? '2px solid rgba(255,255,255,0.35)' : 'none';
        item.innerHTML = available ? `<span>${gameMode === 'creative' ? '∞' : count}</span>` : '';
        item.style.visibility = itemType && available ? 'visible' : 'hidden';
        slot.classList.toggle('active', slotNumber === activeSlot);
    }
}

function applyGameMode(mode) {
    gameMode = mode;
    for (const itemType of Object.keys(inventory)) inventory[itemType] = mode === 'creative' ? 64 : 0;
    tools.sword = mode === 'creative';
    tools.pickaxe = mode === 'creative';
    health = 10;
    hunger = 10;
    updateHUD();
    updateHotbar();
    updateInvUI();
}

updateHotbar();
document.addEventListener('wheel', (e) => {
    if(!gameActive) return;
    document.getElementById(`slot-${activeSlot}`).classList.remove('active');
    if (e.deltaY > 0) activeSlot = activeSlot < 9 ? activeSlot + 1 : 1; else activeSlot = activeSlot > 1 ? activeSlot - 1 : 9;
    document.getElementById(`slot-${activeSlot}`).classList.add('active');
});

// MINING
let isMining = false; let miningBlockPos = null; let miningProgress = 0; 

document.addEventListener('mousedown', (e) => {
    if(!gameActive) return;
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
                    if (hit.material.emissive) {
                        const baseEmissive = hit.material.emissive.getHex();
                        hit.material.emissive.setHex(0xff0000);
                        setTimeout(() => hit.material.emissive.setHex(baseEmissive), 150);
                    }
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
            const type = slotTypes[activeSlot];
            if (!type || (gameMode !== 'creative' && inventory[type] <= 0)) return;
            if (hit.userData.isEntity) return;
            const placePos = intersects[0].point.clone().add(intersects[0].face.normal.clone().multiplyScalar(0.5));
            const bx = Math.round(placePos.x); const by = Math.round(placePos.y); const bz = Math.round(placePos.z);
            if (checkCollisionBox(camera.position.x, camera.position.y - 1.6, camera.position.z, 0.3, 1.8)) return;

            const mesh = new THREE.Mesh(blockGeom, materials[type]);
            mesh.position.set(bx, by, bz); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
            interactableObjects.push(mesh); setBlock(bx, by, bz, type);
            if (gameMode !== 'creative') {
                inventory[type]--;
                updateHotbar();
                updateInvUI();
            }
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
let qualitySampleElapsed = 0;
let qualitySampleFrames = 0;

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
    
    scene.background.copy(skyDayColor).lerp(skyNightColor, blend);
    scene.fog.color.copy(scene.background); scene.fog.density = 0.015 + (blend * 0.004);
    dirLight.color.copy(dayLightColor).lerp(moonLightColor, blend);
    dirLight.intensity = 1.2 * (1 - blend) + 0.22 * blend;
    hemiLight.color.copy(dayHemisphereColor).lerp(nightHemisphereColor, blend);
    hemiLight.intensity = 0.4 * (1 - blend) + 0.78 * blend;

    frames++;
    if (time - lastFpsTime >= 1000) {
        const frameTime = frames > 0 ? (1000 / frames).toFixed(1) : '0.0';
        statsEl.innerHTML = `FPS: ${frames} | ${frameTime} ms<br>Online: ${socket.connected ? 'Conectado' : 'Desconectado'}<br>Modo: ${gameMode === 'creative' ? 'Creativo' : 'Supervivencia'}<br>Pos: ${Math.round(camera.position.x)}, ${Math.round(camera.position.y)}, ${Math.round(camera.position.z)}`;
        frames = 0; lastFpsTime = time;
    }

    updateMountPrompt();
    if (gameActive) {
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
                    if (gameMode === 'survival' && bType && inventory[bType] !== undefined) {
                        inventory[bType]++;
                        updateHotbar();
                        updateInvUI();
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

        if (mountedBird) {
            const flightSpeed = keys.shift && hunger > 3 ? 18 : 11;
            mountedBird.mesh.position.addScaledVector(moveDir, flightSpeed * delta);
            const birdPosition = mountedBird.mesh.position;
            const minimumAltitude = getTerrainHeight(birdPosition.x, birdPosition.z) + 0.5;
            const verticalInput = Number(keys.space) - Number(keys.descend);
            birdPosition.y = Math.max(minimumAltitude, Math.min(100, birdPosition.y + verticalInput * 8 * delta));
            mountedBird.mesh.rotation.y = camera.rotation.y;
            const rearOffset = forward.clone().multiplyScalar(-4);
            camera.position.set(birdPosition.x + rearOffset.x, birdPosition.y + 3.2, birdPosition.z + rearOffset.z);
            velocityY = 0;
            canJump = false;
            jumpQueued = false;
        } else {
        let moveX = moveDir.x * targetSpeed * delta; let moveZ = moveDir.z * targetSpeed * delta;
        const px = camera.position.x; const py = camera.position.y; const pz = camera.position.z; const feetY = py - eyeOffset;

        if (checkCollisionBox(px + moveX, feetY, pz, playerRadius, 1.8)) moveX = 0;
        if (checkCollisionBox(px, feetY, pz + moveZ, playerRadius, 1.8)) moveZ = 0;

        let spd = Math.sqrt(moveX**2 + moveZ**2) / delta; distanceMoved += spd * delta;
        if(gameMode === 'survival' && distanceMoved > 250) { 
            distanceMoved = 0; if(hunger > 0) { hunger -= 1; updateHUD(); } else if(health > 1) { takeDamage(1); }
        }
        camera.position.x += moveX; camera.position.z += moveZ;

        const previousFeetY = camera.position.y - eyeOffset;
        velocityY -= gravity * delta; const newFeetY = (camera.position.y + velocityY * delta) - eyeOffset;
        if (velocityY < 0) {
            const landingHeight = getLandingHeight(camera.position.x, previousFeetY, newFeetY, camera.position.z, playerRadius);
            if (landingHeight !== null) {
                const fallDistance = (velocityY * velocityY) / (2 * gravity);
                const fallDamage = Math.floor(fallDistance - 3);
                if (fallDamage > 0) takeDamage(fallDamage);
                velocityY = 0; camera.position.y = landingHeight + eyeOffset; canJump = true;
            } else { camera.position.y += velocityY * delta; canJump = false; }
        } else if (velocityY > 0) {
            if (checkCollisionBox(camera.position.x, newFeetY, camera.position.z, playerRadius, 1.8)) velocityY = 0;
            else camera.position.y += velocityY * delta;
        }

        if (jumpQueued && canJump) {
            velocityY = 5;
            canJump = false;
            jumpQueued = false;
        }
        }

        // MOBS
        if (isNight && gameMode === 'survival') {
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
            if (a.type === 'bird') {
                const flap = Math.sin(time * 0.008 + a.phase) * 0.55;
                a.wings.forEach(({ pivot, side }) => { pivot.rotation.z = side * flap; });
                if (a !== mountedBird) {
                    if (a.flightState === 'perched') {
                        a.mesh.position.y = a.homeY + Math.sin(time * 0.0015 + a.phase) * 0.04;
                        a.stateTimer -= delta;
                        if (a.stateTimer <= 0) {
                            const targetX = a.mesh.position.x + (Math.random() - 0.5) * 18;
                            const targetZ = a.mesh.position.z + (Math.random() - 0.5) * 18;
                            a.flightTarget.set(targetX, Math.max(a.homeY + 4, getTerrainHeight(targetX, targetZ) + 4), targetZ);
                            a.flightState = 'flying';
                        }
                    } else {
                        const flightVector = new THREE.Vector3().subVectors(a.flightTarget, a.mesh.position);
                        const distanceToTarget = flightVector.length();
                        if (distanceToTarget > 0.35) {
                            const travel = Math.min(5 * delta, distanceToTarget);
                            a.mesh.position.addScaledVector(flightVector, travel / distanceToTarget);
                            a.mesh.rotation.y = Math.atan2(flightVector.x, flightVector.z);
                        } else if (a.flightState === 'flying') {
                            const perchY = getTerrainHeight(a.mesh.position.x, a.mesh.position.z) + 0.5;
                            a.flightTarget.set(a.mesh.position.x, perchY, a.mesh.position.z);
                            a.flightState = 'landing';
                        } else {
                            a.flightState = 'perched';
                            a.homeY = a.mesh.position.y;
                            a.stateTimer = 3 + Math.random() * 6;
                        }
                    }
                }
                continue;
            }
            const distToPlayer = a.mesh.position.distanceTo(camera.position);

            if (!isNight && a.isHostile) {
                const underSky = hasSkyAccess(a.mesh.position.x, a.mesh.position.y, a.mesh.position.z);
                if (underSky) {
                    a.health -= 1 * delta;
                    if (!a.sunlit) {
                        a.mesh.children.forEach(c => c.material.emissive.setHex(0xffaa00));
                        a.sunlit = true;
                    }
                    if(a.health <= 0) {
                        a.isDead = true; scene.remove(a.mesh); interactableObjects = interactableObjects.filter(o => o.userData.parentGroup !== a.mesh); continue;
                    }
                    a.moveTimer -= delta;
                    if (a.moveTimer <= 0) {
                        a.moveTimer = 0.5; a.direction.set(Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.2);
                        a.mesh.rotation.y = Math.atan2(a.direction.x, a.direction.y);
                    }
                } else {
                    a.direction.set(0,0);
                    if (a.sunlit) {
                        a.mesh.children.forEach(c => c.material.emissive.setHex(0x000000));
                        a.sunlit = false;
                    }
                }
            } else if (a.isHostile) {
                if (a.type === 'enderman' && !a.isAggro && camForward.dot(new THREE.Vector3().subVectors(a.mesh.position, camera.position).normalize()) > 0.96) a.isAggro = true;
                
                if (a.isAggro && distToPlayer < 30) {
                    const dx = camera.position.x - a.mesh.position.x; const dz = camera.position.z - a.mesh.position.z;
                    const angle = Math.atan2(dx, dz); const spdMult = a.type === 'enderman' ? 3.5 : (a.type === 'creeper' ? 2 : 1.5);
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
                    a.moveTimer = 2 + Math.random() * 3; a.direction.set(Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.1);
                    if (Math.random() < 0.3) a.direction.set(0,0);
                    if (a.direction.lengthSq() > 0.1) a.mesh.rotation.y = Math.atan2(a.direction.x, a.direction.y);
                }
            }
            
            a.velocity.x = a.direction.x; a.velocity.z = a.direction.y;
            let aMoveX = a.velocity.x * delta; let aMoveZ = a.velocity.z * delta;
            const ax = a.mesh.position.x; const ay = a.mesh.position.y; const az = a.mesh.position.z;
            const entRadius = 0.4;
            const entHeight = a.type === 'enderman' ? 2.85 : (a.type === 'zombie' || a.type === 'creeper') ? 1.8 : 1.2;

            if (checkCollisionBox(ax + aMoveX, ay, az, entRadius, entHeight)) { a.velocity.x = 0; aMoveX = 0; }
            if (checkCollisionBox(ax, ay, az + aMoveZ, entRadius, entHeight)) { a.velocity.z = 0; aMoveZ = 0; }

            a.mesh.position.x += aMoveX; a.mesh.position.z += aMoveZ;
            a.velocity.y -= gravity * delta; const newAx = a.mesh.position.x; let newAy = a.mesh.position.y + a.velocity.y * delta; const newAz = a.mesh.position.z;
            
            if (checkCollisionBox(newAx, newAy - 0.05, newAz, entRadius, entHeight)) {
                a.velocity.y = 0; newAy = Math.ceil(newAy - 0.5) + 0.5;
                if (a.isHostile && a.isAggro && distToPlayer < 20 && Math.random() < 0.05) {
                    if (checkCollisionBox(newAx + aMoveX*2, newAy, newAz, entRadius, entHeight) || checkCollisionBox(newAx, newAy, newAz + aMoveZ*2, entRadius, entHeight)) a.velocity.y = 12; 
                }
            }
            a.mesh.position.y = newAy;
        }

        for(let i=items.length-1; i>=0; i--) {
            const item = items[i]; item.rotation.y += delta; item.position.y += Math.sin(time/200) * 0.005;
            if (item.position.distanceTo(camera.position) < 2) {
                if (gameMode === 'survival') inventory.meat++;
                hunger += 4; if(hunger > 10) { hunger = 10; health += 2; if(health > 10) health = 10; }
                updateHUD(); updateInvUI(); scene.remove(item); items.splice(i, 1);
            }
        }
    }
    renderer.render(scene, camera);
    qualitySampleElapsed += delta;
    qualitySampleFrames++;
    if (qualitySampleElapsed >= 2.5) {
        const sampledFps = qualitySampleFrames / qualitySampleElapsed;
        if (sampledFps < 45) renderPixelRatio = Math.max(minPixelRatio, renderPixelRatio - 0.15);
        else if (sampledFps > 58) renderPixelRatio = Math.min(maxPixelRatio, renderPixelRatio + 0.1);
        renderer.setPixelRatio(renderPixelRatio);
        qualitySampleElapsed = 0;
        qualitySampleFrames = 0;
    }
}
animate();
