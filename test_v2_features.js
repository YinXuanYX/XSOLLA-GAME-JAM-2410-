import * as THREE from 'three';
import fs from 'fs';
import { CONFIG } from './src/config.js';
import { PhysicsWorld } from './src/PhysicsWorld.js';
import { PlayerController } from './src/PlayerController.js';
import { CameraController } from './src/CameraController.js';
import { GrappleSystem } from './src/GrappleSystem.js';
import { LevelGenerator } from './src/LevelGenerator.js';
import { UIManager } from './src/UIManager.js';
import { AudioSynth } from './src/AudioSynth.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('================================================================');
console.log('⚡ AERO-HOOK VERSION 2.0 VERIFICATION SUITE');
console.log('================================================================\n');

// 1. Verify Tron Dark Obsidian Blocks & Circuit Bands
console.log('--- TEST 1: Tron Dark Obsidian Blocks & Circuit Bands ---');
const scene = new THREE.Scene();
const physicsWorld = new PhysicsWorld();
const levelGen = new LevelGenerator(scene, physicsWorld);

const tallBlock = levelGen.spawnBlock({
  x: 0,
  y: 10,
  z: -20,
  w: 6,
  h: 24,
  d: 6,
  isHazard: false,
});
assert(tallBlock.mesh.children.length >= 2, 'Tall monolith (h >= 20) has wide neon bands + pilasters');
const hasLineSegments = tallBlock.mesh.children.some((c) => c instanceof THREE.LineSegments);
assert(!hasLineSegments, 'Monolith has NO 1px LineSegments wireframe');
assert(tallBlock.mesh.children.every((c) => c.geometry.parameters.height >= 0.9), 'All neon slabs are wide (>= 0.9m)');
assert(levelGen.grappleableMeshes.includes(tallBlock.mesh), 'Solid base mesh pushed to grappleableMeshes');
assert(levelGen.grappleableMeshes.every((m) => !tallBlock.mesh.children.includes(m)), 'Neon slabs NEVER added to grappleableMeshes');
assert(!levelGen.grappleableMeshes.includes(levelGen.cityGroup), 'cityGroup NEVER in grappleableMeshes');

// 2. Verify Orange Neon Lava Hazard Tiles
console.log('\n--- TEST 2: Orange Neon Lava Hazard Tiles & Hazard Volume Check ---');
const hazardTile = levelGen.spawnBlock({
  x: 10,
  y: 2,
  z: -40,
  w: 8,
  h: 4,
  d: 8,
  isHazard: true,
});
assert(hazardTile.mesh.material.emissive !== undefined, 'Hazard block uses emissive lava material');
assert(levelGen.hazardBodies.includes(hazardTile.body), 'Hazard body pushed to hazardBodies');
const hasHazardBand = hazardTile.mesh.children.some((c) => c.material && c.material.wireframe !== true && !(c instanceof THREE.LineSegments));
assert(hasHazardBand, 'Hazard block has wide glowing orange stripe band');

// Test checkHazardCollision
assert(levelGen.checkHazardCollision({ x: 10, y: 2, z: -40 }, 1.0) === true, 'Direct collision detected with hazard tile');
assert(levelGen.checkHazardCollision({ x: 10, y: 15, z: -40 }, 1.0) === false, 'Safe distance does NOT trigger hazard collision');

// 3. Verify Strict Z-Fighting Elimination
console.log('\n--- TEST 3: Strict Z-Fighting Elimination (Start Pad & Octagons) ---');
const pad = levelGen.spawnStartPad();
assert(levelGen.startPad.meshes.length >= 3, 'Start Pad has separate base, trim, and marker meshes');
// Check top trim ring position (physically +0.05m above top face)
const trimMesh = levelGen.startPad.meshes.find((m) => m instanceof THREE.Mesh && m.position.y === 0.05);
assert(trimMesh !== undefined, 'Top neon trim ring placed at y = +0.05m (5cm above top face)');
assert(trimMesh.material.polygonOffset === true, 'Top trim ring has polygonOffset enabled');

// Check Octagon Ring Alternating Segment Offsets
const chunk3 = { meshes: [], bodies: [] };
levelGen.buildChunk3_ThreadingRings({ x: 0, y: 0, z: -100 }, levelGen.rng, chunk3);
// In each ring, odd segments have different dimensions than even segments
const seg0 = chunk3.meshes[0];
const seg1 = chunk3.meshes[1];
assert(seg0 && seg1, 'Octagon ring segments spawned');
assert(seg1.position.z !== seg0.position.z, 'Odd segments shifted along Z (+0.04m) to prevent bevel Z-fighting');

// 4. Verify Animated Wave Lava Abyss & 120 Rising Embers
console.log('\n--- TEST 4: Animated Wave Lava Abyss & 120 Rising Embers ---');
assert(levelGen.abyssGroup.position.y === CONFIG.LEVEL.ABYSS_VISUAL_Y, 'Abyss plane at Y = -35m');
assert(levelGen.abyssGeo.parameters.widthSegments === 56, 'Abyss grid is 56x56 resolution');
assert(levelGen.emberCount === 120, '120 rising embers initialized');
assert(levelGen.embers.length === 120, '120 ember state objects tracked');

// Test updateAbyss
const pPos = { x: 23.4, y: 5.0, z: -87.2 };
levelGen.updateAbyss(1 / 60, 2.5, pPos);
// Snapping to 10m increments: x=20, z=-90
assert(levelGen.abyssGroup.position.x === 20, 'Abyss X snapped to 10m grid increment');
assert(levelGen.abyssGroup.position.z === -90, 'Abyss Z snapped to 10m grid increment');

// Embers rising
levelGen.embers[0].y = -30.0;
const initialEmberY = levelGen.embers[0].y;
levelGen.updateAbyss(1.0, 3.5, pPos); // 1 second step
assert(levelGen.embers[0].y > initialEmberY, 'Ember rose upward with positive speedY');

// 5. Verify Beat Saber Red/Blue HUD & Speed Lines
console.log('\n--- TEST 5: Beat Saber Red & Blue HUD Styling in style.css ---');
const cssContent = fs.readFileSync('style.css', 'utf-8');
assert(cssContent.includes('#bracket-left.active') || cssContent.includes('.bracket-left.active'), 'Left bracket active rule exists');
assert(cssContent.includes('#ff0044'), 'Beat Saber Crimson Red (#ff0044) present in CSS');
assert(cssContent.includes('#00aaff'), 'Beat Saber Electric Blue (#00aaff) present in CSS');
assert(cssContent.includes('linear-gradient(90deg, #ff0044 0%, #00f0ff 50%, #00aaff 100%)'), 'Speed bar has Red->Cyan->Blue gradient');
assert(cssContent.includes('rgba(4, 7, 17, 0.82)'), 'Dark Tron glassmorphism background applied');
assert(cssContent.includes('rgba(0, 240, 255, 0.28)'), 'Tron border highlight applied');

// 6. Verify UIManager Hook Bracket Toggling & Speed Lines
console.log('\n--- TEST 6: UIManager Dynamic Crosshair & Radial Speed Lines ---');
const ui = new UIManager();
assert(typeof ui.renderSpeedLines === 'function', 'renderSpeedLines exists');
assert(ui.speedLines.length === 55, '55 speed lines particles initialized');
assert(ui.speedLines.some((l) => l.colorIndex === 0), 'Speed lines include Red (index 0)');
assert(ui.speedLines.some((l) => l.colorIndex === 1), 'Speed lines include Cyan (index 1)');
assert(ui.speedLines.some((l) => l.colorIndex === 2), 'Speed lines include Blue (index 2)');

let leftBracketToggled = false;
let rightBracketToggled = false;
ui.dom.bracketLeft = { classList: { toggle: (cls, active) => { if (cls === 'active') leftBracketToggled = active; } } };
ui.dom.bracketRight = { classList: { toggle: (cls, active) => { if (cls === 'active') rightBracketToggled = active; } } };

ui.updateHUD({ hooks: { left: { active: true }, right: { active: false } } });
assert(leftBracketToggled === true, 'Left hook bracket toggled active via hooks object');
assert(rightBracketToggled === false, 'Right hook bracket toggled inactive via hooks object');

// 7. Verify main.js Logarithmic Depth Buffer & DYING State
console.log('\n--- TEST 7: main.js Logarithmic Depth Buffer & DYING State ---');
const mainContent = fs.readFileSync('src/main.js', 'utf-8');
assert(mainContent.includes('logarithmicDepthBuffer: true'), 'logarithmicDepthBuffer enabled on WebGLRenderer');
assert(mainContent.includes("gameState = 'DYING'"), 'DYING state transition implemented');
assert(mainContent.includes('triggerPlayerDeath'), 'triggerPlayerDeath helper implemented');
assert(mainContent.includes('DEATH_DELAY_MS'), 'CONFIG.FX.DEATH_DELAY_MS delay checked in animate loop');
assert(mainContent.includes('checkHazardCollision'), 'checkHazardCollision called in animate loop');

console.log('\n================================================================');
console.log('🎉 ALL VERSION 2.0 REQUIREMENTS FULLY VERIFIED AND PASSING!');
console.log('================================================================');
