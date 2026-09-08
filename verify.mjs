// Headless logic verification for CosmoCraft world systems.
// Run: node verify.mjs
import * as THREE from 'three';
import { World, CHUNK_SIZE, WORLD_HEIGHT } from './src/world.js';
import { makeSeeded, hash2 } from './src/noise.js';

const scene = new THREE.Scene();
const world = new World(makeSeeded('cosmocraft'), scene);

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name); }
};
const fillAround = (x, z) => {
  for (let i = 0; i < 80; i++) world.updateAround(x, z, 3);
};
const countBlocks = (id) => {
  let n = 0;
  for (const c of world.chunks.values())
    for (let i = 0; i < c.blocks.length; i++) if (c.blocks[i] === id) n++;
  return n;
};

// 1. hash2 quality: no collisions across spread samples
const uniq = new Set();
for (let i = 0; i < 1000; i++) uniq.add(hash2(i, i * 7, 12345));
check(`hash2 spreads 1000 samples into ${uniq.size} unique values`, uniq.size === 1000);

// 2. chunk creation is budgeted per updateAround call
world.updateAround(0, 0, 3);
check(`budgeted load: ${world.chunks.size} chunks after 1 call (<= 2)`, world.chunks.size <= 2);
fillAround(0, 0);
check(`all 49 chunks load (${world.chunks.size})`, world.chunks.size === 49);

// 3. terrain height stays within world bounds
let hOk = true;
for (let i = 0; i < 500; i++) {
  const h = world.heightAt((i * 37) % 500 - 250, (i * 91) % 500 - 250);
  if (h < 2 || h > WORLD_HEIGHT - 8) hOk = false;
}
check('heightAt within [2, 56]', hOk);

// 4. meshes are indexed quads (4 verts shared per 2 triangles)
let geoOk = true, meshCount = 0;
for (const c of world.chunks.values()) {
  if (!c.mesh) continue;
  meshCount++;
  const idx = c.mesh.geometry.getIndex();
  const pos = c.mesh.geometry.getAttribute('position');
  if (!idx || idx.count % 6 !== 0 || idx.count / 6 * 4 !== pos.count) geoOk = false;
}
check(`${meshCount} solid meshes use indexed 4-vert quads`, geoOk && meshCount === 49);

// 5. trees generate on the green planet
const wood = countBlocks(7), leaves = countBlocks(8);
check(`翡翠星 has trees (wood=${wood}, leaves=${leaves})`, wood > 0 && leaves > 0);

// 6. trunks sit on grass, canopy is above ground
let trunkOk = true;
for (const c of world.chunks.values()) {
  for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
      if (c.blocks[y * 256 + lz * 16 + lx] === 7 && c.blocks[(y - 1) * 256 + lz * 16 + lx] === 0) trunkOk = false;
    }
  }
}
check('no floating tree trunks', trunkOk);

// 7. desert planet has no trees
world.setPlanet(1);
fillAround(0, 0);
check(`红砂星 has no trees (wood=${countBlocks(7)})`, countBlocks(7) === 0);

// 8. water exists somewhere on the green planet and gets its own mesh
// (sea level 14 sits below the terrain near spawn, so scan outward for a basin)
world.setPlanet(0);
let waterCol = null, minH = 1e9;
for (let x = -3000; x <= 3000 && !waterCol; x += 8) {
  for (let z = -3000; z <= 3000; z += 8) {
    const h = world.heightAt(x, z);
    if (h < minH) minH = h;
    if (h < 13) { waterCol = [x, z]; break; }
  }
}
check(`found terrain below sea level (min h=${minH})`, !!waterCol);
if (waterCol) {
  fillAround(waterCol[0], waterCol[1]);
  const wc = world.chunks.get(Math.floor(waterCol[0] / CHUNK_SIZE) + ',' + Math.floor(waterCol[1] / CHUNK_SIZE));
  check(`water blocks generated at (${waterCol})`, countBlocks(15) > 0);
  check('ocean chunk has a transparent mesh', !!wc?.tmesh);
}

// 8b. same-id transparent culling: a 3x3x3 glass cube in the sky keeps only
// its 54 outer quads (324 indices), not 27*6 faces
fillAround(0, 0);
const BASE = 58;
for (let x = 10; x < 13; x++) for (let y = BASE; y < BASE + 3; y++) for (let z = 10; z < 13; z++) {
  world.setBlock(x, y, z, 15);
}
const gc = world.chunks.get('0,0');
const gIdx = gc.tmesh.geometry.getIndex();
check(`glass cube culled to 54 quads (${gIdx.count / 6} actual)`, gIdx.count === 324);

// 9. bedrock is unbreakable
world.setBlock(0, 0, 0, 0);
check('bedrock survives mining', world.getBlock(0, 0, 0) === 13);

// 10. normal block edits still work
world.setBlock(0, 40, 0, 3);
check('placing a block works', world.getBlock(0, 40, 0) === 3);
world.setBlock(0, 40, 0, 0);
check('breaking a block works', world.getBlock(0, 40, 0) === 0);

// 11. planet cycling wraps correctly
world.setPlanet(4);
check('planet index wraps modulo 4', world.planetIndex === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
