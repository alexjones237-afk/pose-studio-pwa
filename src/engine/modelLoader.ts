import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  BuiltInArchetype,
  FINGER_BONES,
  MaterialMode,
  ModelPreset,
  ModelSourceType,
  MorphTargetDescriptor,
  VrmBoneName,
} from '../types/pose';
import {
  buildProceduralMannequin,
  ProceduralSpringBone,
  RiggedMannequinHandle,
} from './proceduralMannequin';
import { ALL_VRM_BONES, BODY_VRM_BONES } from './poseUtils';
import {
  generateUniversalAnatomicalMorphs,
  UNIVERSAL_MORPH_KEYS,
} from './universalMorphGenerator';

const STANDARD_IMPORT_HEIGHT_M = 1.7;

async function checkModelExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Flexible fuzzy bone-name matcher covering VRM, Mixamo (`mixamorig:*`), Blender/Rigify,
 * ReadyPlayerMe, and standard humanoid rigs for all 19 body bones + 30 finger bones.
 */
function buildGlbBonePatterns(): Record<VrmBoneName, RegExp[]> {
  const base: Partial<Record<VrmBoneName, RegExp[]>> = {
    hips: [/hips/i, /pelvis/i, /root.*hip/i],
    spine: [/^.*spine$/i, /spine1/i, /spine_01/i, /lower.*back/i],
    chest: [/chest/i, /spine2/i, /spine_02/i, /upper.*chest/i, /torso/i],
    neck: [/neck/i],
    head: [/^.*head$/i, /head_01/i],
    leftShoulder: [/left.*shoulder/i, /shoulder.*l$/i, /clavicle.*l/i, /l_clavicle/i],
    leftUpperArm: [/left.*upper.*arm/i, /left.*arm$/i, /upper.*arm.*l$/i, /l_upperarm/i, /arm_l/i],
    leftLowerArm: [/left.*forearm/i, /left.*lower.*arm/i, /lower.*arm.*l$/i, /forearm.*l$/i, /l_forearm/i],
    leftHand: [/left.*hand$/i, /hand.*l$/i, /l_hand/i, /wrist.*l/i],
    rightShoulder: [/right.*shoulder/i, /shoulder.*r$/i, /clavicle.*r/i, /r_clavicle/i],
    rightUpperArm: [/right.*upper.*arm/i, /right.*arm$/i, /upper.*arm.*r$/i, /r_upperarm/i, /arm_r/i],
    rightLowerArm: [/right.*forearm/i, /right.*lower.*arm/i, /lower.*arm.*r$/i, /forearm.*r$/i, /r_forearm/i],
    rightHand: [/right.*hand$/i, /hand.*r$/i, /r_hand/i, /wrist.*r/i],
    leftUpperLeg: [/left.*up.*leg/i, /left.*thigh/i, /thigh.*l$/i, /upper.*leg.*l$/i, /l_thigh/i],
    leftLowerLeg: [/left.*leg$/i, /left.*shin/i, /left.*calf/i, /lower.*leg.*l$/i, /shin.*l$/i, /l_calf/i],
    leftFoot: [/left.*foot$/i, /foot.*l$/i, /l_foot/i, /ankle.*l/i],
    rightUpperLeg: [/right.*up.*leg/i, /right.*thigh/i, /thigh.*r$/i, /upper.*leg.*r$/i, /r_thigh/i],
    rightLowerLeg: [/right.*leg$/i, /right.*shin/i, /right.*calf/i, /lower.*leg.*r$/i, /shin.*r$/i, /r_calf/i],
    rightFoot: [/right.*foot$/i, /foot.*r$/i, /r_foot/i, /ankle.*r$/i],
  };

  const sides: Array<{ prefix: 'left' | 'right'; sideRx: string; endRx: string }> = [
    { prefix: 'left', sideRx: '(left|l_|l\\.)', endRx: '(\\.l|_l)$' },
    { prefix: 'right', sideRx: '(right|r_|r\\.)', endRx: '(\\.r|_r)$' },
  ];

  const fingers: Array<{ cap: string; aliases: string }> = [
    { cap: 'Thumb', aliases: 'thumb' },
    { cap: 'Index', aliases: 'index' },
    { cap: 'Middle', aliases: 'middle' },
    { cap: 'Ring', aliases: 'ring' },
    { cap: 'Little', aliases: '(little|pinky)' },
  ];

  const segments: Array<{ seg: 'Proximal' | 'Intermediate' | 'Distal'; num: string; alt: string }> = [
    { seg: 'Proximal', num: '(1|01)', alt: '(proximal|metacarpal)' },
    { seg: 'Intermediate', num: '(2|02)', alt: '(intermediate|middle)' },
    { seg: 'Distal', num: '(3|03)', alt: '(distal|tip)' },
  ];

  for (const s of sides) {
    for (const f of fingers) {
      for (const seg of segments) {
        const key = `${s.prefix}${f.cap}${seg.seg}` as VrmBoneName;
        base[key] = [
          new RegExp(`${s.sideRx}.*${f.aliases}.*${seg.alt}`, 'i'),
          new RegExp(`${s.sideRx}.*${f.aliases}[^0-9]*${seg.num}(?!\\d)`, 'i'),
          new RegExp(`${f.aliases}.*${seg.alt}.*${s.endRx}`, 'i'),
          new RegExp(`${f.aliases}[^0-9]*${seg.num}.*${s.endRx}`, 'i'),
        ];
      }
    }
  }

  return base as Record<VrmBoneName, RegExp[]>;
}

const GLB_BONE_PATTERNS = buildGlbBonePatterns();

function matchGlbHumanoidBones(
  root: THREE.Object3D
): Partial<Record<VrmBoneName, THREE.Object3D>> {
  const allBones: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone || obj.type === 'Bone') {
      allBones.push(obj);
    }
  });

  const mapped: Partial<Record<VrmBoneName, THREE.Object3D>> = {};
  const used = new Set<THREE.Object3D>();

  for (const vrmName of ALL_VRM_BONES) {
    const exact = allBones.find((b) => !used.has(b) && b.name === vrmName);
    if (exact) {
      mapped[vrmName] = exact;
      used.add(exact);
      continue;
    }
    const regexList = GLB_BONE_PATTERNS[vrmName];
    if (!regexList) continue;
    for (const rx of regexList) {
      const found = allBones.find((b) => !used.has(b) && rx.test(b.name));
      if (found) {
        mapped[vrmName] = found;
        used.add(found);
        break;
      }
    }
  }
  return mapped;
}

function extractVrmHumanoidBones(
  vrm: any
): Partial<Record<VrmBoneName, THREE.Object3D>> {
  const bones: Partial<Record<VrmBoneName, THREE.Object3D>> = {};
  const getNode = (name: string): THREE.Object3D | null =>
    vrm.humanoid?.getNormalizedBoneNode?.(name) ??
    vrm.humanoid?.getRawBoneNode?.(name) ??
    null;

  for (const boneName of BODY_VRM_BONES) {
    const node = getNode(boneName);
    if (node) bones[boneName] = node;
  }

  for (const side of ['left', 'right'] as const) {
    const tMeta = getNode(`${side}ThumbMetacarpal`);
    const tProx = getNode(`${side}ThumbProximal`);
    const tInter = getNode(`${side}ThumbIntermediate`);
    const tDist = getNode(`${side}ThumbDistal`);

    if (tMeta && tProx && !tInter) {
      bones[`${side}ThumbProximal` as VrmBoneName] = tMeta;
      bones[`${side}ThumbIntermediate` as VrmBoneName] = tProx;
    } else {
      if (tProx) bones[`${side}ThumbProximal` as VrmBoneName] = tProx;
      if (tInter) bones[`${side}ThumbIntermediate` as VrmBoneName] = tInter;
    }
    if (tDist) bones[`${side}ThumbDistal` as VrmBoneName] = tDist;

    for (const f of ['Index', 'Middle', 'Ring', 'Little'] as const) {
      for (const seg of ['Proximal', 'Intermediate', 'Distal'] as const) {
        const key = `${side}${f}${seg}` as VrmBoneName;
        const node = getNode(key);
        if (node) bones[key] = node;
      }
    }
  }

  return bones;
}

/**
 * Loads ANY `.vrm` or `.glb` humanoid:
 * 1. Normalizes scale to ~1.70m standard studio height and aligns feet at y=0.
 * 2. Maps skeleton bones (19 body + 30 fingers) via VRM metadata or fuzzy matching.
 * 3. Stores bind-pose `basePositions` and computes smooth vertex normals.
 * 4. Runs the Universal Runtime Morph Target Generator so every imported model gains
 *    Gaussian-falloff sculpting & dynamic gravity morph targets (preserving native blendshapes).
 */
export async function loadVrmOrGlbFromUrl(url: string): Promise<RiggedMannequinHandle> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm ?? null;

  const root = new THREE.Group();
  let isVrm0 = false;
  let sourceType: ModelSourceType = 'glb';
  let bones: Partial<Record<VrmBoneName, THREE.Object3D>> = {};
  let modelContainer: THREE.Object3D;

  if (vrm) {
    sourceType = 'vrm';
    isVrm0 = vrm.meta?.metaVersion === '0';
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.removeUnnecessaryJoints(gltf.scene);
    if (isVrm0) {
      VRMUtils.rotateVRM0(vrm);
    }
    modelContainer = vrm.scene;
    root.add(modelContainer);
    bones = extractVrmHumanoidBones(vrm);
  } else {
    sourceType = 'glb';
    modelContainer = gltf.scene;
    root.add(modelContainer);
    bones = matchGlbHumanoidBones(gltf.scene);
  }

  root.updateMatrixWorld(true);

  // Normalize height to ~1.70m standard studio scale & ground feet at y = 0
  const rawBox = new THREE.Box3().setFromObject(root);
  const rawHeight = rawBox.max.y - rawBox.min.y;
  if (isFinite(rawHeight) && rawHeight > 0.05) {
    const scaleFactor = STANDARD_IMPORT_HEIGHT_M / rawHeight;
    if (Math.abs(scaleFactor - 1) > 0.03) {
      modelContainer.scale.multiplyScalar(scaleFactor);
      root.updateMatrixWorld(true);
    }
  }

  const normBox = new THREE.Box3().setFromObject(root);
  if (isFinite(normBox.min.y) && Math.abs(normBox.min.y) > 0.001) {
    modelContainer.position.y -= normBox.min.y;
    root.updateMatrixWorld(true);
  }

  // Collect meshes, filter out duplicate Solidify outline shells, preserve bind-pose basePositions,
  // and tag eye/lash detail sub-meshes so their colors are preserved in Clay & Cel modes.
  const meshes: THREE.Mesh[] = [];
  const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const posAttr = mesh.geometry?.getAttribute('position');
      const vertCount = posAttr?.count ?? 0;
      const matSingle = Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material;
      const matName = matSingle?.name ?? '';

      // Detect duplicate Blender/VRM Solidify outline shell primitives on multi-primitive body/head groups
      const siblingCount = mesh.parent ? mesh.parent.children.length : 1;
      if (/outline/i.test(matName) && siblingCount > 1 && vertCount > 1500) {
        mesh.visible = false;
        return;
      }

      if (posAttr) {
        mesh.userData.basePositions = new Float32Array(
          posAttr.array as ArrayLike<number>
        );
      }
      if (mesh.geometry && !mesh.geometry.getAttribute('normal')) {
        mesh.geometry.computeVertexNormals();
      }

      // Flag eye, iris, eyelash, and brow sub-meshes so studio clay preserves their dark/colored contrast
      const nodeName = `${mesh.name} ${mesh.parent?.name ?? ''}`;
      if (
        vertCount < 2500 &&
        (/eye|lash|brow|iris|pupil|circle|cube/i.test(nodeName) ||
          /outline/i.test(matName))
      ) {
        mesh.userData.isFaceFeature = true;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      meshes.push(mesh);
      originalMaterials.set(mesh, mesh.material);
    }
  });

  // Generate Universal Gaussian-Falloff Anatomical & Gravity Morph Targets in bind-pose space
  generateUniversalAnatomicalMorphs(root, bones, meshes);

  // Auto-detect secondary breast/glute spring bones (e.g. oppai.L, oppai.R, hips.SP.L, hips.SP.R)
  // when the VRM has no pre-configured springBoneManager joints
  const springBones: ProceduralSpringBone[] = [];
  const existingVrmJointCount =
    vrm?.springBoneManager?.joints?.size ??
    (vrm?.springBoneManager?.joints
      ? Array.from(vrm.springBoneManager.joints).length
      : 0);

  if (existingVrmJointCount === 0) {
    root.traverse((obj) => {
      if (!(obj as THREE.Bone).isBone && obj.type !== 'Bone') return;
      const b = obj as THREE.Bone;
      if (/^(oppai\.l|oppai\.r|breast\.l|breast\.r|hips\.sp\.l|hips\.sp\.r)$/i.test(b.name)) {
        const isGlute = /hips|glute/i.test(b.name);
        const zDir = isVrm0 ? -1 : 1;
        springBones.push({
          name: b.name,
          bone: b,
          restRotation: b.quaternion.clone(),
          restLocalDir: new THREE.Vector3(0, -0.25, isGlute ? -zDir : zDir).normalize(),
          length: 0.085,
          baseStiffness: isGlute ? 0.68 : 0.52,
          baseGravity: isGlute ? 0.45 : 0.62,
          baseDrag: 0.38,
          maxAngleRad: THREE.MathUtils.degToRad(isGlute ? 14 : 20),
          prevTipWorld: new THREE.Vector3(),
          currTipWorld: new THREE.Vector3(),
          initialized: false,
        });
      }
    });
  }

  // Attach swappable 3D Hair Rig onto imported base-body head bone so Hair Style tab works on imported models too
  let faceAndHairRig = null;
  const rawHeadNode: THREE.Object3D | null =
    vrm?.humanoid?.getRawBoneNode?.('head') ?? bones.head ?? null;
  if (rawHeadNode) {
    const donor = buildProceduralMannequin('anime-female');
    if (donor.faceAndHairRig) {
      faceAndHairRig = donor.faceAndHairRig;
      // Keep procedural face overlay detached/hidden on imported models (they have their own sculpted face/eyes)
      faceAndHairRig.faceGroup.visible = false;
      if (faceAndHairRig.faceGroup.parent) {
        faceAndHairRig.faceGroup.parent.remove(faceAndHairRig.faceGroup);
      }
      // Transplant 7-style 3D hair rig onto the imported head bone
      rawHeadNode.add(faceAndHairRig.hairRootGroup);
      if (isVrm0) {
        faceAndHairRig.hairRootGroup.rotation.y = Math.PI;
      }
      faceAndHairRig.hairRootGroup.position.set(0, 0.016, isVrm0 ? -0.038 : 0.038);
      faceAndHairRig.hairRootGroup.scale.setScalar(1.08);
      for (const hm of faceAndHairRig.hairMeshes) {
        meshes.push(hm);
        originalMaterials.set(hm, hm.material);
      }
      for (const hsb of faceAndHairRig.hairSpringBones) {
        springBones.push(hsb.sb);
      }
    }
  }

  let restHipsY = 0.94;
  if (bones.hips) {
    const wp = new THREE.Vector3();
    bones.hips.getWorldPosition(wp);
    restHipsY = bones.hips.position.y || wp.y || 0.94;
  }

  let footSoleOffset = 0.065;
  if (bones.leftFoot) {
    const fw = new THREE.Vector3();
    bones.leftFoot.getWorldPosition(fw);
    if (fw.y > 0.01 && fw.y < 0.25) {
      footSoleOffset = fw.y;
    }
  }

  const detectedFingerBoneCount = FINGER_BONES.filter((b) => Boolean(bones[b])).length;

  const dispose = () => {
    if (vrm) {
      VRMUtils.deepDispose(vrm.scene);
    } else {
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material?.dispose();
          }
        }
      });
    }
  };

  return {
    root,
    bones,
    restHipsY,
    footSoleOffset,
    meshes,
    originalMaterials,
    springBones,
    faceAndHairRig,
    vrm,
    isVrm0,
    sourceType,
    detectedFingerBoneCount,
    dispose,
  };
}

/**
 * Loads a mannequin archetype from `/public/models/` or falls back to the procedural archetype,
 * ensuring the Universal Anatomical Morph Generator runs on EVERY loaded model.
 */
export async function loadMannequinModel(
  preset: ModelPreset,
  customUrl?: string
): Promise<RiggedMannequinHandle> {
  if (preset === 'custom' && customUrl) {
    return loadVrmOrGlbFromUrl(customUrl);
  }

  const archetype: BuiltInArchetype =
    preset === 'sotai1' ||
    preset === 'realistic-male' ||
    preset === 'realistic-female' ||
    preset === 'anime-male' ||
    preset === 'anime-female'
      ? preset
      : 'realistic-female';

  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const vrmPath = `${normalizedBase}models/${archetype}.vrm`;
  const glbPath = `${normalizedBase}models/${archetype}.glb`;

  if (await checkModelExists(vrmPath)) {
    try {
      return await loadVrmOrGlbFromUrl(vrmPath);
    } catch (err) {
      console.warn(`Failed to load ${vrmPath}, falling back to procedural mannequin:`, err);
    }
  } else if (await checkModelExists(glbPath)) {
    try {
      return await loadVrmOrGlbFromUrl(glbPath);
    } catch (err) {
      console.warn(`Failed to load ${glbPath}, falling back to procedural mannequin:`, err);
    }
  }

  const fallback = buildProceduralMannequin(archetype);
  // Ensure the universal anatomical & gravity morph targets exist uniformly on fallback rigs too
  generateUniversalAnatomicalMorphs(fallback.root, fallback.bones, fallback.meshes);
  return fallback;
}

const UNIVERSAL_LABELS: Record<string, { label: string; category: string; isPhysics?: boolean }> = {
  Bust_Volume: { label: 'Bust Volume / Fullness', category: 'Bust & Upper' },
  Bust_Fullness: { label: 'Bust Fullness (Detail)', category: 'Bust & Upper' },
  Bust_Splay: { label: 'Bust Splay', category: 'Bust & Upper' },
  Glute_Volume: { label: 'Glute Volume & Roundness', category: 'Glutes & Hips' },
  Glute_Drop: { label: 'Glute Weight / Drop', category: 'Glutes & Hips' },
  Hip_Thigh_Width: { label: 'Hip & Thigh Width', category: 'Glutes & Hips' },
  Hip_Width: { label: 'Pelvis Width', category: 'Glutes & Hips' },
  Waist_Taper: { label: 'Waist Taper', category: 'Torso & Muscle' },
  Upper_Muscle: { label: 'Upper Musculature', category: 'Torso & Muscle' },
  Lower_Muscle: { label: 'Lower Musculature', category: 'Torso & Muscle' },
  Shoulder_Width: { label: 'Shoulder Breadth', category: 'Torso & Muscle' },
  Chest_Hang_Forward: {
    label: 'Chest Hang Forward',
    category: 'Physics Driven',
    isPhysics: true,
  },
  Chest_Splay_Back: {
    label: 'Chest Splay Back',
    category: 'Physics Driven',
    isPhysics: true,
  },
  Chest_Standing_Droop: {
    label: 'Chest Standing Droop',
    category: 'Physics Driven',
    isPhysics: true,
  },
  Glute_Gravity_Drop: {
    label: 'Glute Gravity Drop',
    category: 'Physics Driven',
    isPhysics: true,
  },
};

const UNIVERSAL_KEY_SET = new Set<string>(UNIVERSAL_MORPH_KEYS);

/**
 * Inspects morphTargetDictionary across all meshes, cleanly exposing Universal Anatomical
 * sliders alongside any native body/expression blendshapes present on an imported VRM/GLB.
 */
export function extractMorphTargetDescriptors(
  meshes: THREE.Mesh[]
): MorphTargetDescriptor[] {
  const seen = new Set<string>();
  const descriptors: MorphTargetDescriptor[] = [];

  for (const mesh of meshes) {
    const dict = mesh.morphTargetDictionary;
    if (!dict) continue;
    for (const key of Object.keys(dict)) {
      if (seen.has(key)) continue;
      seen.add(key);
      descriptors.push(classifyMorphKey(key));
    }
  }

  // Deduplicate Bust_Fullness if Bust_Volume is already present (both alias on procedural rig)
  const hasUnivBust = seen.has('Bust_Volume');
  const hasUnivHip = seen.has('Hip_Thigh_Width');
  const filtered = descriptors.filter((d) => {
    if (hasUnivBust && d.key === 'Bust_Fullness') return false;
    if (hasUnivHip && d.key === 'Hip_Width') return false;
    return true;
  });

  const catOrder: Record<string, number> = {
    'Bust & Upper': 1,
    'Glutes & Hips': 2,
    'Torso & Muscle': 3,
    'Native Body Blendshapes': 4,
    'Expressions': 5,
    'Physics Driven': 99,
  };

  filtered.sort((a, b) => {
    const oa = catOrder[a.category] ?? 50;
    const ob = catOrder[b.category] ?? 50;
    if (oa !== ob) return oa - ob;
    if (a.isUniversal !== b.isUniversal) return a.isUniversal ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return filtered;
}

function prettifyMorphLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function classifyMorphKey(key: string): MorphTargetDescriptor {
  const meta = UNIVERSAL_LABELS[key];
  if (meta) {
    return {
      key,
      label: meta.label,
      category: meta.category,
      isPhysicsDriven: Boolean(meta.isPhysics),
      isUniversal: UNIVERSAL_KEY_SET.has(key),
    };
  }

  const lower = key.toLowerCase();
  if (
    lower.includes('hang_forward') ||
    lower.includes('splay_back') ||
    lower.includes('standing_droop') ||
    lower.includes('gravity_drop')
  ) {
    return {
      key,
      label: prettifyMorphLabel(key),
      category: 'Physics Driven',
      isPhysicsDriven: true,
    };
  }

  if (
    /^(fcl_|blend_|eye|brow|mouth|blink|joy|angry|sorrow|fun|surprised|aa|ih|ou|ee|oh|happy|sad|viseme)/i.test(
      key
    )
  ) {
    return {
      key,
      label: prettifyMorphLabel(key),
      category: 'Expressions',
    };
  }

  return {
    key,
    label: prettifyMorphLabel(key),
    category: 'Native Body Blendshapes',
  };
}

export function createCelGradientTexture(threshold: number): THREE.DataTexture {
  const width = 64;
  const data = new Uint8Array(width * 4);
  const cutoff = Math.max(4, Math.min(width - 4, Math.round(threshold * width)));
  const midCutoff = Math.min(width - 1, cutoff + 10);

  for (let i = 0; i < width; i++) {
    let val = 248;
    if (i < cutoff) {
      val = 112;
    } else if (i < midCutoff) {
      val = 210;
    } else {
      val = 250;
    }
    data[i * 4] = val;
    data[i * 4 + 1] = val;
    data[i * 4 + 2] = val;
    data[i * 4 + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function applyMaterialStyle(
  handle: RiggedMannequinHandle,
  mode: MaterialMode,
  celThreshold: number,
  tintHex?: string
): () => void {
  const createdMaterials: THREE.Material[] = [];
  let celTexture: THREE.DataTexture | null = null;

  if (mode === 'cel') {
    celTexture = createCelGradientTexture(celThreshold);
  }

  const mainColor = tintHex ?? '#cccbd0';
  const jointColor = '#aeacb6';
  const isImported = handle.sourceType !== 'procedural';

  for (const mesh of handle.meshes) {
    const isJoint = Boolean(mesh.userData.isJointAccent);
    const isFace = Boolean(mesh.userData.isFaceFeature);
    const isHair = Boolean(mesh.userData.isHairMesh);
    const orig = handle.originalMaterials.get(mesh);

    let baseHex = isJoint ? jointColor : mainColor;
    let origMap: THREE.Texture | null = null;
    const origSingle = Array.isArray(orig) ? orig[0] : orig;

    if (origSingle && 'color' in origSingle && (origSingle as THREE.MeshStandardMaterial).color) {
      const c = (origSingle as THREE.MeshStandardMaterial).color;
      if (isFace || isHair || (!isImported && c.r < 0.65)) {
        baseHex = `#${c.getHexString()}`;
      }
    }
    if (origSingle && 'map' in origSingle && (origSingle as THREE.MeshStandardMaterial).map) {
      origMap = (origSingle as THREE.MeshStandardMaterial).map;
    }

    if (mode === 'clay') {
      const mat = new THREE.MeshStandardMaterial({
        color: baseHex,
        map: isFace ? origMap : null,
        roughness: isFace ? 0.35 : isJoint ? 0.7 : 0.76,
        metalness: 0.02,
        flatShading: false,
      });
      mesh.material = mat;
      createdMaterials.push(mat);
    } else {
      const mat = new THREE.MeshToonMaterial({
        color: origMap && !isHair && !isFace ? '#ffffff' : baseHex,
        map: origMap,
        gradientMap: celTexture,
      });
      mesh.material = mat;
      createdMaterials.push(mat);
    }
  }

  return () => {
    createdMaterials.forEach((m) => m.dispose());
    celTexture?.dispose();
  };
}
