import * as THREE from 'three';
import { RiggedMannequinHandle } from './proceduralMannequin';
import { sceneRegistry } from './sceneRegistry';
import { solveLimbIK } from './ikSolver';
import { BoneRotationsMap, Vec3Tuple } from '../types/pose';
import { quaternionToDegTuple } from './poseUtils';

const _raycaster = new THREE.Raycaster();
const _downDir = new THREE.Vector3(0, -1, 0);

/**
 * Raycasts downward from (x, startY, z) against all unattached studio props + the y=0 floor.
 * Returns the highest contact surface Y coordinate (minimum 0 for the studio floor).
 */
export function raycastDownwardSurfaceY(
  x: number,
  z: number,
  startY = 4.0
): number {
  const targets = sceneRegistry.getSurfaceRaycastTargets();
  if (targets.length === 0) return 0;

  _raycaster.set(new THREE.Vector3(x, startY, z), _downDir);
  _raycaster.near = 0;
  _raycaster.far = startY + 2;

  const hits = _raycaster.intersectObjects(targets, false);
  if (hits.length > 0) {
    return Math.max(0, hits[0].point.y);
  }
  return 0;
}

/**
 * Snaps both feet onto the surfaces directly beneath them (floor, steps, box, platform)
 * using downward THREE.Raycaster hits + hips elevation adjustment + 2-bone leg IK.
 */
export function snapFeetToSurface(handle: RiggedMannequinHandle): {
  hipsPosition: Vec3Tuple;
  bones: BoneRotationsMap;
  hitElevation: number;
} | null {
  const hips = handle.bones.hips;
  const leftFoot = handle.bones.leftFoot;
  const rightFoot = handle.bones.rightFoot;
  if (!hips || !hips.parent || !leftFoot || !rightFoot) return null;

  handle.root.updateMatrixWorld(true);

  const lfWorld = new THREE.Vector3();
  const rfWorld = new THREE.Vector3();
  leftFoot.getWorldPosition(lfWorld);
  rightFoot.getWorldPosition(rfWorld);

  const leftSurfaceY = raycastDownwardSurfaceY(lfWorld.x, lfWorld.z, Math.max(3.5, lfWorld.y + 1.5));
  const rightSurfaceY = raycastDownwardSurfaceY(rfWorld.x, rfWorld.z, Math.max(3.5, rfWorld.y + 1.5));

  const targetLeftY = leftSurfaceY + handle.footSoleOffset;
  const targetRightY = rightSurfaceY + handle.footSoleOffset;

  // Shift hips vertically by the delta of the lower foot so legs stay within comfortable reach
  const currentLowestFootY = Math.min(lfWorld.y, rfWorld.y);
  const targetLowestFootY = Math.min(targetLeftY, targetRightY);
  const deltaY = targetLowestFootY - currentLowestFootY;

  hips.position.y = Math.max(0.12, hips.position.y + deltaY);
  handle.root.updateMatrixWorld(true);

  // Solve 2-bone IK for both legs so each foot plants solidly on its exact surface elevation
  const boneUpdates: BoneRotationsMap = {};
  const leftTarget = new THREE.Vector3(lfWorld.x, targetLeftY, lfWorld.z);
  const rightTarget = new THREE.Vector3(rfWorld.x, targetRightY, rfWorld.z);

  Object.assign(boneUpdates, solveLimbIK(handle, 'leftFoot', leftTarget));
  Object.assign(boneUpdates, solveLimbIK(handle, 'rightFoot', rightTarget));

  // Level both feet parallel to the supporting surface while preserving character yaw
  const hipsWorldQ = new THREE.Quaternion();
  hips.getWorldQuaternion(hipsWorldQ);
  const hipsEuler = new THREE.Euler().setFromQuaternion(hipsWorldQ, 'YXZ');
  const flatWorldQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, hipsEuler.y, 0, 'YXZ')
  );

  for (const footName of ['leftFoot', 'rightFoot'] as const) {
    const fb = handle.bones[footName];
    if (fb && fb.parent) {
      fb.parent.updateWorldMatrix(true, false);
      const pq = new THREE.Quaternion();
      fb.parent.getWorldQuaternion(pq);
      fb.quaternion.copy(pq.invert()).multiply(flatWorldQ).normalize();
      boneUpdates[footName] = quaternionToDegTuple(fb.quaternion, handle.isVrm0);
    }
  }

  const sign = handle.isVrm0 ? -1 : 1;
  const hipsOffset: Vec3Tuple = [
    Math.round(sign * hips.position.x * 1000) / 1000,
    Math.round((hips.position.y - handle.restHipsY) * 1000) / 1000,
    Math.round(sign * hips.position.z * 1000) / 1000,
  ];

  return {
    hipsPosition: hipsOffset,
    bones: boneUpdates,
    hitElevation: Math.max(leftSurfaceY, rightSurfaceY),
  };
}

/**
 * Snaps the mannequin's hips/pelvis cleanly onto the surface beneath it (chair, couch, box, steps, floor)
 * using a multi-point downward Raycaster sample so seated poses rest naturally without clipping.
 */
export function snapHipsToSurface(handle: RiggedMannequinHandle): {
  hipsPosition: Vec3Tuple;
  hitElevation: number;
} | null {
  const hips = handle.bones.hips;
  if (!hips || !hips.parent) return null;

  handle.root.updateMatrixWorld(true);
  const hipsWorld = new THREE.Vector3();
  hips.getWorldPosition(hipsWorld);

  // Sample center + slight lateral offsets for reliable chair/couch seat detection
  const startY = Math.max(3.5, hipsWorld.y + 1.2);
  const samples = [
    raycastDownwardSurfaceY(hipsWorld.x, hipsWorld.z, startY),
    raycastDownwardSurfaceY(hipsWorld.x + 0.08, hipsWorld.z, startY),
    raycastDownwardSurfaceY(hipsWorld.x - 0.08, hipsWorld.z, startY),
  ];
  const seatSurfaceY = Math.max(...samples);

  // Anatomical clearance from seated pelvis bone center down to glute/ischial contact plane
  const seatedPelvisOffset = 0.105;
  const desiredHipsWorldY = seatSurfaceY + seatedPelvisOffset;
  const deltaY = desiredHipsWorldY - hipsWorld.y;

  hips.position.y = Math.max(0.08, hips.position.y + deltaY);
  handle.root.updateMatrixWorld(true);

  const sign = handle.isVrm0 ? -1 : 1;
  const hipsOffset: Vec3Tuple = [
    Math.round(sign * hips.position.x * 1000) / 1000,
    Math.round((hips.position.y - handle.restHipsY) * 1000) / 1000,
    Math.round(sign * hips.position.z * 1000) / 1000,
  ];

  return {
    hipsPosition: hipsOffset,
    hitElevation: seatSurfaceY,
  };
}
