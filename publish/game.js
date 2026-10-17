import * as THREE from 'three';

const SIZE = 4;
const CELL = 1.1;
const GAP = 0.08;
const CUBE_H = 0.35;
const BOARD_SIZE = CELL * SIZE;

const COLORS = {
    2:    0xeee4da,
    4:    0xede0c8,
    8:    0xf2b179,
    16:   0xf59563,
    32:   0xf67c5f,
    64:   0xf65e3b,
    128:  0xedcf72,
    256:  0xedcc61,
    512:  0xedc850,
    1024: 0xedc53f,
    2048: 0xedc22e,
    4096: 0x3c3a32,
    8192: 0x2a2824,
    big:   0x1a1a2e,
};
const DARK_TEXTS = new Set([2, 4]);

let scene, camera, renderer, boardGroup;
let board = [];
let cubes = new Map();
let score = 0, best = 0;
let animating = false;
let gameOver = false, won = false;
let targetRotY = 0, currentRotY = 0, targetRotX = 0.55, currentRotX = 0.55;
let camDist = 8;

function init() {
    loadBest();
    setupScene();
    createBoardBase();
    bindEvents();
    resetGame();
    animate();
}

function setupScene() {
    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 5, 6);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(4, 8, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -6;
    dir.shadow.camera.right = 6;
    dir.shadow.camera.top = 6;
    dir.shadow.camera.bottom = -6;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 20;
    scene.add(dir);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
    fill.position.set(-5, 3, -4);
    scene.add(fill);

    boardGroup = new THREE.Group();
    scene.add(boardGroup);

    window.addEventListener('resize', onResize);
}

function createBoardBase() {
    const baseGeo = new THREE.BoxGeometry(BOARD_SIZE + 0.6, 0.4, BOARD_SIZE + 0.6);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1730, roughness: 0.8, metalness: 0.1 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.35;
    base.receiveShadow = true;
    boardGroup.add(base);

    const gridGeo = new THREE.BoxGeometry(BOARD_SIZE + 0.3, 0.12, BOARD_SIZE + 0.3);
    const gridMat = new THREE.MeshStandardMaterial({ color: 0x2d2a44, roughness: 0.7 });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.position.y = -0.1;
    grid.receiveShadow = true;
    boardGroup.add(grid);

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const slotGeo = new THREE.BoxGeometry(CELL - GAP, 0.08, CELL - GAP);
            const slotMat = new THREE.MeshStandardMaterial({
                color: 0x3a3754, roughness: 0.6, transparent: true, opacity: 0.85
            });
            const slot = new THREE.Mesh(slotGeo, slotMat);
            slot.position.set(gridToWorldX(c), -0.04, gridToWorldZ(r));
            slot.receiveShadow = true;
            boardGroup.add(slot);
        }
    }
}

function gridToWorldX(c) { return (c - (SIZE - 1) / 2) * CELL; }
function gridToWorldZ(r) { return (r - (SIZE - 1) / 2) * CELL; }

function makeNumberTexture(num) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const maxDigits = String(num).length;
    let fontSize = 140;
    if (maxDigits === 3) fontSize = 110;
    else if (maxDigits === 4) fontSize = 88;
    else if (maxDigits >= 5) fontSize = 68;

    ctx.font = `bold ${fontSize}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = DARK_TEXTS.has(num) ? '#776e65' : '#f9f6f2';
    ctx.fillText(num, size / 2, size / 2 + 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
}

function createCube(r, c, val) {
    const geo = new THREE.BoxGeometry(CELL - GAP, CUBE_H, CELL - GAP);
    const color = COLORS[val] || (val > 8192 ? COLORS.big : COLORS[2]);
    const mat = new THREE.MeshStandardMaterial({
        color: color, roughness: 0.5, metalness: 0.05
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(gridToWorldX(c), 0, gridToWorldZ(r));
    mesh.userData = { value: val, row: r, col: c };

    const tex = makeNumberTexture(val);
    const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const labelGeo = new THREE.PlaneGeometry(CELL - GAP - 0.1, CELL - GAP - 0.1);
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.rotation.x = -Math.PI / 2;
    label.position.y = CUBE_H / 2 + 0.001;
    mesh.add(label);
    mesh.userData.label = label;

    boardGroup.add(mesh);
    return mesh;
}

function updateCubeVisual(mesh, val) {
    mesh.userData.value = val;
    const color = COLORS[val] || (val > 8192 ? COLORS.big : COLORS[2]);
    mesh.material.color.setHex(color);
    const newTex = makeNumberTexture(val);
    mesh.userData.label.material.map?.dispose();
    mesh.userData.label.material.map = newTex;
    mesh.userData.label.material.needsUpdate = true;
    mesh.userData.label.material.color.setHex(0xffffff);
}

function disposeCube(mesh) {
    boardGroup.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    if (mesh.userData.label) {
        mesh.userData.label.geometry.dispose();
        mesh.userData.label.material.map?.dispose();
        mesh.userData.label.material.dispose();
    }
}

function resetGame() {
    for (const mesh of cubes.values()) disposeCube(mesh);
    cubes.clear();
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    score = 0;
    gameOver = false; won = false;
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('score').textContent = '0';
    addRandomTile();
    addRandomTile();
}

function addRandomTile() {
    const empty = [];
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (board[r][c] === 0) empty.push([r, c]);
    if (empty.length === 0) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const val = Math.random() < 0.9 ? 2 : 4;
    board[r][c] = val;
    const mesh = createCube(r, c, val);
    mesh.scale.setScalar(0.01);
    new THREE.Vector3(1, 1, 1);
    popTween(mesh);
    cubes.set(`${r}-${c}`, mesh);
}

function popTween(mesh) {
    const start = performance.now();
    const dur = 250;
    const from = 0.01;
    function step(now) {
        const t = Math.min(1, (now - start) / dur);
        const ease = 1 - Math.pow(1 - t, 3);
        const s = from + (1 - from) * ease;
        mesh.scale.setScalar(s);
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

async function move(direction) {
    if (animating || gameOver) return;

    const vectors = {
        up:    [-1, 0],
        down:  [ 1, 0],
        left:  [ 0,-1],
        right: [ 0, 1],
    };
    const [dr, dc] = vectors[direction];

    const traversals = buildTraversals(dr, dc);
    const mergedPos = new Set();
    const moves = [];

    traversals.r.forEach(r => {
        traversals.c.forEach(c => {
            if (board[r][c] === 0) return;
            let nr = r, nc = c;
            while (true) {
                const tr = nr + dr, tc = nc + dc;
                if (!inBounds(tr, tc)) break;
                if (board[tr][tc] === 0) {
                    nr = tr; nc = tc;
                } else if (board[tr][tc] === board[r][c] && !mergedPos.has(`${tr}-${tc}`)) {
                    nr = tr; nc = tc;
                    break;
                } else {
                    break;
                }
            }
            if (nr !== r || nc !== c) {
                moves.push({ fromR: r, fromC: c, toR: nr, toC: nc, val: board[r][c], merged: board[nr][nc] !== 0 });
            }
        });
    });

    if (moves.length === 0) return;

    animating = true;

    for (const m of moves) {
        const fromKey = `${m.fromR}-${m.fromC}`;
        const toKey = `${m.toR}-${m.toC}`;
        const mesh = cubes.get(fromKey);
        if (!mesh) continue;

        mesh.userData.row = m.toR;
        mesh.userData.col = m.toC;
        board[m.fromR][m.fromC] = 0;

        if (m.merged) {
            mergedPos.add(toKey);
            const oldVal = m.val;
            const newVal = oldVal * 2;
            board[m.toR][m.toC] = newVal;
            score += newVal;

            const destX = gridToWorldX(m.toC);
            const destZ = gridToWorldZ(m.toR);
            await tweenPosition(mesh, destX, destZ, 180);

            const existing = cubes.get(toKey);
            if (existing && existing !== mesh) {
                disposeCube(existing);
            }
            cubes.delete(fromKey);

            updateCubeVisual(mesh, newVal);
            cubes.set(toKey, mesh);
            mesh.userData.row = m.toR;
            mesh.userData.col = m.toC;
            burstTween(mesh);

            if (newVal === 2048 && !won) {
                won = true;
                setTimeout(() => showOverlay('恭喜达成 2048！', score), 300);
            }
        } else {
            board[m.toR][m.toC] = m.val;
            cubes.delete(fromKey);
            cubes.set(toKey, mesh);
            const destX = gridToWorldX(m.toC);
            const destZ = gridToWorldZ(m.toR);
            await tweenPosition(mesh, destX, destZ, 160);
        }
    }

    document.getElementById('score').textContent = score;
    if (score > best) { best = score; saveBest(); }
    document.getElementById('best').textContent = best;

    addRandomTile();

    if (!hasMoves()) {
        gameOver = true;
        setTimeout(() => showOverlay('游戏结束', score), 400);
    }

    animating = false;
}

function tweenPosition(mesh, x, z, dur) {
    return new Promise(resolve => {
        const start = performance.now();
        const ox = mesh.position.x, oz = mesh.position.z;
        function step(now) {
            const t = Math.min(1, (now - start) / dur);
            const ease = 1 - Math.pow(1 - t, 3);
            mesh.position.x = ox + (x - ox) * ease;
            mesh.position.z = oz + (z - oz) * ease;
            if (t < 1) requestAnimationFrame(step);
            else resolve();
        }
        requestAnimationFrame(step);
    });
}

function burstTween(mesh) {
    const start = performance.now();
    const dur = 220;
    function step(now) {
        const t = Math.min(1, (now - start) / dur);
        const overshoot = t < 0.5 ? 1 + 0.15 * Math.sin(t * Math.PI) : 1 - 0.08 * (t - 0.5) * 2;
        mesh.scale.setScalar(overshoot);
        mesh.position.y = 0.12 * Math.sin(t * Math.PI);
        if (t < 1) requestAnimationFrame(step);
        else mesh.position.y = 0;
    }
    requestAnimationFrame(step);
}

function buildTraversals(dr, dc) {
    const r = [], c = [];
    for (let i = 0; i < SIZE; i++) { r.push(i); c.push(i); }
    if (dr === 1) r.reverse();
    if (dc === 1) c.reverse();
    return { r, c };
}

function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

function hasMoves() {
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c] === 0) return true;
            if (c < SIZE - 1 && board[r][c] === board[r][c + 1]) return true;
            if (r < SIZE - 1 && board[r][c] === board[r + 1][c]) return true;
        }
    return false;
}

function bindEvents() {
    window.addEventListener('keydown', e => {
        const map = {
            ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
            w: 'up', s: 'down', a: 'left', d: 'right',
            W: 'up', S: 'down', A: 'left', D: 'right',
        };
        const dir = map[e.key];
        if (dir) { e.preventDefault(); move(dir); }
    });

    let sx = 0, sy = 0, dragging = false, startX = 0, startY = 0;
    let camRotating = false;

    renderer.domElement.addEventListener('pointerdown', e => {
        sx = e.clientX; sy = e.clientY;
        startX = e.clientX; startY = e.clientY;
        dragging = true;
        camRotating = e.button === 2 || e.shiftKey;
        renderer.domElement.setPointerCapture(e.pointerId);
    });

    renderer.domElement.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        if (camRotating) {
            targetRotY += dx * 0.008;
            targetRotX = Math.max(0.15, Math.min(1.2, targetRotX + dy * 0.008));
            sx = e.clientX; sy = e.clientY;
        } else if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) {
            // 切换到视角旋转模式
            const totalDx = e.clientX - startX;
            const totalDy = e.clientY - startY;
            if (Math.abs(totalDx) > Math.abs(totalDy)) {
                // 先不急，等 touchend 决定方向
            }
        }
    });

    renderer.domElement.addEventListener('pointerup', e => {
        if (!dragging) return;
        dragging = false;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        if (adx < 25 && ady < 25) return;
        if (camRotating) return;
        if (adx > ady) move(dx > 0 ? 'right' : 'left');
        else move(dy > 0 ? 'down' : 'up');
    });

    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    document.getElementById('restart').addEventListener('click', resetGame);
    document.getElementById('overlay-btn').addEventListener('click', resetGame);
}

function showOverlay(title, finalScore) {
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-score').textContent = `最终分数 · ${finalScore}`;
    document.getElementById('overlay').classList.remove('hidden');
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    currentRotY += (targetRotY - currentRotY) * 0.12;
    currentRotX += (targetRotX - currentRotX) * 0.12;
    const cosX = Math.cos(currentRotX);
    camera.position.x = Math.sin(currentRotY) * cosX * camDist;
    camera.position.y = Math.sin(currentRotX) * camDist + 1.5;
    camera.position.z = Math.cos(currentRotY) * cosX * camDist;
    camera.lookAt(0, 0, 0);

    boardGroup.rotation.y = currentRotY * 0.1;

    renderer.render(scene, camera);
}

function saveBest() { try { localStorage.setItem('best3d2048', best); } catch {} }
function loadBest() {
    try {
        const v = parseInt(localStorage.getItem('best3d2048') || '0', 10);
        if (!isNaN(v)) { best = v; document.getElementById('best').textContent = v; }
    } catch {}
}

init();