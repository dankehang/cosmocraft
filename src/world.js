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
    this.chunks = new Map(); // "cx,cz" -> { blocks: Uint8Array, mesh, tmesh, filled }
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

  blockIdAt(x, y, z, h) {
    const p = this.params;
    if (y > h) {
      if (p.water > 2 && y <= p.water) return 15; // glass-like translucent water marker (visual only)
      return AIR;
    }
    if (y === h) {
      // ore surface variation a touch
      return p.topBlocks[0];
    }
    // stone by default, with ore veins and bedrock
    if (y <= 1) return 13; // bedrock
    const vein = fbm(x * 0.18, z * 0.18, this.seed + 4000, 3);
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
      c = { blocks: new Uint8Array(CS2 * WORLD_HEIGHT), mesh: null, tmesh: null, filled: false, key };
      this.chunks.set(key, c);
      this.fillChunk(c, cx, cz);
    }
    return c;
  }

  fillChunk(c, cx, cz) {
    const b = c.blocks;
    const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = bx + lx, wz = bz + lz;
        const h = this.heightAt(wx, wz);
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          b[ly * CS2 + lz * CHUNK_SIZE + lx] = this.blockIdAt(wx, ly, wz, h);
        }
      }
    }
    c.filled = true;
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
    c.blocks[y * CS2 + lz * CHUNK_SIZE + lx] = id;
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
    const positions = [], colors = [], normals = [];
    this.buildMeshFromFaces(c, positions, colors, normals, transparent, cx, cz);
    if (!positions.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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

  // Regather faces into indexed-triangle arrays with normals.
  buildMeshFromFaces(c, positions, colors, normals, transparent, cx, cz) {
    const b = c.blocks;
    const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
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
            const neighborId = this.getBlock(nx, ny, nz);
            const nbDef = BLOCKS[neighborId];
            const nbTransparent = neighborId === AIR || (nbDef && nbDef.transparent);
            if (!nbTransparent) continue;
            if (trans && !nbTransparent) continue;
            const col = def[face.c];
            const corner = face.corners;
            // triangles: (0,1,2),(0,2,3)
            const triPairs = [[0,1,2],[0,2,3]];
            for (const [a,bTri,cTri] of triPairs) {
              for (const vi of [a,bTri,cTri]) {
                positions.push(lx + corner[vi][0], ly + corner[vi][1], lz + corner[vi][2]);
                normals.push(face.n[0], face.n[1], face.n[2]);
                colors.push(col[0]/255, col[1]/255, col[2]/255);
              }
            }
          }
        }
      }
    }
  }

  // ensure chunks around loaded, returning loaded chunk object set
  updateAround(px, pz, radius) {
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);
    // load required
    for (let cz = pcz - radius; cz <= pcz + radius; cz++) {
      for (let cx = pcx - radius; cx <= pcx + radius; cx++) {
        const key = cx + ',' + cz;
        if (!this.chunks.has(key)) {
          const c = this.getChunk(cx, cz);
          this.remesh(cx, cz);
        } else {
          const c = this.chunks.get(key);
          if (c.filled && !c.mesh && !c.tmesh) this.remesh(cx, cz);
        }
      }
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