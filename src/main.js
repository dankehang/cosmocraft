import * as THREE from 'three';
import { World, CHUNK_SIZE } from './world.js';
import { Player } from './player.js';
import { BLOCKS, PALETTES } from './blocks.js';
import { makeSeeded } from './noise.js';

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);

// lights
const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x3a3530, 0.9);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff2d0, 1.3);
scene.add(sunLight);
const sunSprite = new THREE.Mesh(
  new THREE.SphereGeometry(4, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffe9b8 })
);
scene.add(sunSprite);

// ---------- world / player ----------
const seed = makeSeeded('cosmocraft');
const world = new World(seed, scene);
const player = new Player(camera, renderer.domElement, world);

// ---------- sky & sun per planet ----------
const background = new THREE.Color();
function applyPlanetVisuals() {
  const pal = PALETTES[world.planetIndex];
  background.set(pal.sky);
  scene.background = background;
  scene.fog = new THREE.Fog(pal.fog, 30, 100);
  hemi.color.set(pal.atmosphere).multiplyScalar(1.4);
  sunSprite.material.color.set(pal.sun);
  document.getElementById('planet-label').textContent =
    `🌍 ${pal.name} · 星球 ${world.planetIndex + 1}/${PALETTES.length}`;
}
applyPlanetVisuals();

// ---------- hotbar ----------
const PLACEABLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 15, 16];
let selected = 0;
function buildHotbar() {
  const bar = document.getElementById('hotbar');
  bar.innerHTML = '';
  PLACEABLE.forEach((id, i) => {
    const def = BLOCKS[id];
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.id = id;
    slot.dataset.index = i;
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = `rgb(${def.top[0]},${def.top[1]},${def.top[2]})`;
    const label = document.createElement('div');
    label.className = 'count';
    label.textContent = (i + 1) + '·' + def.name;
    slot.append(sw, label);
    bar.appendChild(slot);
  });
  selectSlot(0);
}
function selectSlot(i) {
  const slots = document.querySelectorAll('#hotbar .slot');
  slots.forEach(s => s.classList.toggle('active', +s.dataset.index === i));
  selected = i % PLACEABLE.length;
}
buildHotbar();

document.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5));
    if (n >= 1 && n <= PLACEABLE.length) selectSlot(n - 1);
  }
});
document.addEventListener('wheel', (e) => {
  if (!player.pointerLocked) return;
  selectSlot((selected + (e.deltaY > 0 ? 1 : -1) + PLACEABLE.length) % PLACEABLE.length);
});

// ---------- input: break / place ----------
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
let pointedMesh = null;

function floorVec(v) {
  return new THREE.Vector3(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z));
}

function getTerrainMeshes() {
  const out = [];
  for (const c of world.chunks.values()) {
    if (c.mesh) out.push(c.mesh, c.tmesh);
  }
  return out;
}

function pick(distance) {
  raycaster.setFromCamera(center, camera);
  const hits = raycaster.intersectObjects(getTerrainMeshes(), false).filter(h =>
    h.object.userData.noBlock !== true
  );
  if (!hits.length) return null;
  const hit = hits[0];
  if (hit.distance > distance) return null;
  return hit;
}

// wireframe highlight
import { blockHighlight } from './world.js';
scene.add(blockHighlight);

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!player.pointerLocked) return;
  const hit = pick(7);
  if (!hit) return;
  if (e.button === 0) {
    const b = floorVec(hit.point.clone().sub(hit.face.normal.clone().multiplyScalar(0.5)));
    world.setBlock(b.x, b.y, b.z, 0);
  } else if (e.button === 2) {
    const place = floorVec(hit.point.clone().add(hit.face.normal.clone().multiplyScalar(0.5)));
    const id = PLACEABLE[selected];
    if (world.getBlock(place.x, place.y, place.z) === 0) {
      world.setBlock(place.x, place.y, place.z, id);
    }
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- planet teleport ----------
function nextPlanet() {
  world.setPlanet(world.planetIndex + 1);
  applyPlanetVisuals();
  const n = 1 + Math.floor(Math.random() * 30);
  player.spawn(Math.floor(Math.random() * n * CHUNK_SIZE) - n * CHUNK_SIZE / 2, 45,
    Math.floor(Math.random() * n * CHUNK_SIZE) - n * CHUNK_SIZE / 2, Math.random() * 6.28);
  world.updateAround(player.pos.x, player.pos.z, 3);
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyX') nextPlanet();
});

// ---------- menu / pointer lock ----------
const pauseMenu = document.getElementById('pause-menu');
const hud = document.getElementById('hud');
function lock() {
  pauseMenu.classList.add('hidden');
  hud.classList.remove('hidden');
  renderer.domElement.requestPointerLock();
}
function unlock() {
  pauseMenu.classList.remove('hidden');
  hud.classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
document.getElementById('play-btn').addEventListener('click', lock);
document.getElementById('controls-btn').addEventListener('click', () => {
  document.getElementById('controls-panel').classList.toggle('hidden');
});
renderer.domElement.addEventListener('click', () => {
  if (!player.pointerLocked) lock();
});
document.addEventListener('pointerlockchange', () => {
  if (!player.pointerLocked) unlock();
});

// ---------- HUD refresh ----------
const fpsEl = document.getElementById('fps');
const coordEl = document.getElementById('coords');
let fps = 0, frames = 0, lastFpsTime = performance.now();

// ---------- resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- game loop ----------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (player.pointerLocked) {
    player.update(dt);
    world.updateAround(player.pos.x, player.pos.z, 3);

    // sun follows player
    sunLight.position.set(player.pos.x + 120, 200, player.pos.z + 60);
    sunSprite.position.set(player.pos.x + 100, 140, player.pos.z + 60);

    // pointing highlight
    const hit = pick(7);
    if (hit) {
      const b = floorVec(hit.point.clone().sub(hit.face.normal.clone().multiplyScalar(0.5)));
      blockHighlight.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
      blockHighlight.visible = true;
      pointedMesh = hit.object;
    } else {
      blockHighlight.visible = false;
      pointedMesh = null;
    }

    coordEl.textContent =
      `坐标 X ${player.pos.x.toFixed(0)}  Y ${player.pos.y.toFixed(0)}  Z ${player.pos.z.toFixed(0)}  ` +
      `速度 ${player.flying ? '🕊 飞行' : '👟 行走'}  ` +
      `重力 ${player.flying ? '关闭' : '开启'}`;
  }

  // FPS
  frames++;
  const now = performance.now();
  if (now - lastFpsTime >= 500) {
    fps = Math.round((frames * 1000) / (now - lastFpsTime));
    frames = 0;
    lastFpsTime = now;
    fpsEl.textContent = 'FPS ' + fps;
  }

  renderer.render(scene, camera);
}
tick();