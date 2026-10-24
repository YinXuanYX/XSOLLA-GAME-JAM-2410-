import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

/**
 * PhysicsWorld manages the cannon-es physics simulation,
 * materials, and contact behaviors for AERO-HOOK.
 */
export class PhysicsWorld {
  constructor() {
    // 1. Initialize CANNON.World with gravity and SAPBroadphase along the -Z corridor
    this.world = new CANNON.World();
    this.world.gravity.set(0, CONFIG.PHYSICS.GRAVITY, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    // Align SAP sorting with the -Z corridor for optimal spatial pruning (PRD Section 4.2)
    this.world.broadphase.axisIndex = 2;

    // 2. Materials
    this.playerMaterial = new CANNON.Material('player');
    this.worldMaterial = new CANNON.Material('world');

    // 3. Contact material with zero friction for wall skimming & slight restitution
    this.contactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.worldMaterial,
      {
        friction: CONFIG.PHYSICS.WALL_FRICTION,
        restitution: CONFIG.PHYSICS.WALL_RESTITUTION,
      }
    );
    this.world.addContactMaterial(this.contactMaterial);

    // Defensive fallback: ensure default contact material also matches zero friction
    if (this.world.defaultContactMaterial) {
      this.world.defaultContactMaterial.friction = CONFIG.PHYSICS.WALL_FRICTION;
      this.world.defaultContactMaterial.restitution = CONFIG.PHYSICS.WALL_RESTITUTION;
    }
  }

  /**
   * Advance the physics simulation by time dt using fixed substepping.
   * Protects against NaN/negative poisoning of the internal accumulator.
   * @param {number} [dt] Delta time in seconds since last frame
   */
  step(dt = CONFIG.PHYSICS.TIMESTEP) {
    const validDt = typeof dt === 'number' && Number.isFinite(dt) && dt > 0
      ? dt
      : (dt === undefined ? CONFIG.PHYSICS.TIMESTEP : 0);

    if (validDt <= 0) {
      return;
    }

    this.world.step(CONFIG.PHYSICS.TIMESTEP, validDt, CONFIG.PHYSICS.MAX_SUBSTEPS);
  }

  /**
   * Add a physics body to the world.
   * @param {CANNON.Body} body
   */
  addBody(body) {
    if (body) {
      this.world.addBody(body);
    }
  }

  /**
   * Remove a physics body from the world.
   * @param {CANNON.Body} body
   */
  removeBody(body) {
    if (body) {
      this.world.removeBody(body);
    }
  }

  /**
   * Alias for addBody
   * @param {CANNON.Body} body
   */
  add(body) {
    this.addBody(body);
  }

  /**
   * Alias for removeBody
   * @param {CANNON.Body} body
   */
  remove(body) {
    this.removeBody(body);
  }

  /**
   * Get all active physics bodies in the simulation world.
   * @returns {Array<CANNON.Body>}
   */
  get bodies() {
    return this.world.bodies;
  }

  /**
   * Remove all bodies from the physics world and reset accumulator.
   */
  clear() {
    for (let i = this.world.bodies.length - 1; i >= 0; i--) {
      this.world.removeBody(this.world.bodies[i]);
    }
    this.world.accumulator = 0;
  }
}

export default PhysicsWorld;
