import * as THREE from 'three';
import { VrmBoneName } from '../types/pose';

export const UNIVERSAL_MORPH_KEYS = [
  'Bust_Volume',
  'Glute_Volume',
  'Glute_Drop',
  'Hip_Thigh_Width',
  'Waist_Taper',
  'Upper_Muscle',
  'Lower_Muscle',
  'Chest_Hang_Forward',
  'Chest_Splay_Back',
  'Chest_Standing_Droop',
  'Glute_Gravity_Drop',
] as const;

export type UniversalMorphKey = (typeof UNIVERSAL_MORPH_KEYS)[number];

interface AnatomicalLandmarks {
  hips: THREE.Vector3;
  spine: THREE.Vector3;
  chest: THREE.Vector3;
  neck: THREE.Vector3;
  head: THREE.Vector3;
  leftUpperArm: THREE.Vector3;
  leftLowerArm: THREE.Vector3;
  leftHand: THREE.Vector3;
  rightUpperArm: THREE.Vector3;
  rightLowerArm: THREE.Vector3;
  rightHand: THREE.Vector3;
  leftUpperLeg: THREE.Vector3;
  leftLowerLeg: THREE.Vector3;
  leftFoot: THREE.Vector3;
  rightUpperLeg: THREE.Vector3;
  rightLowerLeg: THREE.Vector3;
  rightFoot: THREE.Vector3;
  torsoHeight: number;
  shoulderSpan: number;
  hipSpan: number;
  upperLegLen: number;
  chestFrontZ: number;
  pelvisBackZ: number;
  bustY: number;
  waistY: number;
}

const _v = new THREE.Vector3();
const _pRoot = new THREE.Vector3();
const _deltaRoot = new THREE.Vector3();
const _deltaLocal = new THREE.Vector3();
const _segVec = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _radial = new THREE.Vector3();

/**
 * Computes the exact rest-pose transformation matrix from a mesh's raw bind-pose vertex buffer
 * (`basePositions`) into `root` coordinate space.
 *
 * Crucial for VRM 0.x models: `VRMUtils.rotateVRM0(vrm)` rotates the skeleton bones by 180° around Y
 * so the character faces +Z, while leaving the SkinnedMesh's raw vertex buffer in -Z bind space
 * (relied upon via `bone.matrixWorld * boneInverse * bindMatrix`). Using the skinning rest-pose
 * matrix ensures bind-pose vertices and morph displacements align 100% with the +Z-forward skeleton!
 */
function getMeshBindToRootMatrix(
  mesh: THREE.Mesh,
  invRoot: THREE.Matrix4
): THREE.Matrix4 {
  const skinned = mesh as THREE.SkinnedMesh;
  if (
    skinned.isSkinnedMesh &&
    skinned.skeleton &&
    skinned.skeleton.bones.length > 0 &&
    skinned.skeleton.boneInverses.length > 0
  ) {
    const bone0 = skinned.skeleton.bones[0];
    const inv0 = skinned.skeleton.boneInverses[0];
    if (bone0 && inv0) {
      bone0.updateWorldMatrix(true, false);
      const skinToWorld = new THREE.Matrix4()
        .multiplyMatrices(bone0.matrixWorld, inv0)
        .multiply(skinned.bindMatrix);
      return new THREE.Matrix4().multiplyMatrices(invRoot, skinToWorld);
    }
  }
  return new THREE.Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld);
}

function getBoneRootPos(
  bones: Partial<Record<VrmBoneName, THREE.Object3D>>,
  name: VrmBoneName,
  invRootMatrix: THREE.Matrix4,
  fallback: THREE.Vector3
): THREE.Vector3 {
  const b = bones[name];
  if (!b) return fallback.clone();
  return b.getWorldPosition(new THREE.Vector3()).applyMatrix4(invRootMatrix);
}

/**
 * Computes closest point on segment A->B, returning normalized t in [0, 1] and distance.
 */
function closestPointOnSegment(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  outClosest: THREE.Vector3
): { t: number; dist: number } {
  _segVec.subVectors(b, a);
  const lenSq = _segVec.lengthSq();
  if (lenSq < 1e-6) {
    outClosest.copy(a);
    return { t: 0, dist: p.distanceTo(a) };
  }
  const t = THREE.MathUtils.clamp(
    ((p.x - a.x) * _segVec.x +
      (p.y - a.y) * _segVec.y +
      (p.z - a.z) * _segVec.z) /
      lenSq,
    0,
    1
  );
  outClosest.copy(a).addScaledVector(_segVec, t);
  return { t, dist: p.distanceTo(outClosest) };
}

/**
 * Inspects the skeleton and bind-pose mesh bounds in model-root space to derive
 * anatomical landmarks for any realistic or stylized humanoid.
 */
function detectLandmarks(
  root: THREE.Object3D,
  bones: Partial<Record<VrmBoneName, THREE.Object3D>>,
  meshes: THREE.Mesh[]
): AnatomicalLandmarks {
  root.updateMatrixWorld(true);
  const invRoot = root.matrixWorld.clone().invert();

  // Compute total height in root space for safe fallbacks
  const bbox = new THREE.Box3().setFromObject(root);
  const minRoot = bbox.min.clone().applyMatrix4(invRoot);
  const maxRoot = bbox.max.clone().applyMatrix4(invRoot);
  const h = Math.max(0.5, maxRoot.y - minRoot.y);
  const baseY = minRoot.y;

  const hips = getBoneRootPos(bones, 'hips', invRoot, new THREE.Vector3(0, baseY + h * 0.54, 0));
  const spine = getBoneRootPos(bones, 'spine', invRoot, new THREE.Vector3(0, hips.y + h * 0.07, 0));
  const chest = getBoneRootPos(bones, 'chest', invRoot, new THREE.Vector3(0, hips.y + h * 0.16, 0));
  const neck = getBoneRootPos(bones, 'neck', invRoot, new THREE.Vector3(0, hips.y + h * 0.28, 0));
  const head = getBoneRootPos(bones, 'head', invRoot, new THREE.Vector3(0, hips.y + h * 0.34, 0));

  const torsoHeight = Math.max(0.25, neck.y - hips.y);

  const leftUpperArm = getBoneRootPos(
    bones,
    'leftUpperArm',
    invRoot,
    new THREE.Vector3(h * 0.11, neck.y - torsoHeight * 0.16, 0)
  );
  const rightUpperArm = getBoneRootPos(
    bones,
    'rightUpperArm',
    invRoot,
    new THREE.Vector3(-h * 0.11, neck.y - torsoHeight * 0.16, 0)
  );
  const shoulderSpan = Math.max(0.22, Math.abs(leftUpperArm.x - rightUpperArm.x));

  const leftLowerArm = getBoneRootPos(
    bones,
    'leftLowerArm',
    invRoot,
    new THREE.Vector3(leftUpperArm.x + h * 0.16, leftUpperArm.y, 0)
  );
  const rightLowerArm = getBoneRootPos(
    bones,
    'rightLowerArm',
    invRoot,
    new THREE.Vector3(rightUpperArm.x - h * 0.16, rightUpperArm.y, 0)
  );
  const leftHand = getBoneRootPos(
    bones,
    'leftHand',
    invRoot,
    new THREE.Vector3(leftLowerArm.x + h * 0.14, leftLowerArm.y, 0)
  );
  const rightHand = getBoneRootPos(
    bones,
    'rightHand',
    invRoot,
    new THREE.Vector3(rightLowerArm.x - h * 0.14, rightLowerArm.y, 0)
  );

  const leftUpperLeg = getBoneRootPos(
    bones,
    'leftUpperLeg',
    invRoot,
    new THREE.Vector3(h * 0.056, hips.y - h * 0.025, 0)
  );
  const rightUpperLeg = getBoneRootPos(
    bones,
    'rightUpperLeg',
    invRoot,
    new THREE.Vector3(-h * 0.056, hips.y - h * 0.025, 0)
  );
  const hipSpan = Math.max(0.12, Math.abs(leftUpperLeg.x - rightUpperLeg.x));

  const leftLowerLeg = getBoneRootPos(
    bones,
    'leftLowerLeg',
    invRoot,
    new THREE.Vector3(leftUpperLeg.x, hips.y - h * 0.26, 0)
  );
  const rightLowerLeg = getBoneRootPos(
    bones,
    'rightLowerLeg',
    invRoot,
    new THREE.Vector3(rightUpperLeg.x, hips.y - h * 0.26, 0)
  );
  const leftFoot = getBoneRootPos(
    bones,
    'leftFoot',
    invRoot,
    new THREE.Vector3(leftUpperLeg.x, baseY + 0.065, 0)
  );
  const rightFoot = getBoneRootPos(
    bones,
    'rightFoot',
    invRoot,
    new THREE.Vector3(rightUpperLeg.x, baseY + 0.065, 0)
  );

  const upperLegLen = Math.max(
    0.22,
    (leftUpperLeg.distanceTo(leftLowerLeg) + rightUpperLeg.distanceTo(rightLowerLeg)) * 0.5
  );

  // Sample actual anterior chest wall (+Z) and posterior pelvis wall (-Z) from bind-pose vertices
  const bustY = THREE.MathUtils.lerp(chest.y, neck.y, 0.36);
  const waistY = THREE.MathUtils.lerp(hips.y, chest.y, 0.52);

  let chestFrontZ = chest.z + 0.08;
  let pelvisBackZ = hips.z - 0.09;
  let maxChestZ = -Infinity;
  let minPelvisZ = Infinity;

  for (const mesh of meshes) {
    const pos = mesh.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const meshToRoot = getMeshBindToRootMatrix(mesh, invRoot);
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      _pRoot.fromBufferAttribute(pos, i).applyMatrix4(meshToRoot);
      if (
        Math.abs(_pRoot.x - chest.x) < shoulderSpan * 0.36 &&
        Math.abs(_pRoot.y - bustY) < torsoHeight * 0.22
      ) {
        if (_pRoot.z > maxChestZ) maxChestZ = _pRoot.z;
      }
      if (
        Math.abs(_pRoot.x - hips.x) < hipSpan * 1.15 &&
        Math.abs(_pRoot.y - (hips.y - torsoHeight * 0.05)) < torsoHeight * 0.2
      ) {
        if (_pRoot.z < minPelvisZ) minPelvisZ = _pRoot.z;
      }
    }
  }

  if (isFinite(maxChestZ) && maxChestZ > chest.z + 0.03) {
    chestFrontZ = maxChestZ;
  }
  if (isFinite(minPelvisZ) && minPelvisZ < hips.z - 0.03) {
    pelvisBackZ = minPelvisZ;
  }

  return {
    hips,
    spine,
    chest,
    neck,
    head,
    leftUpperArm,
    leftLowerArm,
    leftHand,
    rightUpperArm,
    rightLowerArm,
    rightHand,
    leftUpperLeg,
    leftLowerLeg,
    leftFoot,
    rightUpperLeg,
    rightLowerLeg,
    rightFoot,
    torsoHeight,
    shoulderSpan,
    hipSpan,
    upperLegLen,
    chestFrontZ,
    pelvisBackZ,
    bustY,
    waistY,
  };
}

/**
 * Builds a set of skeleton bone indices belonging to the arms on a SkinnedMesh
 * so Bust and Waist morph targets strictly exclude arm vertices even in tight A-poses.
 */
function getArmBoneIndicesOnSkinnedMesh(
  mesh: THREE.Mesh,
  bones: Partial<Record<VrmBoneName, THREE.Object3D>>
): Set<number> {
  const armIndices = new Set<number>();
  const skinned = mesh as THREE.SkinnedMesh;
  if (!skinned.isSkinnedMesh || !skinned.skeleton) return armIndices;

  const armBoneObjs = new Set<THREE.Object3D>();
  const armNames: VrmBoneName[] = [
    'leftUpperArm',
    'leftLowerArm',
    'leftHand',
    'rightUpperArm',
    'rightLowerArm',
    'rightHand',
  ];
  for (const name of armNames) {
    const b = bones[name];
    if (b) {
      b.traverse((desc) => armBoneObjs.add(desc));
    }
  }

  skinned.skeleton.bones.forEach((b, idx) => {
    if (
      armBoneObjs.has(b) ||
      /upper.*arm|forearm|lower.*arm|hand|wrist|thumb|index|middle|ring|little|pinky/i.test(
        b.name
      )
    ) {
      armIndices.add(idx);
    }
  });
  return armIndices;
}

/**
 * Computes combined arm skin weight (0..1) for vertex i on a SkinnedMesh.
 */
function getVertexArmWeight(
  skinIdx: THREE.BufferAttribute | undefined,
  skinWgt: THREE.BufferAttribute | undefined,
  armIndices: Set<number>,
  vertexIndex: number
): number {
  if (!skinIdx || !skinWgt || armIndices.size === 0) return 0;
  let w = 0;
  if (armIndices.has(skinIdx.getX(vertexIndex))) w += skinWgt.getX(vertexIndex);
  if (armIndices.has(skinIdx.getY(vertexIndex))) w += skinWgt.getY(vertexIndex);
  if (armIndices.has(skinIdx.getZ(vertexIndex))) w += skinWgt.getZ(vertexIndex);
  if (armIndices.has(skinIdx.getW(vertexIndex))) w += skinWgt.getW(vertexIndex);
  return Math.min(1, w);
}

/**
 * Generates smooth Gaussian-falloff procedural morph targets (`morphAttributes.position`)
 * directly from bind-pose vertices relative to skeleton landmarks for ANY loaded `.vrm` or `.glb`.
 *
 * - Never scales bones.
 * - Preserves `basePositions` on each mesh and guarantees smooth vertex normals.
 * - Preserves any existing native morph targets alongside the generated universal morphs.
 */
export function generateUniversalAnatomicalMorphs(
  root: THREE.Object3D,
  bones: Partial<Record<VrmBoneName, THREE.Object3D>>,
  meshes: THREE.Mesh[]
): void {
  const lm = detectLandmarks(root, bones, meshes);
  root.updateMatrixWorld(true);
  const invRoot = root.matrixWorld.clone().invert();

  // Anatomical center landmarks
  const bustX = lm.shoulderSpan * 0.21;
  const bustRx = lm.shoulderSpan * 0.23;
  const bustRy = lm.torsoHeight * 0.2;
  const bustRz = Math.max(0.06, (lm.chestFrontZ - lm.chest.z) * 1.1);
  const leftBustCenter = new THREE.Vector3(lm.chest.x + bustX, lm.bustY, lm.chestFrontZ * 0.86);
  const rightBustCenter = new THREE.Vector3(lm.chest.x - bustX, lm.bustY, lm.chestFrontZ * 0.86);

  const gluteY = lm.hips.y - lm.torsoHeight * 0.08;
  const gluteX = lm.hipSpan * 0.44;
  const gluteRx = lm.hipSpan * 0.62;
  const gluteRy = lm.torsoHeight * 0.24;
  const gluteRz = Math.max(0.075, Math.abs(lm.pelvisBackZ - lm.hips.z) * 1.15);
  const leftGluteCenter = new THREE.Vector3(lm.hips.x + gluteX, gluteY, lm.pelvisBackZ * 0.78);
  const rightGluteCenter = new THREE.Vector3(lm.hips.x - gluteX, gluteY, lm.pelvisBackZ * 0.78);

  const torsoCenterX = lm.hips.x;
  const armExcludeInnerX = lm.shoulderSpan * 0.37;
  const armExcludeOuterX = lm.shoulderSpan * 0.47;

  const morphEvaluators: Record<
    UniversalMorphKey,
    (p: THREE.Vector3, armW: number, out: THREE.Vector3) => void
  > = {
    // 1. Bust Volume / Fullness (radial outward + teardrop forward projection, strictly masked from back & arms)
    Bust_Volume: (p, armW, out) => {
      const frontMask = THREE.MathUtils.smoothstep(p.z, lm.chest.z + 0.012, lm.chest.z + 0.055);
      if (frontMask <= 0.001) return;
      const sideArmMask =
        (1 - THREE.MathUtils.smoothstep(Math.abs(p.x - torsoCenterX), armExcludeInnerX, armExcludeOuterX)) *
        (1 - armW);
      if (sideArmMask <= 0.001) return;

      const side = p.x >= torsoCenterX ? 1 : -1;
      const c = side > 0 ? leftBustCenter : rightBustCenter;
      const dx = (p.x - c.x) / bustRx;
      const dy = (p.y - c.y) / bustRy;
      const dz = (p.z - c.z) / bustRz;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > 3.8) return;

      const w = Math.exp(-r2 * 1.15) * frontMask * sideArmMask;
      const radialX = (p.x - c.x) * 0.34 + side * 0.009;
      const radialY = (p.y - c.y) * 0.28 - 0.011;
      const radialZ = 0.048 + Math.max(0, p.z - c.z) * 0.22;
      out.set(radialX * w, radialY * w, radialZ * w);
    },

    // 2A. Dynamic Bust Gravity Droop — Leaning Forward / All-Fours (+Z hang in chest space)
    Chest_Hang_Forward: (p, armW, out) => {
      const frontMask = THREE.MathUtils.smoothstep(p.z, lm.chest.z + 0.015, lm.chest.z + 0.055);
      if (frontMask <= 0.001) return;
      const sideArmMask =
        (1 - THREE.MathUtils.smoothstep(Math.abs(p.x - torsoCenterX), armExcludeInnerX, armExcludeOuterX)) *
        (1 - armW);
      if (sideArmMask <= 0.001) return;

      const side = p.x >= torsoCenterX ? 1 : -1;
      const c = side > 0 ? leftBustCenter : rightBustCenter;
      const dx = (p.x - c.x) / (bustRx * 1.05);
      const dy = (p.y - c.y) / (bustRy * 1.08);
      const dz = (p.z - c.z) / (bustRz * 1.1);
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > 3.6) return;

      const w = Math.exp(-r2 * 1.1) * frontMask * sideArmMask;
      // Hang forward (+Z aligns with world gravity when leaning/all-fours) with slight natural narrowing
      out.set(-Math.sign(p.x - c.x) * 0.006 * w, -0.012 * w, 0.046 * w);
    },

    // 2B. Dynamic Bust Gravity Splay — Supine / Lying on Back (-Z flatten + ±X lateral splay)
    Chest_Splay_Back: (p, armW, out) => {
      const frontMask = THREE.MathUtils.smoothstep(p.z, lm.chest.z + 0.015, lm.chest.z + 0.055);
      if (frontMask <= 0.001) return;
      const sideArmMask =
        (1 - THREE.MathUtils.smoothstep(Math.abs(p.x - torsoCenterX), armExcludeInnerX, armExcludeOuterX)) *
        (1 - armW);
      if (sideArmMask <= 0.001) return;

      const side = p.x >= torsoCenterX ? 1 : -1;
      const c = side > 0 ? leftBustCenter : rightBustCenter;
      const dx = (p.x - c.x) / (bustRx * 1.08);
      const dy = (p.y - c.y) / (bustRy * 1.08);
      const dz = (p.z - c.z) / (bustRz * 1.1);
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > 3.6) return;

      const w = Math.exp(-r2 * 1.1) * frontMask * sideArmMask;
      out.set(side * 0.032 * w, 0.01 * w, -0.032 * w);
    },

    // 2C. Dynamic Bust Standing Gravity Droop (subtle upright downward teardrop weight)
    Chest_Standing_Droop: (p, armW, out) => {
      const frontMask = THREE.MathUtils.smoothstep(p.z, lm.chest.z + 0.02, lm.chest.z + 0.06);
      if (frontMask <= 0.001) return;
      const sideArmMask =
        (1 - THREE.MathUtils.smoothstep(Math.abs(p.x - torsoCenterX), armExcludeInnerX, armExcludeOuterX)) *
        (1 - armW);
      if (sideArmMask <= 0.001) return;

      const side = p.x >= torsoCenterX ? 1 : -1;
      const c = side > 0 ? leftBustCenter : rightBustCenter;
      const dx = (p.x - c.x) / bustRx;
      const dy = (p.y - c.y) / bustRy;
      const dz = (p.z - c.z) / bustRz;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > 3.4) return;

      const w = Math.exp(-r2 * 1.2) * frontMask * sideArmMask;
      const lowerBias = THREE.MathUtils.smoothstep(c.y + 0.03 - p.y, 0, 0.08);
      out.set(side * 0.004 * w, -0.022 * w, 0.006 * lowerBias * w);
    },

    // 3. Glute Volume & Roundness (rearward + lateral-lower curve, cleanly tapered into lower back & hamstring)
    Glute_Volume: (p, armW, out) => {
      const backMask = THREE.MathUtils.smoothstep(lm.hips.z + 0.012 - p.z, 0, 0.06);
      if (backMask <= 0.001) return;
      const armFree = 1 - armW;
      if (armFree <= 0.001) return;

      const side = p.x >= torsoCenterX ? 1 : -1;
      const c = side > 0 ? leftGluteCenter : rightGluteCenter;
      const dx = (p.x - c.x) / gluteRx;
      const dy = (p.y - c.y) / gluteRy;
      const dz = (p.z - c.z) / gluteRz;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > 3.8) return;

      const w = Math.exp(-r2 * 1.05) * backMask * armFree;
      out.set(side * 0.018 * w, -0.006 * w, -0.056 * w);
    },

    // 4. Glute Weight / Drop (subtle downward fullness on the lower glute crease)
    Glute_Drop: (p, armW, out) => {
      const backMask = THREE.MathUtils.smoothstep(lm.hips.z + 0.005 - p.z, 0, 0.055);
      if (backMask <= 0.001) return;
      const armFree = 1 - armW;
      if (armFree <= 0.001) return;

      const side = p.x >= torsoCenterX ? 1 : -1;
      const c = side > 0 ? leftGluteCenter : rightGluteCenter;
      const creaseY = c.y - gluteRy * 0.35;
      const dx = (p.x - c.x) / (gluteRx * 1.05);
      const dy = (p.y - creaseY) / (gluteRy * 0.85);
      const dz = (p.z - c.z) / (gluteRz * 1.1);
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > 3.6) return;

      const w = Math.exp(-r2 * 1.15) * backMask * armFree;
      out.set(side * 0.006 * w, -0.03 * w, -0.016 * w);
    },

    // 4B. Dynamic Hips-Orientation Glute Gravity Settling
    Glute_Gravity_Drop: (p, armW, out) => {
      const backMask = THREE.MathUtils.smoothstep(lm.hips.z - p.z, 0, 0.055);
      if (backMask <= 0.001) return;
      const armFree = 1 - armW;
      if (armFree <= 0.001) return;

      const side = p.x >= torsoCenterX ? 1 : -1;
      const c = side > 0 ? leftGluteCenter : rightGluteCenter;
      const dx = (p.x - c.x) / gluteRx;
      const dy = (p.y - (c.y - gluteRy * 0.25)) / (gluteRy * 0.9);
      const dz = (p.z - c.z) / gluteRz;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > 3.4) return;

      const w = Math.exp(-r2 * 1.2) * backMask * armFree;
      out.set(side * 0.009 * w, -0.022 * w, -0.01 * w);
    },

    // 5. Hip & Thigh Width (smooth outer lateral curve expansion without shifting hip bones)
    Hip_Thigh_Width: (p, armW, out) => {
      const armFree = 1 - armW;
      if (armFree <= 0.001) return;
      const yMin = lm.hips.y - lm.upperLegLen * 0.65;
      const yMax = lm.hips.y + lm.torsoHeight * 0.16;
      if (p.y < yMin || p.y > yMax) return;

      const centerY = lm.hips.y - lm.upperLegLen * 0.16;
      const halfSpanY = (yMax - yMin) * 0.42;
      const yGauss = Math.exp(-Math.pow((p.y - centerY) / halfSpanY, 2));

      const absX = Math.abs(p.x - torsoCenterX);
      // Only expand outer lateral contour so inner thigh gap stays clean
      const outerMask = THREE.MathUtils.smoothstep(absX, lm.hipSpan * 0.35, lm.hipSpan * 0.88);
      if (outerMask <= 0.001) return;

      const side = p.x >= torsoCenterX ? 1 : -1;
      const w = yGauss * outerMask * armFree;
      out.set(side * 0.036 * w, 0, (p.z - lm.hips.z) * 0.06 * w);
    },

    // 6. Waist Taper (smooth inward radial pinch at mid-spine/abdomen, strictly masked from arms)
    Waist_Taper: (p, armW, out) => {
      const bandSigma = lm.torsoHeight * 0.17;
      const dy = (p.y - lm.waistY) / bandSigma;
      if (Math.abs(dy) > 2.3) return;

      const absX = Math.abs(p.x - torsoCenterX);
      const armMask =
        (1 - THREE.MathUtils.smoothstep(absX, armExcludeInnerX, armExcludeOuterX)) *
        (1 - armW);
      if (armMask <= 0.001) return;

      const w = Math.exp(-dy * dy) * armMask;
      out.set(
        -(p.x - torsoCenterX) * 0.28 * w,
        0,
        -(p.z - lm.spine.z) * 0.18 * w
      );
    },

    // 7A. Upper Musculature (deltoids, biceps/triceps, forearms, upper chest/lats with zero joint pinching)
    Upper_Muscle: (p, _armW, out) => {
      // Upper arms (deltoid + bicep/tricep) & forearms
      const armSegments: Array<{
        a: THREE.Vector3;
        b: THREE.Vector3;
        maxR: number;
        amount: number;
        peakT: number;
      }> = [
        { a: lm.leftUpperArm, b: lm.leftLowerArm, maxR: 0.095, amount: 0.022, peakT: 0.42 },
        { a: lm.rightUpperArm, b: lm.rightLowerArm, maxR: 0.095, amount: 0.022, peakT: 0.42 },
        { a: lm.leftLowerArm, b: lm.leftHand, maxR: 0.075, amount: 0.015, peakT: 0.3 },
        { a: lm.rightLowerArm, b: lm.rightHand, maxR: 0.075, amount: 0.015, peakT: 0.3 },
      ];

      for (const seg of armSegments) {
        const { t, dist } = closestPointOnSegment(p, seg.a, seg.b, _closest);
        if (dist > seg.maxR || dist < 0.004) continue;
        // Soft sin(pi*t) envelope guarantees zero deformation at elbow/wrist/shoulder crease
        const jointEnvelope = Math.sin(t * Math.PI);
        const bellyBias = Math.exp(-Math.pow((t - seg.peakT) / 0.36, 2));
        const radialFalloff = Math.exp(-Math.pow(dist / (seg.maxR * 0.72), 2));
        const w = jointEnvelope * (0.45 + 0.55 * bellyBias) * radialFalloff;
        if (w > 0.005) {
          _radial.subVectors(p, _closest).normalize();
          out.addScaledVector(_radial, seg.amount * w);
        }
      }

      // Upper torso (pectorals, lats & shoulder cap broadening)
      const chestDy = (p.y - (lm.chest.y + lm.torsoHeight * 0.14)) / (lm.torsoHeight * 0.22);
      if (Math.abs(chestDy) < 2.2) {
        const absX = Math.abs(p.x - torsoCenterX);
        if (absX < lm.shoulderSpan * 0.56) {
          const torsoW = Math.exp(-chestDy * chestDy) * Math.exp(-Math.pow(absX / (lm.shoulderSpan * 0.58), 2));
          out.x += (p.x - torsoCenterX) * 0.16 * torsoW;
          out.z += (p.z - lm.chest.z) * (p.z > lm.chest.z ? 0.2 : 0.14) * torsoW;
        }
      }
    },

    // 7B. Lower Musculature (quads/hamstrings & gastrocnemius calves with soft joint falloff at hips/knees/ankles)
    Lower_Muscle: (p, _armW, out) => {
      const legSegments: Array<{
        a: THREE.Vector3;
        b: THREE.Vector3;
        maxR: number;
        amount: number;
        peakT: number;
        frontBoost: number;
        backBoost: number;
      }> = [
        {
          a: lm.leftUpperLeg,
          b: lm.leftLowerLeg,
          maxR: 0.145,
          amount: 0.028,
          peakT: 0.44,
          frontBoost: 0.35,
          backBoost: 0.1,
        },
        {
          a: lm.rightUpperLeg,
          b: lm.rightLowerLeg,
          maxR: 0.145,
          amount: 0.028,
          peakT: 0.44,
          frontBoost: 0.35,
          backBoost: 0.1,
        },
        {
          a: lm.leftLowerLeg,
          b: lm.leftFoot,
          maxR: 0.105,
          amount: 0.022,
          peakT: 0.32,
          frontBoost: 0.0,
          backBoost: 0.45,
        },
        {
          a: lm.rightLowerLeg,
          b: lm.rightFoot,
          maxR: 0.105,
          amount: 0.022,
          peakT: 0.32,
          frontBoost: 0.0,
          backBoost: 0.45,
        },
      ];

      for (const seg of legSegments) {
        const { t, dist } = closestPointOnSegment(p, seg.a, seg.b, _closest);
        if (dist > seg.maxR || dist < 0.005) continue;
        // Sin envelope smoothly tapers to 0 at hip, knee, and ankle joints
        const jointEnvelope = Math.sin(t * Math.PI);
        const bellyBias = Math.exp(-Math.pow((t - seg.peakT) / 0.34, 2));
        const radialFalloff = Math.exp(-Math.pow(dist / (seg.maxR * 0.78), 2));
        const w = jointEnvelope * (0.4 + 0.6 * bellyBias) * radialFalloff;
        if (w > 0.005) {
          _radial.subVectors(p, _closest).normalize();
          let boost = 1.0;
          if (_radial.z > 0) boost += _radial.z * seg.frontBoost;
          if (_radial.z < 0) boost += -_radial.z * seg.backBoost;
          out.addScaledVector(_radial, seg.amount * boost * w);
        }
      }
    },
  };

  // Generate & append morph attributes onto every eligible mesh
  for (const mesh of meshes) {
    const geom = mesh.geometry;
    const posAttr = geom?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!geom || !posAttr || posAttr.count === 0) continue;

    // Store bind-pose rest vertices and ensure smooth vertex normals
    if (!mesh.userData.basePositions) {
      mesh.userData.basePositions = new Float32Array(posAttr.array as ArrayLike<number>);
    }
    if (!geom.getAttribute('normal')) {
      geom.computeVertexNormals();
    }

    const basePositions = mesh.userData.basePositions as Float32Array;
    const count = posAttr.count;
    const isRelative = Boolean(geom.morphTargetsRelative);

    // Precompute bind-pose mesh-to-root transform and its direction inverse
    const meshToRoot = getMeshBindToRootMatrix(mesh, invRoot);
    const rootToMesh = meshToRoot.clone().invert();
    const rootToMeshNormalMat = new THREE.Matrix3().setFromMatrix4(rootToMesh);

    const existingDict: Record<string, number> = mesh.morphTargetDictionary
      ? { ...mesh.morphTargetDictionary }
      : {};
    const existingInfluences: number[] = mesh.morphTargetInfluences
      ? [...mesh.morphTargetInfluences]
      : [];
    const existingPosAttrs = geom.morphAttributes.position
      ? [...geom.morphAttributes.position]
      : [];

    // Check skin weights for arm-exclusion on SkinnedMeshes
    const skinIdx = geom.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
    const skinWgt = geom.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
    const armIndices = getArmBoneIndicesOnSkinnedMesh(mesh, bones);

    // Pre-cache root-space positions and arm weights for this mesh (fast single pass)
    const rootCoords = new Float32Array(count * 3);
    const armWeights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      _v.set(
        basePositions[i * 3],
        basePositions[i * 3 + 1],
        basePositions[i * 3 + 2]
      );
      _pRoot.copy(_v).applyMatrix4(meshToRoot);
      rootCoords[i * 3] = _pRoot.x;
      rootCoords[i * 3 + 1] = _pRoot.y;
      rootCoords[i * 3 + 2] = _pRoot.z;
      armWeights[i] = getVertexArmWeight(skinIdx, skinWgt, armIndices, i);
    }

    let appendedAny = false;

    for (const key of UNIVERSAL_MORPH_KEYS) {
      // Skip if this mesh already has a morph target with this exact name
      if (existingDict[key] !== undefined) continue;

      const evalFn = morphEvaluators[key];
      const buffer = new Float32Array(count * 3);
      let maxDeltaSq = 0;

      for (let i = 0; i < count; i++) {
        _pRoot.set(
          rootCoords[i * 3],
          rootCoords[i * 3 + 1],
          rootCoords[i * 3 + 2]
        );
        _deltaRoot.set(0, 0, 0);
        evalFn(_pRoot, armWeights[i], _deltaRoot);

        const dSq = _deltaRoot.lengthSq();
        if (dSq > 1e-10) {
          if (dSq > maxDeltaSq) maxDeltaSq = dSq;
          // Convert root-space displacement into mesh-local vertex space
          _deltaLocal.copy(_deltaRoot).applyMatrix3(rootToMeshNormalMat);
        } else {
          _deltaLocal.set(0, 0, 0);
        }

        if (isRelative) {
          buffer[i * 3] = _deltaLocal.x;
          buffer[i * 3 + 1] = _deltaLocal.y;
          buffer[i * 3 + 2] = _deltaLocal.z;
        } else {
          buffer[i * 3] = basePositions[i * 3] + _deltaLocal.x;
          buffer[i * 3 + 1] = basePositions[i * 3 + 1] + _deltaLocal.y;
          buffer[i * 3 + 2] = basePositions[i * 3 + 2] + _deltaLocal.z;
        }
      }

      // Only attach this morph target to meshes actually affected by it (skips eyes, shoes, hair, etc.)
      if (maxDeltaSq > 1e-7) {
        const attr = new THREE.Float32BufferAttribute(buffer, 3);
        attr.name = key;
        const newIdx = existingPosAttrs.length;
        existingPosAttrs.push(attr);
        existingDict[key] = newIdx;
        existingInfluences.push(0);
        appendedAny = true;
      }
    }

    // Only write morphAttributes.position when at least 1 morph exists
    // (an empty [] causes Three.js WebGLPrograms to define USE_MORPHTARGETS without MORPHTARGETS_COUNT!)
    if (appendedAny && existingPosAttrs.length > 0) {
      geom.morphAttributes.position = existingPosAttrs;
      mesh.morphTargetDictionary = existingDict;
      mesh.morphTargetInfluences = existingInfluences;
    } else if (
      geom.morphAttributes.position &&
      geom.morphAttributes.position.length === 0
    ) {
      delete geom.morphAttributes.position;
    }
  }
}
