import * as THREE from 'three';
import { RiggedMannequinHandle } from './proceduralMannequin';
import { BoneRotationsMap, VrmBoneName } from '../types/pose';
import { quaternionToDegTuple } from './poseUtils';

const _aPos = new THREE.Vector3();
const _bPos = new THREE.Vector3();
const _cPos = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _bc = new THREE.Vector3();
const _at = new THREE.Vector3();
const _poleProj = new THREE.Vector3();
const _bDesired = new THREE.Vector3();
const _parentWorldQuat = new THREE.Quaternion();
const _invParentWorldQuat = new THREE.Quaternion();
const _curWorldDir = new THREE.Vector3();
const _desWorldDir = new THREE.Vector3();
const _deltaWorldQuat = new THREE.Quaternion();
const _worldQuat = new THREE.Quaternion();

/**
 * Analytical 2-Bone Inverse Kinematics solver.
 * Solves rootBone (A) and midBone (B) rotations so endBone (C) reaches targetWorldPos,
 * bending cleanly along poleWorldDir.
 */
export function solveTwoBoneIK(
  rootBone: THREE.Object3D,
  midBone: THREE.Object3D,
  endBone: THREE.Object3D,
  targetWorldPos: THREE.Vector3,
  poleWorldDir: THREE.Vector3
): boolean {
  rootBone.updateWorldMatrix(true, true);

  rootBone.getWorldPosition(_aPos);
  midBone.getWorldPosition(_bPos);
  endBone.getWorldPosition(_cPos);

  const l1 = _aPos.distanceTo(_bPos);
  const l2 = _bPos.distanceTo(_cPos);
  if (l1 < 1e-4 || l2 < 1e-4) return false;

  _at.subVectors(targetWorldPos, _aPos);
  let dist = _at.length();
  const minDist = Math.abs(l1 - l2) + 0.015;
  const maxDist = l1 + l2 - 0.004;

  if (dist < 1e-5) {
    _at.copy(poleWorldDir).normalize().multiplyScalar(minDist);
    dist = minDist;
  } else if (dist < minDist) {
    _at.multiplyScalar(minDist / dist);
    dist = minDist;
  } else if (dist > maxDist) {
    _at.multiplyScalar(maxDist / dist);
    dist = maxDist;
  }

  const atDir = _at.clone().normalize();

  // Project pole direction perpendicular to A -> Target
  _poleProj
    .copy(poleWorldDir)
    .addScaledVector(atDir, -poleWorldDir.dot(atDir));

  if (_poleProj.lengthSq() < 1e-6) {
    // Fallback perpendicular vector
    _poleProj.set(0, 0, 1).cross(atDir);
    if (_poleProj.lengthSq() < 1e-6) {
      _poleProj.set(1, 0, 0).cross(atDir);
    }
  }
  _poleProj.normalize();

  // Law of cosines for angle at A
  const cosAngleA = THREE.MathUtils.clamp(
    (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist),
    -1,
    1
  );
  const sinAngleA = Math.sqrt(Math.max(0, 1 - cosAngleA * cosAngleA));

  // Desired world position of middle joint B
  _bDesired
    .copy(_aPos)
    .addScaledVector(atDir, l1 * cosAngleA)
    .addScaledVector(_poleProj, l1 * sinAngleA);

  // Step 1: Rotate rootBone so A->B points to A->B_desired
  _curWorldDir.subVectors(_bPos, _aPos).normalize();
  _desWorldDir.subVectors(_bDesired, _aPos).normalize();
  _deltaWorldQuat.setFromUnitVectors(_curWorldDir, _desWorldDir);

  if (rootBone.parent) {
    rootBone.parent.getWorldQuaternion(_parentWorldQuat);
    _invParentWorldQuat.copy(_parentWorldQuat).invert();
    rootBone.getWorldQuaternion(_worldQuat);
    _worldQuat.premultiply(_deltaWorldQuat);
    rootBone.quaternion.copy(_invParentWorldQuat).multiply(_worldQuat).normalize();
  } else {
    rootBone.quaternion.premultiply(_deltaWorldQuat).normalize();
  }

  rootBone.updateWorldMatrix(true, true);

  // Step 2: Rotate midBone so B->C points to B->Target
  midBone.getWorldPosition(_bPos);
  endBone.getWorldPosition(_cPos);

  _curWorldDir.subVectors(_cPos, _bPos).normalize();
  _desWorldDir.subVectors(targetWorldPos, _bPos);
  if (_desWorldDir.lengthSq() < 1e-6) return true;
  _desWorldDir.normalize();

  _deltaWorldQuat.setFromUnitVectors(_curWorldDir, _desWorldDir);

  if (midBone.parent) {
    midBone.parent.getWorldQuaternion(_parentWorldQuat);
    _invParentWorldQuat.copy(_parentWorldQuat).invert();
    midBone.getWorldQuaternion(_worldQuat);
    _worldQuat.premultiply(_deltaWorldQuat);
    midBone.quaternion.copy(_invParentWorldQuat).multiply(_worldQuat).normalize();
  } else {
    midBone.quaternion.premultiply(_deltaWorldQuat).normalize();
  }

  midBone.updateWorldMatrix(true, true);
  return true;
}

/**
 * Computes a natural anatomical pole direction in world space for limbs,
 * derived from the character's current torso/hips orientation.
 */
export function getLimbPoleWorldDir(
  handle: RiggedMannequinHandle,
  limb: 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot'
): THREE.Vector3 {
  const refBone =
    limb === 'leftHand' || limb === 'rightHand'
      ? handle.bones.chest ?? handle.bones.hips ?? handle.root
      : handle.bones.hips ?? handle.root;

  const q = new THREE.Quaternion();
  refBone.getWorldQuaternion(q);

  const sign = handle.isVrm0 ? -1 : 1;
  const localPole = new THREE.Vector3();
  if (limb === 'leftHand') {
    localPole.set(sign * 0.35, -0.25, sign * -1).normalize();
  } else if (limb === 'rightHand') {
    localPole.set(sign * -0.35, -0.25, sign * -1).normalize();
  } else if (limb === 'leftFoot') {
    localPole.set(sign * 0.12, 0.05, sign * 1).normalize();
  } else {
    localPole.set(sign * -0.12, 0.05, sign * 1).normalize();
  }

  return localPole.applyQuaternion(q).normalize();
}

/**
 * Solves Neck + Head rotation to look toward a dragged world target handle.
 */
export function solveHeadLookAtIK(
  handle: RiggedMannequinHandle,
  targetWorldPos: THREE.Vector3
): BoneRotationsMap {
  const neck = handle.bones.neck;
  const head = handle.bones.head;
  if (!head) return {};

  const parentObj = neck?.parent ?? head.parent ?? handle.root;
  parentObj.updateWorldMatrix(true, true);

  const headWorld = new THREE.Vector3();
  head.getWorldPosition(headWorld);

  const toTargetWorld = new THREE.Vector3().subVectors(targetWorldPos, headWorld);
  if (toTargetWorld.lengthSq() < 1e-5) return {};
  toTargetWorld.normalize();

  // Convert desired look direction into chest/parent local space
  const parentQuat = new THREE.Quaternion();
  parentObj.getWorldQuaternion(parentQuat);
  const localDir = toTargetWorld.clone().applyQuaternion(parentQuat.clone().invert()).normalize();

  // In VRM space, +Z is forward, +X is left, +Y is up
  const yaw = THREE.MathUtils.clamp(Math.atan2(localDir.x, localDir.z), -1.1, 1.1);
  const horiz = Math.sqrt(localDir.x * localDir.x + localDir.z * localDir.z);
  const pitch = THREE.MathUtils.clamp(-Math.atan2(localDir.y, Math.max(0.001, horiz)), -0.85, 0.85);

  const result: BoneRotationsMap = {};
  if (neck) {
    const neckEuler = new THREE.Euler(pitch * 0.35, yaw * 0.35, 0, 'XYZ');
    neck.quaternion.setFromEuler(neckEuler);
    result.neck = quaternionToDegTuple(neck.quaternion, handle.isVrm0);
  }
  const headEuler = new THREE.Euler(pitch * 0.65, yaw * 0.65, 0, 'XYZ');
  head.quaternion.setFromEuler(headEuler);
  result.head = quaternionToDegTuple(head.quaternion, handle.isVrm0);

  return result;
}

/**
 * Solves IK for a named limb effector and returns the updated bone Euler degrees.
 */
export function solveLimbIK(
  handle: RiggedMannequinHandle,
  limb: 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot',
  targetWorldPos: THREE.Vector3
): BoneRotationsMap {
  const map: Record<
    typeof limb,
    [VrmBoneName, VrmBoneName, VrmBoneName]
  > = {
    leftHand: ['leftUpperArm', 'leftLowerArm', 'leftHand'],
    rightHand: ['rightUpperArm', 'rightLowerArm', 'rightHand'],
    leftFoot: ['leftUpperLeg', 'leftLowerLeg', 'leftFoot'],
    rightFoot: ['rightUpperLeg', 'rightLowerLeg', 'rightFoot'],
  };

  const [rootName, midName, endName] = map[limb];
  const rootBone = handle.bones[rootName];
  const midBone = handle.bones[midName];
  const endBone = handle.bones[endName];
  if (!rootBone || !midBone || !endBone) return {};

  const poleDir = getLimbPoleWorldDir(handle, limb);
  const ok = solveTwoBoneIK(rootBone, midBone, endBone, targetWorldPos, poleDir);
  if (!ok) return {};

  return {
    [rootName]: quaternionToDegTuple(rootBone.quaternion, handle.isVrm0),
    [midName]: quaternionToDegTuple(midBone.quaternion, handle.isVrm0),
  };
}

/**
 * Keeps pinned feet planted flat on the floor while hips/torso move.
 */
export function solvePinnedFeetToFloor(
  handle: RiggedMannequinHandle,
  leftPinWorld: THREE.Vector3,
  rightPinWorld: THREE.Vector3
): BoneRotationsMap {
  const updates: BoneRotationsMap = {};

  const leftTarget = leftPinWorld.clone();
  leftTarget.y = handle.footSoleOffset;
  Object.assign(updates, solveLimbIK(handle, 'leftFoot', leftTarget));

  const rightTarget = rightPinWorld.clone();
  rightTarget.y = handle.footSoleOffset;
  Object.assign(updates, solveLimbIK(handle, 'rightFoot', rightTarget));

  // Level both feet parallel to the floor plane while keeping character yaw
  const hipsWorldQ = new THREE.Quaternion();
  (handle.bones.hips ?? handle.root).getWorldQuaternion(hipsWorldQ);
  const hipsEuler = new THREE.Euler().setFromQuaternion(hipsWorldQ, 'YXZ');
  const flatWorldQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hipsEuler.y, 0, 'YXZ'));

  for (const footName of ['leftFoot', 'rightFoot'] as const) {
    const footBone = handle.bones[footName];
    if (footBone && footBone.parent) {
      footBone.parent.updateWorldMatrix(true, false);
      const pq = new THREE.Quaternion();
      footBone.parent.getWorldQuaternion(pq);
      footBone.quaternion.copy(pq.invert()).multiply(flatWorldQ).normalize();
      updates[footName] = quaternionToDegTuple(footBone.quaternion, handle.isVrm0);
    }
  }

  return updates;
}
