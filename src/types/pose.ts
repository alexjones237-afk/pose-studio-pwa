export type BodyBoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot';

export type LeftFingerBoneName =
  | 'leftThumbProximal'
  | 'leftThumbIntermediate'
  | 'leftThumbDistal'
  | 'leftIndexProximal'
  | 'leftIndexIntermediate'
  | 'leftIndexDistal'
  | 'leftMiddleProximal'
  | 'leftMiddleIntermediate'
  | 'leftMiddleDistal'
  | 'leftRingProximal'
  | 'leftRingIntermediate'
  | 'leftRingDistal'
  | 'leftLittleProximal'
  | 'leftLittleIntermediate'
  | 'leftLittleDistal';

export type RightFingerBoneName =
  | 'rightThumbProximal'
  | 'rightThumbIntermediate'
  | 'rightThumbDistal'
  | 'rightIndexProximal'
  | 'rightIndexIntermediate'
  | 'rightIndexDistal'
  | 'rightMiddleProximal'
  | 'rightMiddleIntermediate'
  | 'rightMiddleDistal'
  | 'rightRingProximal'
  | 'rightRingIntermediate'
  | 'rightRingDistal'
  | 'rightLittleProximal'
  | 'rightLittleIntermediate'
  | 'rightLittleDistal';

export type FingerBoneName = LeftFingerBoneName | RightFingerBoneName;
export type VrmBoneName = BodyBoneName | FingerBoneName;

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'little';
export type HandSide = 'left' | 'right';
export type HandPresetName =
  | 'relaxed'
  | 'fist'
  | 'open'
  | 'point'
  | 'cylinderWrap'
  | 'sphereHold'
  | 'pinch'
  | 'flatCarry';

export interface HandPoseControls {
  thumb: number; // 0..1 curl
  index: number;
  middle: number;
  ring: number;
  little: number;
  spread: number; // -0.2..1 spread
}

export const LEFT_FINGER_BONES: LeftFingerBoneName[] = [
  'leftThumbProximal',
  'leftThumbIntermediate',
  'leftThumbDistal',
  'leftIndexProximal',
  'leftIndexIntermediate',
  'leftIndexDistal',
  'leftMiddleProximal',
  'leftMiddleIntermediate',
  'leftMiddleDistal',
  'leftRingProximal',
  'leftRingIntermediate',
  'leftRingDistal',
  'leftLittleProximal',
  'leftLittleIntermediate',
  'leftLittleDistal',
];

export const RIGHT_FINGER_BONES: RightFingerBoneName[] = [
  'rightThumbProximal',
  'rightThumbIntermediate',
  'rightThumbDistal',
  'rightIndexProximal',
  'rightIndexIntermediate',
  'rightIndexDistal',
  'rightMiddleProximal',
  'rightMiddleIntermediate',
  'rightMiddleDistal',
  'rightRingProximal',
  'rightRingIntermediate',
  'rightRingDistal',
  'rightLittleProximal',
  'rightLittleIntermediate',
  'rightLittleDistal',
];

export const FINGER_BONES: FingerBoneName[] = [
  ...LEFT_FINGER_BONES,
  ...RIGHT_FINGER_BONES,
];

export const MAJOR_JOINTS: BodyBoneName[] = [
  'head',
  'neck',
  'chest',
  'spine',
  'hips',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
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

export const JOINT_LABELS: Record<BodyBoneName, string> = {
  hips: 'Hips (Root)',
  spine: 'Spine',
  chest: 'Chest',
  neck: 'Neck',
  head: 'Head',
  leftShoulder: 'L. Collar',
  leftUpperArm: 'L. Shoulder',
  leftLowerArm: 'L. Elbow',
  leftHand: 'L. Wrist',
  rightShoulder: 'R. Collar',
  rightUpperArm: 'R. Shoulder',
  rightLowerArm: 'R. Elbow',
  rightHand: 'R. Wrist',
  leftUpperLeg: 'L. Hip',
  leftLowerLeg: 'L. Knee',
  leftFoot: 'L. Ankle',
  rightUpperLeg: 'R. Hip',
  rightLowerLeg: 'R. Knee',
  rightFoot: 'R. Ankle',
};

export type Vec3Tuple = [number, number, number];

export type BoneRotationsMap = Partial<Record<VrmBoneName, Vec3Tuple>>;

export type PoseCategory =
  | 'Standing'
  | 'Action'
  | 'Seated'
  | 'Ground / All-Fours'
  | 'Custom';

export interface PoseDefinition {
  id: string;
  name: string;
  category: PoseCategory;
  description?: string;
  hipsPosition: Vec3Tuple;
  bones: BoneRotationsMap;
  morphs?: Record<string, number>;
  isCustom?: boolean;
}

export type ArchetypeBodyPreset =
  | 'default'
  | 'athletic'
  | 'curvy'
  | 'slender'
  | 'heroic';

export type BuiltInArchetype =
  | 'sotai1'
  | 'realistic-male'
  | 'realistic-female'
  | 'anime-male'
  | 'anime-female';

export type ModelPreset = BuiltInArchetype | 'custom';

export type ModelSourceType = 'vrm' | 'glb' | 'procedural';

export type MaterialMode = 'clay' | 'cel';

export type IKHandleType =
  | 'leftHand'
  | 'rightHand'
  | 'leftFoot'
  | 'rightFoot'
  | 'hips'
  | 'head';

export interface MorphTargetDescriptor {
  key: string;
  label: string;
  category: string;
  isPhysicsDriven?: boolean;
  isUniversal?: boolean;
}

export interface PhysicsSettings {
  enabled: boolean;
  weight: number; // 0..1 Gravity Pull & Droop scale
  floppiness: number; // 0..1 Inverse Stiffness
  damping: number; // 0..1 Velocity Damping
}

export interface PhysicsTelemetry {
  chestTiltDeg: number;
  hipsTiltDeg: number;
  hangForward: number;
  splayBack: number;
  standingDroop: number;
  gluteGravity: number;
  springBoneCount: number;
}

// --- Facial Features & Expressions ---
export type ExpressionPresetName =
  | 'neutral'
  | 'smile'
  | 'angry'
  | 'surprised'
  | 'sad'
  | 'wink'
  | 'focused';

export interface FaceSettings {
  showFeatures: boolean;
  expressionPreset: ExpressionPresetName;
  eyeGazeX: number; // -1..1 (Left..Right)
  eyeGazeY: number; // -1..1 (Down..Up)
  blinkLeft: number; // 0..1
  blinkRight: number; // 0..1
  irisScale: number; // 0.6..1.4
  browHeight: number; // -1..1
  browAngle: number; // -1..1 (-1 worried/sad, +1 fierce/angry)
  mouthSmile: number; // -1..1 (-1 frown, +1 smile)
  mouthOpen: number; // 0..1
}

// --- Hair Styles & Manipulation ---
export type HairStyleId =
  | 'ponytail'
  | 'bob'
  | 'twintails'
  | 'short-crop'
  | 'long-flowing'
  | 'swept-bangs'
  | 'bald';

export interface HairSettings {
  style: HairStyleId;
  length: number; // 0.5..1.6
  bangsLength: number; // 0.4..1.5
  volume: number; // 0.7..1.45
  windPitch: number; // -60..60 degrees (back/forward billow)
  windSway: number; // -60..60 degrees (left/right wind sway)
  color: string;
}

export interface CharacterState {
  id: string;
  label: string;
  modelPreset: ModelPreset;
  modelSourceType: ModelSourceType;
  detectedFingerBoneCount: number;
  customModelUrl?: string;
  customModelName?: string;
  stagePosition: Vec3Tuple;
  stageRotation: Vec3Tuple; // Euler degrees [x, y, z] for whole-model rotation
  stageRotationY: number;
  hipsPosition: Vec3Tuple;
  bones: BoneRotationsMap;
  morphs: Record<string, number>; // 0..1
  availableMorphs: MorphTargetDescriptor[];
  physics: PhysicsSettings;
  face: FaceSettings;
  hair: HairSettings;
  pinFeetToFloor: boolean;
  activePoseId: string | null;
  poseVersion: number;
}

export type WholeModelGizmoMode = 'none' | 'rotate' | 'translate';

// --- Props, Hierarchical Parenting & Surface Interaction ---
export type PropPrimitiveType =
  | 'box'
  | 'cylinder'
  | 'chair'
  | 'couch'
  | 'table'
  | 'steps'
  | 'custom-glb';

export type PropAttachTarget =
  | 'none'
  | 'rightHand'
  | 'leftHand'
  | 'rightLowerArm'
  | 'leftLowerArm'
  | 'head'
  | 'chest'
  | 'hips'
  | 'rightFoot'
  | 'leftFoot'
  | 'character-root';

export interface PropItem {
  id: string;
  name: string;
  kind: PropPrimitiveType;
  customUrl?: string;
  position: Vec3Tuple; // world pos when unattached, local offset when attached to bone/prop
  rotation: Vec3Tuple; // Euler degrees [x, y, z]
  dimensions: Vec3Tuple; // [width, height, depth] in meters
  color: string;
  attachedCharacterId: string | null;
  attachedBone: PropAttachTarget;
  parentPropId: string | null; // allows parenting a prop to another prop (e.g. Cup on Table)
  gripTightness?: number; // 0..1 adaptive finger wrap tightness when attached to a hand
}

export type SurfaceSnapMode = 'feet' | 'hips';

export type CameraPreset = 'front' | 'threeQuarter' | 'side' | 'lowAngle' | 'topDown';

export interface LightingSettings {
  keyIntensity: number;
  keyAzimuth: number;
  keyElevation: number;
  rimIntensity: number;
  rimAzimuth: number;
  rimColor: string;
  fillIntensity: number;
}

export type ActiveTab =
  | 'models'
  | 'poses'
  | 'pose-ik'
  | 'props'
  | 'body'
  | 'physics'
  | 'light-cam';

export type DrawerHeight = 'collapsed' | 'half' | 'expanded';

export interface HistorySnapshot {
  characters: Array<{
    id: string;
    hipsPosition: Vec3Tuple;
    bones: BoneRotationsMap;
    stagePosition: Vec3Tuple;
    stageRotation: Vec3Tuple;
    stageRotationY: number;
  }>;
}

export interface ExportedSceneData {
  version: 2;
  savedAt: string;
  materialMode: MaterialMode;
  celThreshold: number;
  focalLength: number;
  lighting: LightingSettings;
  characters: Array<{
    id: string;
    label: string;
    modelPreset: ModelPreset;
    stagePosition: Vec3Tuple;
    stageRotation?: Vec3Tuple;
    stageRotationY: number;
    hipsPosition: Vec3Tuple;
    bones: BoneRotationsMap;
    morphs: Record<string, number>;
    physics: PhysicsSettings;
    face?: FaceSettings;
    hair?: HairSettings;
    pinFeetToFloor: boolean;
  }>;
  props?: Array<Omit<PropItem, 'customUrl'>>;
}
