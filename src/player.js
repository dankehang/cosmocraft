import * as THREE from 'three';
import { WORLD_HEIGHT } from './world.js';

// shared with main.js for the block-placement overlap check
export const EYE_HEIGHT = 1.62;
export const HALF_W = 0.3;
const GRAVITY = 26;
const WALK_SPEED = 5.2;
const FLY_SPEED = 9.0;
const JUMP_V = 8.2;
const EPS = 0.001;

export class Player {
  constructor(camera, domElement, world) {
    this.camera = camera;
    this.dom = domElement;
    this.world = world;
    this.pos = new THREE.Vector3(0, 30, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = true; // start flying so player can survey the world
    this.keys = {};
    this.pointerLocked = false;

    this.bindInput();
  }

  bindInput() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyF') this.flying = !this.flying;
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
    });
  }

  spawn(x, y, z, yaw) {
    this.pos.set(x, y || 40, z);
    this.yaw = yaw || 0;
    this.vel.set(0, 0, 0);
  }

  lookAtCamera() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.position.copy(this.pos);
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  collides(x, y, z) {
    const feet = y - EYE_HEIGHT;
    const top = y;
    for (let by = Math.floor(feet); by <= Math.floor(top); by++) {
      if (by < 0 || by >= WORLD_HEIGHT) return top >= WORLD_HEIGHT;
      for (let bx = Math.floor(x - HALF_W); bx <= Math.floor(x + HALF_W); bx++) {
        for (let bz = Math.floor(z - HALF_W); bz <= Math.floor(z + HALF_W); bz++) {
          if (this.world.isSolid(bx, by, bz)) return true;
        }
      }
    }
    return false;
  }

  tryMove(dx, dy, dz) {
    // X axis
    let nx = this.pos.x + dx;
    if (!this.collides(nx, this.pos.y, this.pos.z)) this.pos.x = nx;
    else {
      // attempt slide
      if (Math.abs(dx) > EPS) this.vel.x = 0;
    }
    // Y axis
    let ny = this.pos.y + dy;
    if (!this.collides(this.pos.x, ny, this.pos.z)) {
      this.pos.y = ny;
      this.onGround = false;
    } else {
      if (dy < 0) this.onGround = true;
      if (Math.abs(dy) > EPS) this.vel.y = 0;
    }
    // Z axis
    let nz = this.pos.z + dz;
    if (!this.collides(this.pos.x, this.pos.y, nz)) this.pos.z = nz;
    else if (Math.abs(dz) > EPS) this.vel.z = 0;
  }

  update(dt) {
    const fwd = this.forward();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x); // camera right

    let moveX = 0, moveZ = 0;
    if (this.keys['KeyW']) { moveX += fwd.x; moveZ += fwd.z; }
    if (this.keys['KeyS']) { moveX -= fwd.x; moveZ -= fwd.z; }
    if (this.keys['KeyA']) { moveX -= right.x; moveZ -= right.z; }
    if (this.keys['KeyD']) { moveX += right.x; moveZ += right.z; }
    const len = Math.hypot(moveX, moveZ) || 1;
    moveX /= len; moveZ /= len;

    if (this.flying) {
      const speed = FLY_SPEED * (this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? 2.5 : 1);
      this.vel.x = moveX * speed;
      this.vel.z = moveZ * speed;
      if (this.keys['Space']) this.vel.y = speed * 0.7;
      else if (this.keys['KeyZ'] || this.keys['ControlLeft']) this.vel.y = -speed * 0.7;
      else this.vel.y = 0;
      this.tryMove(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    } else {
      this.vel.x = moveX * WALK_SPEED;
      this.vel.z = moveZ * WALK_SPEED;
      this.vel.y -= GRAVITY * dt;
      if (this.keys['Space']) {
        if (this.onGround) this.vel.y = JUMP_V;
        else this.vel.y += 20 * dt; // 长按轻微悬浮
      }
      this.tryMove(this.vel.x * dt, Math.max(this.vel.y, -50) * dt, this.vel.z * dt);
    }
    this.lookAtCamera();
  }
}