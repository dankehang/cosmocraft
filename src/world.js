import * as THREE from 'three';
import { BLOCKS, AIR, biomeParams, PALETTES } from './blocks.js';
import { fbm, hash2 } from './noise.js';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
const CS2 = CHUNK_SIZE * CHUNK_SIZE;

const FACES = [
  { n: [1,0,0],  corners: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], c:'side' },
  { n: [-1,0,0], corners: [[-1,0,0],[-1,0,1],[-1,1,1],[-1,1,0]], c:'side' },
  { n: [0,1,0],  corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], c:'top' },
  { n: [0,-1,0], corners: [[0,-1,0],[1,-1,0],[1,-1,1],[0,-1,1]], c:'bottom' },
  { n: [0,0,1],  corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], c:'side' },
  { n: [0,0,-1], corners: [[1,0,-1],[0,0,-1],[0,1,-1],[1,1,-1]], c:'side' },
];

export class World {
  constructor(seed, scene) {
    this.seed = seed;
    this.scene = scene;
    this.chunks = new Map(); // "cx,cz" -> { blocks: Uint8Array, mesh, tmesh, filled, maxY, cx, cz }
    this.planetIndex = 0;
    this.planet = null;
    this.setPlanet(0);
  }

  setPlanet(index) {
    this.planetIndex = index % PALETTES.length;
    const pal = PALETTES[this.planetIndex];
    this.biome = pal.ground;
    this.params = biomeParams(this.biome);
    this.skyColor = pal.sky;
    // clear all chunks
    for (const c of this.chunks.values()) {
      if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); }
      if (c.tmesh) { this.scene.remove(c.tmesh); c.tmesh.geometry.dispose(); }
    }
    this.chunks.clear();
  }

  heightAt(x, z) {
    const s = this.seed;
    const p = this.params;
    const region = fbm(x * 0.008, z * 0.008, s + 1000, 3);
    const detail = fbm(x * 0.05, z * 0.05, s + 2000, 4);
    let h = 10 + region * 30 * p.hill + (detail - 0.5) * 12;
    return Math.max(2, Math.min(WORLD_HEIGHT - 8, Math.floor(h)));
  }

  blockIdAt(x, y, z, h, vein) {
    const p = this.params;
    if (y > h) {
      if (p.water > 2 && y <= p.water) return 15; // translucent water (visual only)
      return AIR;
    }
    if (y === h) return p.topBlocks[0];
    // stone by default, with ore veins and bedrock
    if (y <= 1) return 13; // bedrock
    const d = h - y;
    if (d < 6 && vein > 0.62) return 9;
    if (d < 20 && vein > 0.7) return 10;
    if (d < 34 && vein > 0.78) return 11;
    if (d > 20 && vein > 0.85) return 12;
    if (d > 8) return 3; // stone
    return p.topBlocks[1] || 2; // dirt / sand under top
  }

  getChunk(cx, cz) {
    const key = cx + ',' + cz;
    let c = this.chunks.get(key);
    if (!c) {
      c = { blocks: new Uint8Array(CS2 * WORLD_HEIGHT), mesh: null, tmesh: null, filled: false, maxY: 0, cx, cz, key };
      this.chunks.set(key, c);
      this.fillChunk(c, cx, cz);
    }
    return c;
  }

  fillChunk(c, cx, cz) {
    const b = c.blocks;
    const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
    const water = this.params.water;
    let maxY = 0;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = bx + lx, wz = bz + lz;
        const h = this.heightAt(wx, wz);
        // ore veins only vary with x/z — sample once per column, not per block
        const vein = fbm(wx * 0.18, wz * 0.18, this.seed + 4000, 3);
        const top = water > 2 ? Math.max(h, water) : h;
        if (top >= maxY) maxY = top + 1;
        for (let ly = 0; ly <= top; ly++) {
          b[ly * CS2 + lz * CHUNK_SIZE + lx] = this.blockIdAt(wx, ly, wz, h, vein);
        }
      }
    }
    c.maxY = maxY;
    this.plantTrees(c, cx, cz);
    c.filled = true;
  }

  // Stamp trees deterministically from world coordinates so canopies cross
  // chunk borders seamlessly. Runs on green / snow planets only.
  plantTrees(c, cx, cz) {
    if (this.params.feature !== 'trees') return;
    const b = c.blocks;
    const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
    const p = this.params;
    const put = (wx, wy, wz, id, overLeaves) => {
      const lx = wx - bx, lz = wz - bz;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
      if (wy < 0 || wy >= WORLD_HEIGHT) return;
      const i = wy * CS2 + lz * CHUNK_SIZE + lx;
      const cur = b[i];
      if (cur !== AIR && !(overLeaves && cur === 8)) return;
      b[i] = id;
      if (wy + 1 > c.maxY) c.maxY = wy + 1;
    };
    for (let dz = -2; dz < CHUNK_SIZE + 2; dz++) {
      for (let dx = -2; dx < CHUNK_SIZE + 2; dx++) {
        const wx = bx + dx, wz = bz + dz;
        // density gate before heightAt so noise runs for ~1% of the scanned columns
        if (hash2(wx, wz, this.seed + 7000) < 0.988) continue;
        const h = this.heightAt(wx, wz);
        if (h <= p.water || h + 8 >= WORLD_HEIGHT) continue;
        const th = 4 + Math.floor(hash2(wx, wz, this.seed + 8000) * 2); // trunk 4-5
        for (let i = 1; i <= th; i++) put(wx, h + i, wz, 7, true);
        for (let dy = th - 2; dy <= th + 1; dy++) {
          const rad = dy <= th - 1 ? 2 : 1;
          for (let ox = -rad; ox <= rad; ox++) {
            for (let oz = -rad; oz <= rad; oz++) {
              if (ox === 0 && oz === 0 && dy <= th) continue; // trunk
              // clip canopy corners for a rounder silhouette
              if (Math.abs(ox) === rad && Math.abs(oz) === rad &&
                  (dy > th || hash2(wx + ox, wz + oz, this.seed + 9000) < 0.6)) continue;
              put(wx + ox, h + dy, wz + oz, 8, false);
            }
          }
        }
      }
    }
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(cx + ',' + cz);
    if (!c) return AIR;
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    return c.blocks[y * CS2 + lz * CHUNK_SIZE + lx];
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(cx + ',' + cz);
    if (!c) return;
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    const i = y * CS2 + lz * CHUNK_SIZE + lx;
    if (id === 0 && c.blocks[i] === 13) return; // bedrock is unbreakable
    c.blocks[i] = id;
    if (id !== 0 && y + 1 > c.maxY) c.maxY = y + 1;
    this.remesh(cx, cz);
    // neighbor chunks affected only at borders
    const remesh = (dx, dz) => {
      const nb = this.chunks.get((cx + dx) + ',' + (cz + dz));
      if (nb) this.remesh(cx + dx, cz + dz);
    };
    if (lx === 0) remesh(-1, 0);
    if (lx === CHUNK_SIZE - 1) remesh(1, 0);
    if (lz === 0) remesh(0, -1);
    if (lz === CHUNK_SIZE - 1) remesh(0, 1);
  }

  isSolid(x, y, z) {
    const id = this.getBlock(x, y, z);
    return id !== AIR && !BLOCKS[id].transparent;
  }

  isTransparent(x, y, z) {
    const id = this.getBlock(x, y, z);
    return id === AIR || (BLOCKS[id] && BLOCKS[id].transparent);
  }

  remesh(cx, cz) {
    const c = this.chunks.get(cx + ',' + cz);
    if (!c) return;
    if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
    if (c.tmesh) { this.scene.remove(c.tmesh); c.tmesh.geometry.dispose(); c.tmesh = null; }
    this.buildMesh(c, false, cx, cz);
    this.buildMesh(c, true, cx, cz);
  }

  buildMesh(c, transparent, cx, cz) {
    const positions = [], colors = [], normals = [], indices = [];
    this.buildMeshFromFaces(c, positions, colors, normals, indices, transparent, cx, cz);
    if (!positions.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    if (transparent) {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
      c.tmesh = new THREE.Mesh(geo, mat);
      c.tmesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      this.scene.add(c.tmesh);
    } else {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      c.mesh = new THREE.Mesh(geo, mat);
      c.mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      this.scene.add(c.mesh);
    }
  }

  // Gather visible faces into an indexed-triangle geometry with normals.
  buildMeshFromFaces(c, positions, colors, normals, indices, transparent, cx, cz) {
    const b = c.blocks;
    const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
    const maxY = Math.min(c.maxY || WORLD_HEIGHT, WORLD_HEIGHT);
    // fast in-chunk lookup; world lookup only for the 4 borders
    const getB = (wx, wy, wz) => {
      if (wy < 0 || wy >= WORLD_HEIGHT) return AIR;
      const lx = wx - bx, lz = wz - bz;
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
        return b[wy * CS2 + lz * CHUNK_SIZE + lx];
      }
      return this.getBlock(wx, wy, wz);
    };
    for (let ly = 0; ly < maxY; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = b[ly * CS2 + lz * CHUNK_SIZE + lx];
          if (id === AIR) continue;
          const def = BLOCKS[id];
          const trans = !!def.transparent;
          if (trans !== transparent) continue;
          const wx = bx + lx, wz = bz + lz;
          for (const face of FACES) {
            const nx = wx + face.n[0], ny = ly + face.n[1], nz = wz + face.n[2];
            const neighborId = getB(nx, ny, nz);
            if (trans && neighborId === id) continue; // no faces inside water/glass volumes
            const nbDef = BLOCKS[neighborId];
            const nbTransparent = neighborId === AIR || (nbDef && nbDef.transparent);
            if (!nbTransparent) continue;
            if (trans && !nbTransparent) continue;
            const col = def[face.c];
            const corner = face.corners;
            const base = positions.length / 3;
            for (const vi of [0, 1, 2, 3]) {
              positions.push(lx + corner[vi][0], ly + corner[vi][1], lz + corner[vi][2]);
              normals.push(face.n[0], face.n[1], face.n[2]);
              colors.push(col[0] / 255, col[1] / 255, col[2] / 255);
            }
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }
  }

  // Ensure chunks around loaded, creating at most `budget` per call so chunk
  // fills spread across frames instead of hitching on entry/teleport.
  updateAround(px, pz, radius, budget = 2) {
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);
    const missing = [];
    for (let cz = pcz - radius; cz <= pcz + radius; cz++) {
      for (let cx = pcx - radius; cx <= pcx + radius; cx++) {
        const key = cx + ',' + cz;
        if (!this.chunks.has(key)) {
          const dx = cx - pcx, dz = cz - pcz;
          missing.push([dx * dx + dz * dz, cx, cz]);
        } else {
          const c = this.chunks.get(key);
          if (c.filled && !c.mesh && !c.tmesh) this.remesh(cx, cz);
        }
      }
    }
    missing.sort((a, b) => a[0] - b[0]);
    const n = Math.min(budget, missing.length);
    for (let i = 0; i < n; i++) {
      this.getChunk(missing[i][1], missing[i][2]);
      this.remesh(missing[i][1], missing[i][2]);
    }
    // unload far chunks
    for (const [key, c] of this.chunks) {
      const [ocx, ocz] = key.split(',').map(Number);
      if (Math.abs(ocx - pcx) > radius + 2 || Math.abs(ocz - pcz) > radius + 2) {
        if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); }
        if (c.tmesh) { this.scene.remove(c.tmesh); c.tmesh.geometry.dispose(); }
        this.chunks.delete(key);
      }
    }
  }
}

// Shared single block mesh for placement preview / mining spark
const boxGeo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
export const blockHighlight = new THREE.Mesh(boxGeo, boxMat);
blockHighlight.visible = false;
