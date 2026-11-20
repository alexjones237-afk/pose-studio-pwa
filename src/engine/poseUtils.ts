import * as THREE from 'three';
import {
  BoneRotationsMap,
  FINGER_BONES,
  LEFT_FINGER_BONES,
  RIGHT_FINGER_BONES,
  Vec3Tuple,
  VrmBoneName,
} from '../types/pose';

export const BODY_VRM_BONES: VrmBoneName[] = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
];

export const ALL_VRM_BONES: VrmBoneName[] = [...BODY_VRM_BONES, ...FINGER_BONES];

const BODY_LEFT_RIGHT_PAIRS: Array<[VrmBoneName, VrmBoneName]> = [
  ['leftShoulder', 'rightShoulder'],
  ['leftUpperArm', 'rightUpperArm'],
  ['leftLowerArm', 'rightLowerArm'],
  ['leftHand', 'rightHand'],
  ['leftUpperLeg', 'rightUpperLeg'],
  ['leftLowerLeg', 'rightLowerLeg'],
  ['leftFoot', 'rightFoot'],
];

const FINGER_LEFT_RIGHT_PAIRS: Array<[VrmBoneName, VrmBoneName]> = LEFT_FINGER_BONES.map(
  (leftBone, idx) => [leftBone, RIGHT_FINGER_BONES[idx]]
);

const LEFT_RIGHT_PAIRS: Array<[VrmBoneName, VrmBoneName]> = [
  ...BODY_LEFT_RIGHT_PAIRS,
  ...FINGER_LEFT_RIGHT_PAIRS,
];

const CENTER_BONES: VrmBoneName[] = ['hips', 'spine', 'chest', 'neck', 'head'];

export function degTupleToQuaternion(
  deg: Vec3Tuple,
  out = new THREE.Quaternion(),
  isVrm0 = false
): THREE.Quaternion {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(deg[0]),
    THREE.MathUtils.degToRad(deg[1]),
    THREE.MathUtils.degToRad(deg[2]),
    'XYZ'
  );
  out.setFromEuler(euler);
  if (isVrm0) {
    // Conjugate by 180° Y rotation for VRM 0.x normalized bones inside rotateVRM0 scene
    out.x = -out.x;
    out.z = -out.z;
  }
  return out;
}

export function quaternionToDegTuple(
  q: THREE.Quaternion,
  isVrm0 = false
): Vec3Tuple {
  const tmp = isVrm0
    ? new THREE.Quaternion(-q.x, q.y, -q.z, q.w)
    : q;
  const euler = new THREE.Euler().setFromQuaternion(tmp, 'XYZ');
  return [
    Math.round(THREE.MathUtils.radToDeg(euler.x) * 10) / 10,
    Math.round(THREE.MathUtils.radToDeg(euler.y) * 10) / 10,
    Math.round(THREE.MathUtils.radToDeg(euler.z) * 10) / 10,
  ];
}

/**
 * Mirrors an Euler degree triple across the sagittal YZ plane (character Left <-> Right).
 * In VRM normalized coordinates (+Z forward, +Y up, +X left), mirroring negates Y and Z rotations.
 */
function mirrorEulerDeg(deg: Vec3Tuple | undefined): Vec3Tuple {
  if (!deg) return [0, 0, 0];
  return [deg[0], -deg[1], -deg[2]];
}

export type MirrorDirection = 'left-to-right' | 'right-to-left' | 'swap';

export function mirrorPoseBones(
  bones: BoneRotationsMap,
  direction: MirrorDirection = 'swap'
): BoneRotationsMap {
  const next: BoneRotationsMap = { ...bones };

  if (direction === 'swap') {
    for (const center of CENTER_BONES) {
      if (bones[center]) {
        next[center] = mirrorEulerDeg(bones[center]);
      }
    }
    for (const [left, right] of LEFT_RIGHT_PAIRS) {
      const lVal = bones[left] ?? [0, 0, 0];
      const rVal = bones[right] ?? [0, 0, 0];
      next[left] = mirrorEulerDeg(rVal);
      next[right] = mirrorEulerDeg(lVal);
    }
  } else if (direction === 'left-to-right') {
    for (const [left, right] of LEFT_RIGHT_PAIRS) {
      const lVal = bones[left] ?? [0, 0, 0];
      next[right] = mirrorEulerDeg(lVal);
    }
  } else if (direction === 'right-to-left') {
    for (const [left, right] of LEFT_RIGHT_PAIRS) {
      const rVal = bones[right] ?? [0, 0, 0];
      next[left] = mirrorEulerDeg(rVal);
    }
  }

  return next;
}

export function focalLengthToFov(focalLengthMm: number): number {
  // 35mm full-frame sensor height = 24mm
  const fovRad = 2 * Math.atan(24 / (2 * focalLengthMm));
  return THREE.MathUtils.radToDeg(fovRad);
}
