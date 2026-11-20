import * as THREE from 'three';
import {
  BuiltInArchetype,
  FINGER_BONES,
  HairStyleId,
  ModelSourceType,
  VrmBoneName,
} from '../types/pose';
import { ProceduralFaceAndHairRig } from './faceAndHairEngine';

export interface ProceduralSpringBone {
  name: string;
  bone: THREE.Bone;
  restRotation: THREE.Quaternion;
  restLocalDir: THREE.Vector3;
  length: number;
  baseStiffness: number;
  baseGravity: number;
  baseDrag: number;
  maxAngleRad: number;
  prevTipWorld: THREE.Vector3;
  currTipWorld: THREE.Vector3;
  initialized: boolean;
}

export interface RiggedMannequinHandle {
  root: THREE.Group;
  bones: Partial<Record<VrmBoneName, THREE.Object3D>>;
  restHipsY: number;
  footSoleOffset: number;
  meshes: THREE.Mesh[];
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  springBones: ProceduralSpringBone[];
  faceAndHairRig?: ProceduralFaceAndHairRig | null;
  vrm: any | null;
  isVrm0: boolean;
  sourceType: ModelSourceType;
  detectedFingerBoneCount: number;
  dispose: () => void;
}

interface RingProfile {
  y: number;
  rx: number;
  rzFront: number;
  rzBack: number;
  zOffset?: number;
  xOffset?: number;
}

/**
 * Generates a smooth lofted organic BufferGeometry from anatomical cross-section rings,
 * oriented ascending in Y with strictly outward CCW winding and smooth vertex normals.
 */
function createLoftedGeometry(
  inputRings: RingProfile[],
  radialSegments = 24
): THREE.BufferGeometry {
  const rings =
    inputRings.length >= 2 && inputRings[inputRings.length - 1].y < inputRings[0].y
      ? [...inputRings].reverse()
      : inputRings;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const first = rings[0];
  const last = rings[rings.length - 1];
  const ringCount = rings.length;

  for (let r = 0; r < ringCount; r++) {
    const ring = rings[r];
    const v = r / (ringCount - 1);
    const xOff = ring.xOffset ?? 0;
    const zOff = ring.zOffset ?? 0;
    for (let s = 0; s <= radialSegments; s++) {
      const u = s / radialSegments;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const x = xOff + cosT * ring.rx;
      const rz = sinT >= 0 ? ring.rzFront : ring.rzBack;
      const z = zOff + sinT * rz;
      positions.push(x, ring.y, z);
      uvs.push(u, v);
    }
  }

  const stride = radialSegments + 1;
  for (let r = 0; r < ringCount - 1; r++) {
    for (let s = 0; s < radialSegments; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = (r + 1) * stride + s;
      const d = c + 1;
      indices.push(a, d, b);
      indices.push(a, c, d);
    }
  }

  // Bottom cap (-Y)
  const bottomCenterIdx = positions.length / 3;
  positions.push(first.xOffset ?? 0, first.y, first.zOffset ?? 0);
  uvs.push(0.5, 0);
  for (let s = 0; s < radialSegments; s++) {
    indices.push(bottomCenterIdx, s, s + 1);
  }

  // Top cap (+Y)
  const topCenterIdx = positions.length / 3;
  positions.push(last.xOffset ?? 0, last.y, last.zOffset ?? 0);
  uvs.push(0.5, 1);
  const topStart = (ringCount - 1) * stride;
  for (let s = 0; s < radialSegments; s++) {
    indices.push(topCenterIdx, topStart + s + 1, topStart + s);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function addMorphTarget(
  geom: THREE.BufferGeometry,
  name: string,
  displaceFn: (x: number, y: number, z: number, out: THREE.Vector3) => void
) {
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  const count = posAttr.count;
  const targetPositions = new Float32Array(count * 3);
  const delta = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    delta.set(0, 0, 0);
    displaceFn(x, y, z, delta);
    targetPositions[i * 3] = x + delta.x;
    targetPositions[i * 3 + 1] = y + delta.y;
    targetPositions[i * 3 + 2] = z + delta.z;
  }

  if (!geom.morphAttributes.position) {
    geom.morphAttributes.position = [];
  }
  const attr = new THREE.Float32BufferAttribute(targetPositions, 3);
  attr.name = name;
  geom.morphAttributes.position.push(attr);
}

function syncMeshMorphTargets(mesh: THREE.Mesh) {
  const morphPos = mesh.geometry.morphAttributes.position;
  if (!morphPos || morphPos.length === 0) return;
  const dict: Record<string, number> = {};
  const influences: number[] = [];
  morphPos.forEach((attr, idx) => {
    const name = attr.name || `morph_${idx}`;
    dict[name] = idx;
    influences.push(0);
  });
  mesh.morphTargetDictionary = dict;
  mesh.morphTargetInfluences = influences;
}

function createHeadGeometry(isFemale: boolean, isRealistic: boolean): THREE.BufferGeometry {
  // 8-heads realistic figure has a proportionally smaller, taller cranial vault vs stylized anime
  const r = isRealistic
    ? isFemale
      ? 0.088
      : 0.095
    : isFemale
    ? 0.105
    : 0.112;
  const geom = new THREE.SphereGeometry(r, 28, 22);
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ny = v.y / r;
    const nz = v.z / r;
    const nx = v.x / r;

    v.y *= isRealistic ? 1.24 : isFemale ? 1.14 : 1.18;

    if (ny < 0.05) {
      const t = Math.min(1, (0.05 - ny) / 1.05);
      const jawTaper = isRealistic
        ? isFemale
          ? 0.38
          : 0.28
        : isFemale
        ? 0.56
        : 0.44;
      v.x *= 1 - t * jawTaper;
      if (nz > 0) {
        v.z += t * (isRealistic ? 0.014 : 0.012) * nz;
        v.y -= t * 0.008 * nz;
      } else {
        v.z *= 1 - t * 0.26;
      }
    }

    if (ny > 0.15 && nz < 0) {
      v.z *= 1.09;
      v.x *= 1.03;
    }

    if (nz > 0.55) {
      const faceMask = (nz - 0.55) / 0.45;
      if (ny > 0.08 && ny < 0.34) {
        v.z += faceMask * (isRealistic ? 0.006 : 0.004);
      }
      const centerMask = Math.exp(-nx * nx * 38);
      const noseYMask = Math.exp(-Math.pow((ny + 0.06) * 5.2, 2));
      v.z += centerMask * noseYMask * (isRealistic ? 0.015 : 0.011);
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geom.computeVertexNormals();
  return geom;
}

function createHairLockGeometry(
  length: number,
  width: number,
  thickness: number
): THREE.BufferGeometry {
  const rings: RingProfile[] = [
    { y: 0, rx: width * 0.65, rzFront: thickness * 0.7, rzBack: thickness * 0.7 },
    { y: -length * 0.25, rx: width, rzFront: thickness, rzBack: thickness * 0.9, zOffset: -0.006 },
    { y: -length * 0.62, rx: width * 0.78, rzFront: thickness * 0.75, rzBack: thickness * 0.7, zOffset: -0.01 },
    { y: -length * 0.88, rx: width * 0.36, rzFront: thickness * 0.4, rzBack: thickness * 0.35, zOffset: -0.006 },
    { y: -length, rx: 0.004, rzFront: 0.004, rzBack: 0.004, zOffset: 0 },
  ];
  return createLoftedGeometry(rings, 14);
}

/**
 * Builds a procedural rigged mannequin for all 4 archetypes:
 * - realistic-male (8-heads ~1.80m)
 * - realistic-female (8-heads ~1.69m)
 * - anime-male (stylized ~1.74m)
 * - anime-female (stylized ~1.63m)
 * Complete with 19 body bones + full 30-bone articulated finger rigs,
 * anatomical morph targets, and spring bones.
 */
export function buildProceduralMannequin(
  preset: BuiltInArchetype
): RiggedMannequinHandle {
  const isFemale =
    preset === 'sotai1' ||
    preset === 'anime-female' ||
    preset === 'realistic-female';
  const isRealistic =
    preset === 'sotai1' ||
    preset === 'realistic-male' ||
    preset === 'realistic-female';

  const root = new THREE.Group();
  root.name = `ProceduralMannequin_${preset}`;

  // Archetype proportions (meters)
  const hipsY = isRealistic ? (isFemale ? 0.94 : 0.99) : isFemale ? 0.91 : 0.96;
  const upperLegLen = isRealistic ? (isFemale ? 0.43 : 0.45) : isFemale ? 0.41 : 0.43;
  const lowerLegLen = isRealistic ? (isFemale ? 0.42 : 0.445) : isFemale ? 0.41 : 0.43;
  const footSoleOffset = 0.065;
  const hipHalfX = isFemale ? (isRealistic ? 0.1 : 0.095) : 0.094;
  const shoulderHalfX = isRealistic
    ? isFemale
      ? 0.178
      : 0.218
    : isFemale
    ? 0.165
    : 0.205;
  const upperArmLen = isRealistic ? (isFemale ? 0.28 : 0.31) : isFemale ? 0.265 : 0.295;
  const lowerArmLen = isRealistic ? (isFemale ? 0.25 : 0.275) : isFemale ? 0.24 : 0.265;
  const spineLen = isRealistic ? 0.12 : 0.11;
  const chestOffset = isRealistic ? 0.165 : 0.155;
  const neckOffset = isRealistic ? (isFemale ? 0.2 : 0.215) : isFemale ? 0.185 : 0.2;
  const headOffset = isRealistic ? (isFemale ? 0.095 : 0.1) : isFemale ? 0.085 : 0.09;

  // Neutral matte studio grey clay defaults
  const baseColor = isFemale ? '#d2d0ce' : '#c8c9ce';
  const accentColor = isFemale ? '#b5b2b0' : '#a9abb4';
  const hairColor = isRealistic ? '#9e9ea6' : isFemale ? '#8d8898' : '#7b7c8a';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.76,
    metalness: 0.02,
    flatShading: false,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.7,
    metalness: 0.04,
    flatShading: false,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColor,
    roughness: 0.72,
    metalness: 0.03,
    flatShading: false,
  });

  const meshes: THREE.Mesh[] = [];
  const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [bodyMat, jointMat, hairMat];

  const registerMesh = (mesh: THREE.Mesh, isJoint = false) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isJointAccent = isJoint;
    syncMeshMorphTargets(mesh);
    meshes.push(mesh);
    originalMaterials.set(mesh, mesh.material);
    geometriesToDispose.push(mesh.geometry);
    return mesh;
  };

  // --- Create VRM Bone Hierarchy ---
  const bones: Partial<Record<VrmBoneName, THREE.Bone>> = {};
  const makeBone = (
    name: VrmBoneName,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number
  ) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    bones[name] = b;
    return b;
  };

  const hips = makeBone('hips', root, 0, hipsY, 0);
  const spine = makeBone('spine', hips, 0, spineLen, 0);
  const chest = makeBone('chest', spine, 0, chestOffset, 0);
  const neck = makeBone('neck', chest, 0, neckOffset, 0);
  const head = makeBone('head', neck, 0, headOffset, 0);

  const leftShoulder = makeBone('leftShoulder', chest, 0.045, neckOffset * 0.74, 0);
  const leftUpperArm = makeBone('leftUpperArm', leftShoulder, shoulderHalfX - 0.045, 0, 0);
  const leftLowerArm = makeBone('leftLowerArm', leftUpperArm, upperArmLen, 0, 0);
  const leftHand = makeBone('leftHand', leftLowerArm, lowerArmLen, 0, 0);

  const rightShoulder = makeBone('rightShoulder', chest, -0.045, neckOffset * 0.74, 0);
  const rightUpperArm = makeBone('rightUpperArm', rightShoulder, -(shoulderHalfX - 0.045), 0, 0);
  const rightLowerArm = makeBone('rightLowerArm', rightUpperArm, -upperArmLen, 0, 0);
  const rightHand = makeBone('rightHand', rightLowerArm, -lowerArmLen, 0, 0);

  const leftUpperLeg = makeBone('leftUpperLeg', hips, hipHalfX, -0.035, 0);
  const leftLowerLeg = makeBone('leftLowerLeg', leftUpperLeg, 0, -upperLegLen, 0);
  const leftFoot = makeBone('leftFoot', leftLowerLeg, 0, -lowerLegLen, 0);

  const rightUpperLeg = makeBone('rightUpperLeg', hips, -hipHalfX, -0.035, 0);
  const rightLowerLeg = makeBone('rightLowerLeg', rightUpperLeg, 0, -upperLegLen, 0);
  const rightFoot = makeBone('rightFoot', rightLowerLeg, 0, -lowerLegLen, 0);

  // --- Secondary Spring Bones ---
  const springBones: ProceduralSpringBone[] = [];
  const makeSpringBone = (
    name: string,
    parent: THREE.Object3D,
    pos: [number, number, number],
    restLocalDir: THREE.Vector3,
    length: number,
    baseStiffness: number,
    baseGravity: number,
    baseDrag: number,
    maxAngleDeg: number
  ) => {
    const sb = new THREE.Bone();
    sb.name = name;
    sb.position.set(pos[0], pos[1], pos[2]);
    parent.add(sb);
    springBones.push({
      name,
      bone: sb,
      restRotation: sb.quaternion.clone(),
      restLocalDir: restLocalDir.clone().normalize(),
      length,
      baseStiffness,
      baseGravity,
      baseDrag,
      maxAngleRad: THREE.MathUtils.degToRad(maxAngleDeg),
      prevTipWorld: new THREE.Vector3(),
      currTipWorld: new THREE.Vector3(),
      initialized: false,
    });
    return sb;
  };

  // --- 1. Pelvis / Hips Mesh ---
  const pelvisGeom = createLoftedGeometry(
    isFemale
      ? [
          { y: -0.085, rx: 0.084, rzFront: 0.068, rzBack: 0.075, zOffset: -0.004 },
          { y: -0.045, rx: 0.146, rzFront: 0.096, rzBack: 0.118, zOffset: -0.008 },
          { y: 0.01, rx: 0.156, rzFront: 0.099, rzBack: 0.122, zOffset: -0.006 },
          { y: 0.075, rx: 0.134, rzFront: 0.089, rzBack: 0.098, zOffset: -0.002 },
          { y: spineLen + 0.01, rx: 0.106, rzFront: 0.079, rzBack: 0.083, zOffset: 0 },
        ]
      : [
          { y: -0.085, rx: 0.088, rzFront: 0.074, rzBack: 0.078, zOffset: -0.004 },
          { y: -0.04, rx: 0.138, rzFront: 0.098, rzBack: 0.105, zOffset: -0.004 },
          { y: 0.015, rx: 0.146, rzFront: 0.101, rzBack: 0.106, zOffset: -0.003 },
          { y: 0.075, rx: 0.142, rzFront: 0.098, rzBack: 0.099, zOffset: 0 },
          { y: spineLen + 0.01, rx: 0.134, rzFront: 0.094, rzBack: 0.095, zOffset: 0 },
        ],
    28
  );

  addMorphTarget(pelvisGeom, 'Hip_Width', (x, y, _z, out) => {
    const band = Math.exp(-Math.pow((y - 0.005) / 0.07, 2));
    out.x = x * 0.28 * band;
  });
  addMorphTarget(pelvisGeom, 'Waist_Taper', (x, y, z, out) => {
    const topMask = THREE.MathUtils.smoothstep(y, 0.03, 0.12);
    out.x = -x * 0.22 * topMask;
    out.z = -z * 0.14 * topMask;
  });
  addMorphTarget(pelvisGeom, 'Glute_Volume', (x, y, z, out) => {
    if (z < 0) {
      const backMask = Math.min(1, -z / 0.11);
      const yMask = Math.exp(-Math.pow((y + 0.018) / 0.065, 2));
      out.z = -0.045 * backMask * yMask;
      out.x = Math.sign(x) * 0.014 * backMask * yMask;
    }
  });
  addMorphTarget(pelvisGeom, 'Glute_Drop', (_x, y, z, out) => {
    if (z < -0.01) {
      const backMask = Math.min(1, -z / 0.11);
      const yMask = Math.exp(-Math.pow((y + 0.03) / 0.06, 2));
      out.y = -0.032 * backMask * yMask;
      out.z = -0.012 * backMask * yMask;
    }
  });
  hips.add(registerMesh(new THREE.Mesh(pelvisGeom, bodyMat)));

  // --- Sculpted Glute Spring Volumes ---
  const createGluteForm = (side: 1 | -1) => {
    const sb = makeSpringBone(
      side > 0 ? 'leftGluteSpring' : 'rightGluteSpring',
      hips,
      [side * (isFemale ? 0.065 : 0.058), -0.015, -0.058],
      new THREE.Vector3(side * 0.15, -0.25, -1),
      0.09,
      0.72,
      0.45,
      0.48,
      14
    );
    const g = new THREE.SphereGeometry(isFemale ? 0.078 : 0.068, 22, 18);
    g.scale(0.95, 1.06, isFemale ? 1.02 : 0.82);

    addMorphTarget(g, 'Glute_Volume', (x, y, z, out) => {
      out.x = x * 0.24 + side * 0.012;
      out.y = y * 0.18;
      out.z = z * 0.42 - 0.024;
    });
    addMorphTarget(g, 'Glute_Drop', (_x, y, z, out) => {
      const lowerMask = THREE.MathUtils.smoothstep(-y, -0.05, 0.07);
      out.y = -0.028 * (0.4 + 0.6 * lowerMask);
      out.z = z < 0 ? -0.012 * lowerMask : 0;
    });
    addMorphTarget(g, 'Hip_Width', (_x, _y, _z, out) => {
      out.x = side * 0.022;
    });

    const m = registerMesh(new THREE.Mesh(g, bodyMat));
    m.position.set(0, -0.008, -0.018);
    sb.add(m);
  };
  createGluteForm(1);
  createGluteForm(-1);

  // --- 2. Spine / Abdomen Mesh ---
  const spineGeom = createLoftedGeometry(
    isFemale
      ? [
          { y: -0.015, rx: 0.106, rzFront: 0.078, rzBack: 0.08, zOffset: 0.0 },
          { y: chestOffset * 0.3, rx: 0.094, rzFront: 0.074, rzBack: 0.073, zOffset: 0.004 },
          { y: chestOffset * 0.68, rx: 0.106, rzFront: 0.083, rzBack: 0.079, zOffset: 0.005 },
          { y: chestOffset + 0.01, rx: 0.125, rzFront: 0.094, rzBack: 0.087, zOffset: 0.003 },
        ]
      : [
          { y: -0.015, rx: 0.132, rzFront: 0.094, rzBack: 0.092, zOffset: 0.0 },
          { y: chestOffset * 0.3, rx: 0.13, rzFront: 0.096, rzBack: 0.09, zOffset: 0.005 },
          { y: chestOffset * 0.68, rx: 0.144, rzFront: 0.104, rzBack: 0.096, zOffset: 0.005 },
          { y: chestOffset + 0.01, rx: 0.162, rzFront: 0.115, rzBack: 0.104, zOffset: 0.002 },
        ],
    26
  );

  addMorphTarget(spineGeom, 'Waist_Taper', (x, y, z, out) => {
    const waistMask = Math.exp(-Math.pow((y - 0.05) / 0.065, 2));
    out.x = -x * 0.28 * waistMask;
    out.z = -z * 0.18 * waistMask;
  });
  addMorphTarget(spineGeom, 'Upper_Muscle', (x, y, z, out) => {
    const upperMask = THREE.MathUtils.smoothstep(y, 0.04, 0.16);
    out.x = x * 0.16 * upperMask;
    out.z = z * 0.12 * upperMask;
  });
  spine.add(registerMesh(new THREE.Mesh(spineGeom, bodyMat)));

  // --- 3. Chest / Ribcage Mesh ---
  const chestGeom = createLoftedGeometry(
    isFemale
      ? [
          { y: -0.01, rx: 0.122, rzFront: 0.092, rzBack: 0.086, zOffset: 0.002 },
          { y: neckOffset * 0.3, rx: 0.136, rzFront: 0.1, rzBack: 0.094, zOffset: 0.0 },
          { y: neckOffset * 0.65, rx: 0.154, rzFront: 0.094, rzBack: 0.092, zOffset: -0.004 },
          { y: neckOffset * 0.88, rx: 0.138, rzFront: 0.074, rzBack: 0.078, zOffset: -0.006 },
          { y: neckOffset + 0.005, rx: 0.056, rzFront: 0.052, rzBack: 0.054, zOffset: -0.006 },
        ]
      : [
          { y: -0.01, rx: 0.156, rzFront: 0.112, rzBack: 0.1, zOffset: 0.002 },
          { y: neckOffset * 0.3, rx: 0.18, rzFront: 0.126, rzBack: 0.112, zOffset: 0.002 },
          { y: neckOffset * 0.65, rx: 0.204, rzFront: 0.118, rzBack: 0.108, zOffset: -0.004 },
          { y: neckOffset * 0.88, rx: 0.172, rzFront: 0.086, rzBack: 0.09, zOffset: -0.006 },
          { y: neckOffset + 0.005, rx: 0.068, rzFront: 0.064, rzBack: 0.064, zOffset: -0.006 },
        ],
    28
  );

  addMorphTarget(chestGeom, 'Upper_Muscle', (x, y, z, out) => {
    const band = Math.exp(-Math.pow((y - 0.1) / 0.085, 2));
    out.x = x * 0.2 * band;
    out.z = (z > 0 ? z * 0.24 : z * 0.14) * band;
  });
  addMorphTarget(chestGeom, 'Shoulder_Width', (x, y, _z, out) => {
    const topBand = THREE.MathUtils.smoothstep(y, 0.05, 0.16);
    out.x = x * 0.22 * topBand;
  });
  chest.add(registerMesh(new THREE.Mesh(chestGeom, bodyMat)));

  // --- Sculpted Bust / Pectoral Spring Volumes ---
  const createBustForm = (side: 1 | -1) => {
    const sb = makeSpringBone(
      side > 0 ? 'leftBreastSpring' : 'rightBreastSpring',
      chest,
      [
        side * (isFemale ? 0.056 : 0.072),
        isFemale ? neckOffset * 0.42 : neckOffset * 0.46,
        isFemale ? 0.062 : 0.08,
      ],
      new THREE.Vector3(side * 0.14, -0.22, 1),
      0.085,
      isFemale ? 0.52 : 0.85,
      isFemale ? 0.62 : 0.18,
      0.38,
      20
    );

    const baseR = isFemale ? 0.064 : 0.056;
    const g = new THREE.SphereGeometry(baseR, 24, 20);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      if (isFemale) {
        x *= 1.02;
        y *= 0.96;
        z *= 0.96;
        if (y < 0) z *= 1.08;
        if (y > 0 && z > 0) z *= 0.88;
      } else {
        x *= 1.38;
        y *= 0.95;
        z *= 0.45;
      }
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();

    addMorphTarget(g, 'Bust_Fullness', (x, y, z, out) => {
      const scale = isFemale ? 1.0 : 0.55;
      out.x = x * 0.34 * scale + side * 0.008 * scale;
      out.y = y * 0.34 * scale - 0.01 * scale;
      out.z = (z > 0 ? z * 0.62 : z * 0.12) * scale + 0.022 * scale;
    });
    addMorphTarget(g, 'Bust_Splay', (_x, _y, z, out) => {
      out.x = side * 0.028;
      out.z = z > 0 ? -0.01 : 0;
    });
    addMorphTarget(g, 'Chest_Hang_Forward', (x, y, z, out) => {
      const scale = isFemale ? 1.0 : 0.22;
      const frontMask = THREE.MathUtils.smoothstep(z, -0.02, baseR * 0.8);
      out.z = (0.042 * frontMask + 0.014) * scale;
      out.y = (-0.014 * frontMask + y * 0.08) * scale;
      out.x = -x * 0.08 * scale;
    });
    addMorphTarget(g, 'Chest_Splay_Back', (x, y, z, out) => {
      const scale = isFemale ? 1.0 : 0.22;
      const frontMask = THREE.MathUtils.smoothstep(z, -0.02, baseR * 0.8);
      out.z = -0.036 * frontMask * scale;
      out.x = (side * 0.032 + x * 0.18) * scale;
      out.y = (0.01 + y * 0.08) * scale;
    });
    addMorphTarget(g, 'Upper_Muscle', (x, y, z, out) => {
      out.x = x * 0.22;
      out.y = y * 0.14 + 0.006;
      out.z = z > 0 ? 0.014 : 0;
    });

    const m = registerMesh(new THREE.Mesh(g, bodyMat));
    m.position.set(0, -0.004, isFemale ? 0.016 : 0.004);
    sb.add(m);
  };
  createBustForm(1);
  createBustForm(-1);

  // --- 4. Neck, Head, Sculpted Facial Features & 7 Swappable Hair Styles ---
  const neckGeom = createLoftedGeometry(
    [
      { y: -0.01, rx: isFemale ? 0.046 : 0.058, rzFront: isFemale ? 0.044 : 0.055, rzBack: isFemale ? 0.046 : 0.057 },
      { y: headOffset * 0.5, rx: isFemale ? 0.041 : 0.052, rzFront: isFemale ? 0.041 : 0.051, rzBack: isFemale ? 0.043 : 0.053 },
      { y: headOffset + 0.01, rx: isFemale ? 0.042 : 0.053, rzFront: isFemale ? 0.042 : 0.051, rzBack: isFemale ? 0.044 : 0.053 },
    ],
    18
  );
  neck.add(registerMesh(new THREE.Mesh(neckGeom, bodyMat)));

  const headCenterY = isRealistic ? 0.095 : 0.102;
  const headRadius = isRealistic ? (isFemale ? 0.088 : 0.095) : isFemale ? 0.105 : 0.112;
  const headGeom = createHeadGeometry(isFemale, isRealistic);
  const headMesh = registerMesh(new THREE.Mesh(headGeom, bodyMat));
  headMesh.position.set(0, headCenterY, 0.01);
  head.add(headMesh);

  for (const side of [1, -1] as const) {
    const earG = new THREE.SphereGeometry(isRealistic ? 0.016 : 0.018, 12, 10);
    earG.scale(0.45, 1.35, 0.72);
    const ear = registerMesh(new THREE.Mesh(earG, bodyMat));
    ear.position.set(
      side * (isRealistic ? (isFemale ? 0.084 : 0.092) : isFemale ? 0.098 : 0.106),
      isRealistic ? 0.088 : 0.094,
      0.002
    );
    head.add(ear);
  }

  // --- A. Sculpted Articulated Facial Features ---
  const faceGroup = new THREE.Group();
  faceGroup.name = 'FaceFeaturesGroup';
  head.add(faceGroup);

  const scleraMat = new THREE.MeshStandardMaterial({
    color: '#f7f7fa',
    roughness: 0.25,
    metalness: 0.02,
  });
  const irisMat = new THREE.MeshStandardMaterial({
    color: '#4e5d94',
    roughness: 0.22,
    metalness: 0.08,
  });
  const pupilMat = new THREE.MeshStandardMaterial({
    color: '#181822',
    roughness: 0.18,
  });
  const browFeatureMat = new THREE.MeshStandardMaterial({
    color: '#52505e',
    roughness: 0.65,
  });
  const lipFeatureMat = new THREE.MeshStandardMaterial({
    color: isFemale ? '#9c646e' : '#85656a',
    roughness: 0.52,
  });
  const cavityMat = new THREE.MeshStandardMaterial({
    color: '#342228',
    roughness: 0.85,
  });
  materialsToDispose.push(
    scleraMat,
    irisMat,
    pupilMat,
    browFeatureMat,
    lipFeatureMat,
    cavityMat
  );

  const registerFeatureMesh = (m: THREE.Mesh) => {
    m.userData.isFaceFeature = true;
    m.castShadow = false;
    m.receiveShadow = true;
    meshes.push(m);
    originalMaterials.set(m, m.material);
    geometriesToDispose.push(m.geometry);
    return m;
  };

  const eyeBaseX = isRealistic ? (isFemale ? 0.029 : 0.032) : isFemale ? 0.034 : 0.037;
  const eyeBaseY = headCenterY + (isRealistic ? 0.006 : 0.0);
  // Head mesh center is at z = +0.01; place eye surface right on the outer anterior orbital plane
  const eyeBaseZ = 0.013 + headRadius * 0.955;
  const eyeW = isRealistic ? 0.0155 : 0.02;
  const eyeH = isRealistic ? 0.0105 : 0.0155;

  const buildEyeSide = (side: 1 | -1) => {
    // Sclera
    const scleraG = new THREE.SphereGeometry(eyeW, 16, 12);
    scleraG.scale(1.0, eyeH / eyeW, 0.42);
    const sclera = registerFeatureMesh(new THREE.Mesh(scleraG, scleraMat));
    sclera.position.set(side * eyeBaseX, eyeBaseY, eyeBaseZ - 0.001);
    sclera.rotation.y = side * 0.18;
    faceGroup.add(sclera);

    // Movable Iris + Pupil + Specular Catchlight
    const irisGroup = new THREE.Group();
    irisGroup.position.set(side * eyeBaseX, eyeBaseY, eyeBaseZ + 0.0045);
    irisGroup.rotation.y = side * 0.18;

    const irisR = isRealistic ? 0.0078 : 0.0112;
    const irisG = new THREE.SphereGeometry(irisR, 16, 12);
    irisG.scale(0.92, 1.05, 0.28);
    const irisMesh = registerFeatureMesh(new THREE.Mesh(irisG, irisMat));
    irisGroup.add(irisMesh);

    const pupilG = new THREE.SphereGeometry(irisR * 0.54, 12, 10);
    pupilG.scale(0.92, 1.05, 0.32);
    const pupilMesh = registerFeatureMesh(new THREE.Mesh(pupilG, pupilMat));
    pupilMesh.position.z = 0.0018;
    irisGroup.add(pupilMesh);

    const catchG = new THREE.SphereGeometry(irisR * 0.24, 8, 8);
    const catchMesh = registerFeatureMesh(new THREE.Mesh(catchG, scleraMat));
    catchMesh.position.set(irisR * 0.32, irisR * 0.34, 0.0032);
    irisGroup.add(catchMesh);

    faceGroup.add(irisGroup);

    // Upper Eyelid (scales/moves down on blink)
    const lidG = new THREE.SphereGeometry(eyeW * 1.06, 14, 10);
    lidG.scale(1.04, (eyeH / eyeW) * 0.98, 0.48);
    const lidMesh = registerFeatureMesh(new THREE.Mesh(lidG, bodyMat));
    lidMesh.position.set(side * eyeBaseX, eyeBaseY + 0.011, eyeBaseZ + 0.0015);
    lidMesh.rotation.y = side * 0.18;
    lidMesh.scale.y = 0.18;
    faceGroup.add(lidMesh);

    // Upper Lash Line / Crease Accent
    const lashG = new THREE.CapsuleGeometry(0.0022, eyeW * 1.38, 4, 8);
    lashG.rotateZ(Math.PI / 2);
    const lash = registerFeatureMesh(new THREE.Mesh(lashG, browFeatureMat));
    lash.position.set(side * eyeBaseX, eyeBaseY + eyeH * 0.84, eyeBaseZ + 0.004);
    lash.rotation.set(0, side * 0.18, -side * 0.06);
    faceGroup.add(lash);

    // Articulated Eyebrow
    const browG = new THREE.CapsuleGeometry(isFemale ? 0.0028 : 0.0038, eyeW * 1.65, 5, 10);
    browG.rotateZ(Math.PI / 2);
    const browMesh = registerFeatureMesh(new THREE.Mesh(browG, browFeatureMat));
    const browBaseY = eyeBaseY + (isRealistic ? 0.02 : 0.024);
    browMesh.position.set(side * eyeBaseX, browBaseY, eyeBaseZ + 0.0045);
    browMesh.rotation.y = side * 0.18;
    faceGroup.add(browMesh);

    return { irisGroup, lidMesh, browMesh, browBaseY };
  };

  const leftEyeParts = buildEyeSide(1);
  const rightEyeParts = buildEyeSide(-1);

  // Articulated Mouth (Upper Lip, Lower Lip, Curving Corners, Open Cavity)
  const mouthBaseY = headCenterY - (isRealistic ? 0.034 : 0.037);
  const mouthZ = 0.017 + headRadius * 0.94;

  const upperLipG = new THREE.CapsuleGeometry(0.0032, 0.022, 5, 10);
  upperLipG.rotateZ(Math.PI / 2);
  const upperLip = registerFeatureMesh(new THREE.Mesh(upperLipG, lipFeatureMat));
  upperLip.position.set(0, mouthBaseY + 0.0018, mouthZ);
  faceGroup.add(upperLip);

  const lowerLipG = new THREE.CapsuleGeometry(0.0034, 0.02, 5, 10);
  lowerLipG.rotateZ(Math.PI / 2);
  const lowerLip = registerFeatureMesh(new THREE.Mesh(lowerLipG, lipFeatureMat));
  lowerLip.position.set(0, mouthBaseY - 0.0018, mouthZ - 0.0004);
  faceGroup.add(lowerLip);

  const cornerG = new THREE.CapsuleGeometry(0.0026, 0.009, 4, 8);
  cornerG.rotateZ(Math.PI / 2);
  const leftMouthCorner = registerFeatureMesh(new THREE.Mesh(cornerG, lipFeatureMat));
  const rightMouthCorner = registerFeatureMesh(new THREE.Mesh(cornerG.clone(), lipFeatureMat));
  leftMouthCorner.position.set(0.014, mouthBaseY, mouthZ - 0.0008);
  rightMouthCorner.position.set(-0.014, mouthBaseY, mouthZ - 0.0008);
  faceGroup.add(leftMouthCorner, rightMouthCorner);

  const cavityG = new THREE.SphereGeometry(0.013, 14, 10);
  cavityG.scale(1.12, 0.8, 0.45);
  const mouthCavity = registerFeatureMesh(new THREE.Mesh(cavityG, cavityMat));
  mouthCavity.position.set(0, mouthBaseY, mouthZ - 0.001);
  mouthCavity.visible = false;
  faceGroup.add(mouthCavity);

  // --- B. 7 Swappable & Posable 3D Hair Styles ---
  const hairRootGroup = new THREE.Group();
  hairRootGroup.name = 'HairStylesRoot';
  head.add(hairRootGroup);

  const hairMeshes: THREE.Mesh[] = [];
  const registerHairMesh = (m: THREE.Mesh) => {
    m.userData.isHairMesh = true;
    const mMat = hairMat.clone();
    materialsToDispose.push(mMat);
    m.material = mMat;
    hairMeshes.push(m);
    return registerMesh(m);
  };

  // Crown Cap Volume (tilted backward so forehead, brows & eyes are cleanly visible)
  const capRadius = isRealistic ? (isFemale ? 0.093 : 0.1) : isFemale ? 0.112 : 0.119;
  const hairCapGroup = new THREE.Group();
  hairCapGroup.position.set(0, isRealistic ? 0.106 : 0.116, 0.002);
  hairRootGroup.add(hairCapGroup);

  const hairCapG = new THREE.SphereGeometry(capRadius, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.54);
  hairCapG.scale(1.04, isRealistic ? 1.18 : 1.12, 1.08);
  const hairCap = registerHairMesh(new THREE.Mesh(hairCapG, hairMat));
  hairCap.rotation.x = -0.38;
  hairCapGroup.add(hairCap);

  // Front Fringe / Bangs Group (parted side-framing bangs so eyes & brows remain clearly visible)
  const bangsGroup = new THREE.Group();
  bangsGroup.position.set(0, headCenterY + capRadius * 0.78, capRadius * 0.76);
  hairRootGroup.add(bangsGroup);

  for (const bx of [-0.048, 0, 0.048]) {
    const bangLock = registerHairMesh(
      new THREE.Mesh(
        createHairLockGeometry(bx === 0 ? 0.048 : 0.068, bx === 0 ? 0.02 : 0.024, 0.013),
        hairMat
      )
    );
    bangLock.position.set(bx, 0, bx === 0 ? 0.005 : 0);
    bangLock.rotation.set(0.18, 0, -bx * 2.6);
    bangsGroup.add(bangLock);
  }

  const styleGroups: Record<Exclude<HairStyleId, 'bald'>, THREE.Group> = {
    ponytail: new THREE.Group(),
    bob: new THREE.Group(),
    twintails: new THREE.Group(),
    'long-flowing': new THREE.Group(),
    'short-crop': new THREE.Group(),
    'swept-bangs': new THREE.Group(),
  };
  for (const grp of Object.values(styleGroups)) {
    hairRootGroup.add(grp);
  }

  const hairSpringBones: ProceduralFaceAndHairRig['hairSpringBones'] = [];
  const addSpringLockToStyle = (
    styleGroup: THREE.Group,
    name: string,
    pos: [number, number, number],
    restDir: THREE.Vector3,
    len: number,
    w: number,
    thick: number,
    initRot: [number, number, number] = [0, 0, 0]
  ) => {
    const sbBone = makeSpringBone(
      name,
      styleGroup,
      pos,
      restDir,
      len,
      0.35,
      0.8,
      0.27,
      46
    );
    const sbEntry = springBones[springBones.length - 1];
    const baseEuler = new THREE.Euler(initRot[0], initRot[1], initRot[2], 'XYZ');
    sbBone.rotation.copy(baseEuler);
    sbEntry.restRotation.setFromEuler(baseEuler);

    const mesh = registerHairMesh(
      new THREE.Mesh(createHairLockGeometry(len, w, thick), hairMat)
    );
    sbBone.add(mesh);
    hairSpringBones.push({ sb: sbEntry, baseEuler, lengthTarget: mesh });
  };

  // Style 1: Long Ponytail (+ side framing locks)
  addSpringLockToStyle(
    styleGroups.ponytail,
    'hairPonytailBack',
    [0, headCenterY + 0.025, -capRadius * 0.86],
    new THREE.Vector3(0, -1, -0.25),
    0.27,
    0.068,
    0.036
  );
  for (const side of [1, -1] as const) {
    addSpringLockToStyle(
      styleGroups.ponytail,
      side > 0 ? 'hairPonytailSideL' : 'hairPonytailSideR',
      [side * (capRadius * 0.88), headCenterY + 0.008, 0.032],
      new THREE.Vector3(side * 0.12, -1, 0.08),
      0.16,
      0.026,
      0.016
    );
  }

  // Style 2: Classic Anime Bob (chin-length rounded side & back curtains)
  addSpringLockToStyle(
    styleGroups.bob,
    'hairBobBack',
    [0, headCenterY + 0.01, -capRadius * 0.84],
    new THREE.Vector3(0, -1, -0.1),
    0.15,
    0.088,
    0.035
  );
  for (const side of [1, -1] as const) {
    addSpringLockToStyle(
      styleGroups.bob,
      side > 0 ? 'hairBobSideL' : 'hairBobSideR',
      [side * (capRadius * 0.9), headCenterY + 0.015, 0.018],
      new THREE.Vector3(side * 0.08, -1, 0.05),
      0.16,
      0.044,
      0.022
    );
  }

  // Style 3: Twin Tails (high dual left/right articulated cascades)
  for (const side of [1, -1] as const) {
    addSpringLockToStyle(
      styleGroups.twintails,
      side > 0 ? 'hairTwinTailL' : 'hairTwinTailR',
      [side * (capRadius * 0.88), headCenterY + 0.045, -capRadius * 0.35],
      new THREE.Vector3(side * 0.32, -1, -0.15),
      0.32,
      0.052,
      0.032,
      [0, 0, side * 0.22]
    );
  }

  // Style 4: Long Flowing Hair (3 lush back locks + 2 shoulder locks)
  addSpringLockToStyle(
    styleGroups['long-flowing'],
    'hairFlowCenter',
    [0, headCenterY + 0.01, -capRadius * 0.88],
    new THREE.Vector3(0, -1, -0.18),
    0.34,
    0.085,
    0.036
  );
  for (const side of [1, -1] as const) {
    addSpringLockToStyle(
      styleGroups['long-flowing'],
      side > 0 ? 'hairFlowBackL' : 'hairFlowBackR',
      [side * (capRadius * 0.56), headCenterY + 0.01, -capRadius * 0.72],
      new THREE.Vector3(side * 0.16, -1, -0.16),
      0.32,
      0.058,
      0.028
    );
    addSpringLockToStyle(
      styleGroups['long-flowing'],
      side > 0 ? 'hairFlowFrontL' : 'hairFlowFrontR',
      [side * (capRadius * 0.88), headCenterY + 0.008, 0.028],
      new THREE.Vector3(side * 0.12, -1, 0.1),
      0.22,
      0.03,
      0.018
    );
  }

  // Style 5: Short Tousled Crop (sculpted crown spikes & short nape)
  for (const [sx, sy, sz, rx, rz] of [
    [0, headCenterY + capRadius * 0.92, 0.04, 0.45, 0],
    [0.038, headCenterY + capRadius * 0.86, 0.025, 0.32, -0.35],
    [-0.038, headCenterY + capRadius * 0.86, 0.025, 0.32, 0.35],
    [0, headCenterY + 0.02, -capRadius * 0.86, -0.25, 0],
  ] as const) {
    const spike = registerHairMesh(
      new THREE.Mesh(createHairLockGeometry(0.085, 0.032, 0.018), hairMat)
    );
    spike.position.set(sx, sy, sz);
    spike.rotation.set(rx, 0, rz);
    styleGroups['short-crop'].add(spike);
  }

  // Style 6: Side-Swept Fringe (dramatic swept front lock + medium tapered back)
  addSpringLockToStyle(
    styleGroups['swept-bangs'],
    'hairSweptFront',
    [0.042, headCenterY + capRadius * 0.55, capRadius * 0.78],
    new THREE.Vector3(-0.35, -1, 0.2),
    0.16,
    0.048,
    0.02,
    [0.12, 0, -0.32]
  );
  addSpringLockToStyle(
    styleGroups['swept-bangs'],
    'hairSweptBack',
    [0, headCenterY + 0.015, -capRadius * 0.85],
    new THREE.Vector3(0, -1, -0.15),
    0.19,
    0.078,
    0.032
  );

  const faceAndHairRig: ProceduralFaceAndHairRig = {
    faceGroup,
    leftIrisGroup: leftEyeParts.irisGroup,
    rightIrisGroup: rightEyeParts.irisGroup,
    leftEyelid: leftEyeParts.lidMesh,
    rightEyelid: rightEyeParts.lidMesh,
    leftBrow: leftEyeParts.browMesh,
    rightBrow: rightEyeParts.browMesh,
    upperLip,
    lowerLip,
    leftMouthCorner,
    rightMouthCorner,
    mouthCavity,
    eyeBaseX,
    eyeBaseY,
    eyeBaseZ,
    browBaseY: leftEyeParts.browBaseY,
    mouthBaseY,
    hairRootGroup,
    hairCapGroup,
    bangsGroup,
    styleGroups,
    hairMeshes,
    hairSpringBones,
  };

  // --- 5. Arms + Full 30-Bone Articulated Finger Rigs ---
  const buildHandWithFingers = (side: 1 | -1, handBone: THREE.Bone) => {
    const prefix = side > 0 ? 'left' : 'right';
    const wristG = new THREE.SphereGeometry(isFemale ? 0.02 : 0.024, 12, 10);
    handBone.add(registerMesh(new THREE.Mesh(wristG, jointMat), true));

    const palmLen = isFemale ? 0.076 : 0.086;
    const palmThick = isFemale ? 0.02 : 0.024;
    const palmWidth = isFemale ? 0.068 : 0.078;

    const palmG = new THREE.BoxGeometry(palmLen, palmThick, palmWidth, 2, 2, 2);
    const palmPos = palmG.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < palmPos.count; i++) {
      const px = palmPos.getX(i);
      const py = palmPos.getY(i);
      const pz = palmPos.getZ(i);
      const t = px / palmLen + 0.5;
      palmPos.setXYZ(i, px, py * (1 - 0.15 * t), pz * (0.94 - 0.06 * t));
    }
    palmG.computeVertexNormals();
    const palm = registerMesh(new THREE.Mesh(palmG, bodyMat));
    palm.position.set(side * (palmLen * 0.52), 0, 0);
    handBone.add(palm);

    const makePhalanxMesh = (len: number, r: number) => {
      const g = new THREE.CapsuleGeometry(r, Math.max(0.004, len - r * 1.4), 5, 8);
      g.rotateZ(-side * (Math.PI / 2));
      const m = registerMesh(new THREE.Mesh(g, bodyMat));
      m.position.set(side * (len * 0.5), 0, 0);
      return m;
    };

    // 4 Fingers (Index, Middle, Ring, Little) — 3 phalanges each
    const fingerSpecs: Array<{
      cap: string;
      zOff: number;
      lengths: [number, number, number];
      radius: number;
    }> = [
      {
        cap: 'Index',
        zOff: palmWidth * 0.34,
        lengths: isFemale ? [0.034, 0.022, 0.017] : [0.038, 0.025, 0.019],
        radius: isFemale ? 0.0072 : 0.0086,
      },
      {
        cap: 'Middle',
        zOff: palmWidth * 0.11,
        lengths: isFemale ? [0.038, 0.025, 0.018] : [0.042, 0.028, 0.02],
        radius: isFemale ? 0.0075 : 0.009,
      },
      {
        cap: 'Ring',
        zOff: -palmWidth * 0.12,
        lengths: isFemale ? [0.035, 0.023, 0.017] : [0.039, 0.025, 0.019],
        radius: isFemale ? 0.007 : 0.0084,
      },
      {
        cap: 'Little',
        zOff: -palmWidth * 0.35,
        lengths: isFemale ? [0.027, 0.018, 0.014] : [0.03, 0.02, 0.016],
        radius: isFemale ? 0.0062 : 0.0075,
      },
    ];

    for (const spec of fingerSpecs) {
      const prox = makeBone(
        `${prefix}${spec.cap}Proximal` as VrmBoneName,
        handBone,
        side * (palmLen * 0.96),
        0,
        spec.zOff
      );
      prox.add(makePhalanxMesh(spec.lengths[0], spec.radius));

      const inter = makeBone(
        `${prefix}${spec.cap}Intermediate` as VrmBoneName,
        prox,
        side * spec.lengths[0],
        0,
        0
      );
      inter.add(makePhalanxMesh(spec.lengths[1], spec.radius * 0.9));

      const dist = makeBone(
        `${prefix}${spec.cap}Distal` as VrmBoneName,
        inter,
        side * spec.lengths[1],
        0,
        0
      );
      dist.add(makePhalanxMesh(spec.lengths[2], spec.radius * 0.78));
    }

    // Thumb — 3 phalanges (Proximal, Intermediate, Distal)
    const tLens: [number, number, number] = isFemale
      ? [0.026, 0.023, 0.018]
      : [0.03, 0.026, 0.021];
    const tRad = isFemale ? 0.0085 : 0.01;
    const tProx = makeBone(
      `${prefix}ThumbProximal` as VrmBoneName,
      handBone,
      side * (palmLen * 0.34),
      -palmThick * 0.22,
      palmWidth * 0.44
    );
    tProx.add(makePhalanxMesh(tLens[0], tRad));

    const tInter = makeBone(
      `${prefix}ThumbIntermediate` as VrmBoneName,
      tProx,
      side * tLens[0],
      0,
      0
    );
    tInter.add(makePhalanxMesh(tLens[1], tRad * 0.9));

    const tDist = makeBone(
      `${prefix}ThumbDistal` as VrmBoneName,
      tInter,
      side * tLens[1],
      0,
      0
    );
    tDist.add(makePhalanxMesh(tLens[2], tRad * 0.8));
  };

  const buildArm = (
    side: 1 | -1,
    upperBone: THREE.Bone,
    lowerBone: THREE.Bone,
    handBone: THREE.Bone
  ) => {
    const shBallG = new THREE.SphereGeometry(isFemale ? 0.044 : 0.055, 18, 14);
    addMorphTarget(shBallG, 'Upper_Muscle', (x, y, z, out) => {
      out.set(x * 0.28, y * 0.28, z * 0.28);
    });
    upperBone.add(registerMesh(new THREE.Mesh(shBallG, bodyMat), true));

    const upperG = createLoftedGeometry(
      [
        { y: 0.0, rx: isFemale ? 0.042 : 0.053, rzFront: isFemale ? 0.043 : 0.054, rzBack: isFemale ? 0.043 : 0.054 },
        { y: upperArmLen * 0.35, rx: isFemale ? 0.038 : 0.05, rzFront: isFemale ? 0.04 : 0.053, rzBack: isFemale ? 0.039 : 0.051 },
        { y: upperArmLen * 0.72, rx: isFemale ? 0.034 : 0.044, rzFront: isFemale ? 0.035 : 0.046, rzBack: isFemale ? 0.034 : 0.045 },
        { y: upperArmLen, rx: isFemale ? 0.031 : 0.039, rzFront: isFemale ? 0.031 : 0.039, rzBack: isFemale ? 0.031 : 0.039 },
      ],
      18
    );
    upperG.rotateZ(-side * (Math.PI / 2));
    addMorphTarget(upperG, 'Upper_Muscle', (x, y, z, out) => {
      const mid = Math.exp(-Math.pow((Math.abs(x) - upperArmLen * 0.42) / (upperArmLen * 0.36), 2));
      out.y = y * 0.3 * mid;
      out.z = z * 0.3 * mid;
    });
    upperBone.add(registerMesh(new THREE.Mesh(upperG, bodyMat)));

    const elbowG = new THREE.SphereGeometry(isFemale ? 0.031 : 0.039, 14, 12);
    lowerBone.add(registerMesh(new THREE.Mesh(elbowG, jointMat), true));

    const lowerG = createLoftedGeometry(
      [
        { y: 0.0, rx: isFemale ? 0.032 : 0.041, rzFront: isFemale ? 0.033 : 0.042, rzBack: isFemale ? 0.032 : 0.041 },
        { y: lowerArmLen * 0.28, rx: isFemale ? 0.034 : 0.044, rzFront: isFemale ? 0.034 : 0.044, rzBack: isFemale ? 0.033 : 0.042 },
        { y: lowerArmLen * 0.72, rx: isFemale ? 0.025 : 0.031, rzFront: isFemale ? 0.024 : 0.03, rzBack: isFemale ? 0.024 : 0.03 },
        { y: lowerArmLen, rx: isFemale ? 0.021 : 0.026, rzFront: isFemale ? 0.019 : 0.024, rzBack: isFemale ? 0.019 : 0.024 },
      ],
      18
    );
    lowerG.rotateZ(-side * (Math.PI / 2));
    addMorphTarget(lowerG, 'Upper_Muscle', (x, y, z, out) => {
      const mid = Math.exp(-Math.pow((Math.abs(x) - lowerArmLen * 0.32) / (lowerArmLen * 0.34), 2));
      out.y = y * 0.24 * mid;
      out.z = z * 0.24 * mid;
    });
    lowerBone.add(registerMesh(new THREE.Mesh(lowerG, bodyMat)));

    buildHandWithFingers(side, handBone);
  };

  buildArm(1, leftUpperArm, leftLowerArm, leftHand);
  buildArm(-1, rightUpperArm, rightLowerArm, rightHand);

  // --- 6. Legs ---
  const buildLeg = (
    side: 1 | -1,
    upperBone: THREE.Bone,
    lowerBone: THREE.Bone,
    footBone: THREE.Bone
  ) => {
    const hipBallG = new THREE.SphereGeometry(isFemale ? 0.068 : 0.071, 18, 14);
    upperBone.add(registerMesh(new THREE.Mesh(hipBallG, bodyMat)));

    const thighG = createLoftedGeometry(
      isFemale
        ? [
            { y: -upperLegLen, rx: 0.045, rzFront: 0.047, rzBack: 0.046 },
            { y: -upperLegLen * 0.7, rx: 0.056, rzFront: 0.061, rzBack: 0.057 },
            { y: -upperLegLen * 0.34, rx: 0.072, rzFront: 0.076, rzBack: 0.074, xOffset: side * 0.003 },
            { y: -0.04, rx: 0.074, rzFront: 0.075, rzBack: 0.077, xOffset: side * 0.004 },
            { y: 0.015, rx: 0.058, rzFront: 0.058, rzBack: 0.06, xOffset: side * 0.002 },
          ]
        : [
            { y: -upperLegLen, rx: 0.05, rzFront: 0.052, rzBack: 0.05 },
            { y: -upperLegLen * 0.7, rx: 0.063, rzFront: 0.068, rzBack: 0.064 },
            { y: -upperLegLen * 0.34, rx: 0.076, rzFront: 0.082, rzBack: 0.077, xOffset: side * 0.002 },
            { y: -0.04, rx: 0.077, rzFront: 0.078, rzBack: 0.078, xOffset: side * 0.002 },
            { y: 0.015, rx: 0.06, rzFront: 0.06, rzBack: 0.06, xOffset: side * 0.001 },
          ],
      22
    );

    addMorphTarget(thighG, 'Lower_Muscle', (x, y, z, out) => {
      const quadBand = Math.exp(-Math.pow((y + upperLegLen * 0.45) / (upperLegLen * 0.32), 2));
      out.x = x * 0.24 * quadBand;
      out.z = (z > 0 ? z * 0.34 : z * 0.18) * quadBand;
    });
    addMorphTarget(thighG, 'Hip_Width', (x, y, _z, out) => {
      const topMask = THREE.MathUtils.smoothstep(y, -upperLegLen * 0.55, 0);
      out.x = side * 0.022 * topMask + x * 0.08 * topMask;
    });
    upperBone.add(registerMesh(new THREE.Mesh(thighG, bodyMat)));

    const kneeG = new THREE.SphereGeometry(isFemale ? 0.044 : 0.049, 16, 12);
    lowerBone.add(registerMesh(new THREE.Mesh(kneeG, jointMat), true));

    const calfG = createLoftedGeometry(
      isFemale
        ? [
            { y: -lowerLegLen, rx: 0.03, rzFront: 0.032, rzBack: 0.032 },
            { y: -lowerLegLen * 0.68, rx: 0.038, rzFront: 0.039, rzBack: 0.044 },
            { y: -lowerLegLen * 0.32, rx: 0.052, rzFront: 0.049, rzBack: 0.062, zOffset: -0.005 },
            { y: -0.01, rx: 0.046, rzFront: 0.047, rzBack: 0.048 },
          ]
        : [
            { y: -lowerLegLen, rx: 0.034, rzFront: 0.036, rzBack: 0.036 },
            { y: -lowerLegLen * 0.68, rx: 0.043, rzFront: 0.044, rzBack: 0.05 },
            { y: -lowerLegLen * 0.32, rx: 0.059, rzFront: 0.055, rzBack: 0.07, zOffset: -0.006 },
            { y: -0.01, rx: 0.051, rzFront: 0.052, rzBack: 0.052 },
          ],
      20
    );
    addMorphTarget(calfG, 'Lower_Muscle', (x, y, z, out) => {
      const calfBand = Math.exp(-Math.pow((y + lowerLegLen * 0.34) / (lowerLegLen * 0.25), 2));
      out.x = x * 0.24 * calfBand;
      out.z = (z < 0 ? z * 0.36 : z * 0.1) * calfBand;
    });
    lowerBone.add(registerMesh(new THREE.Mesh(calfG, bodyMat)));

    const ankleG = new THREE.SphereGeometry(isFemale ? 0.03 : 0.034, 14, 12);
    footBone.add(registerMesh(new THREE.Mesh(ankleG, jointMat), true));

    const footLen = isFemale ? 0.21 : 0.245;
    const footW = isFemale ? 0.074 : 0.088;
    const footG = new THREE.BoxGeometry(footW, footSoleOffset * 0.82, footLen, 2, 2, 4);
    const fPos = footG.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < fPos.count; i++) {
      let x = fPos.getX(i);
      let y = fPos.getY(i);
      const z = fPos.getZ(i);
      const t = z / footLen + 0.5;
      if (y > 0) y *= 1 - 0.55 * t;
      const widthCurve = 0.82 + 0.24 * Math.sin(t * Math.PI * 0.85);
      x *= widthCurve;
      fPos.setXYZ(i, x, y, z);
    }
    footG.computeVertexNormals();
    const footMesh = registerMesh(new THREE.Mesh(footG, bodyMat));
    footMesh.position.set(0, -footSoleOffset * 0.56, footLen * 0.26);
    footBone.add(footMesh);
  };

  buildLeg(1, leftUpperLeg, leftLowerLeg, leftFoot);
  buildLeg(-1, rightUpperLeg, rightLowerLeg, rightFoot);

  root.updateMatrixWorld(true);

  const detectedFingerBoneCount = FINGER_BONES.filter((b) => Boolean(bones[b])).length;

  const dispose = () => {
    geometriesToDispose.forEach((g) => g.dispose());
    materialsToDispose.forEach((m) => m.dispose());
  };

  return {
    root,
    bones,
    restHipsY: hipsY,
    footSoleOffset,
    meshes,
    originalMaterials,
    springBones,
    faceAndHairRig,
    vrm: null,
    isVrm0: false,
    sourceType: 'procedural',
    detectedFingerBoneCount,
    dispose,
  };
}
