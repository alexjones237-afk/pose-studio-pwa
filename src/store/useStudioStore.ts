import { create } from 'zustand';
import starterPosesRaw from '../data/poses.json';
import {
  ActiveTab,
  ArchetypeBodyPreset,
  BodyBoneName,
  BoneRotationsMap,
  CameraPreset,
  CharacterState,
  DrawerHeight,
  ExportedSceneData,
  ExpressionPresetName,
  FaceSettings,
  HairSettings,
  HandPoseControls,
  HandPresetName,
  HandSide,
  HistorySnapshot,
  IKHandleType,
  LightingSettings,
  MaterialMode,
  ModelPreset,
  ModelSourceType,
  MorphTargetDescriptor,
  PhysicsSettings,
  PhysicsTelemetry,
  PoseDefinition,
  PropAttachTarget,
  PropItem,
  PropPrimitiveType,
  SurfaceSnapMode,
  Vec3Tuple,
  VrmBoneName,
  WholeModelGizmoMode,
} from '../types/pose';
import { MirrorDirection, mirrorPoseBones } from '../engine/poseUtils';
import {
  buildAdaptiveObjectWrapBones,
  buildHandBoneRotations,
  computeSmartBoneSnapTransform,
  HAND_PRESETS,
} from '../engine/fingerUtils';
import { EXPRESSION_PRESETS } from '../engine/faceAndHairEngine';

const CUSTOM_POSES_STORAGE_KEY = 'poselab_custom_poses_v1';
const MAX_HISTORY = 40;

const STARTER_POSES = starterPosesRaw as PoseDefinition[];

function loadCustomPoses(): PoseDefinition[] {
  try {
    const raw = localStorage.getItem(CUSTOM_POSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({ ...p, category: 'Custom', isCustom: true }));
  } catch {
    return [];
  }
}

function persistCustomPoses(customPoses: PoseDefinition[]) {
  try {
    localStorage.setItem(CUSTOM_POSES_STORAGE_KEY, JSON.stringify(customPoses));
  } catch (err) {
    console.warn('Could not persist custom poses to localStorage:', err);
  }
}

function cloneBones(bones: BoneRotationsMap): BoneRotationsMap {
  const out: BoneRotationsMap = {};
  for (const [k, v] of Object.entries(bones)) {
    if (v) out[k as VrmBoneName] = [v[0], v[1], v[2]];
  }
  return out;
}

function getDefaultMorphsForPreset(preset: ModelPreset): Record<string, number> {
  if (preset === 'anime-female' || preset === 'realistic-female') {
    return {
      Bust_Volume: preset === 'anime-female' ? 0.35 : 0.28,
      Glute_Volume: 0.26,
      Glute_Drop: 0.1,
      Hip_Thigh_Width: 0.18,
      Waist_Taper: preset === 'anime-female' ? 0.28 : 0.2,
      Upper_Muscle: 0.08,
      Lower_Muscle: 0.12,
    };
  }
  if (preset === 'anime-male' || preset === 'realistic-male') {
    return {
      Bust_Volume: 0.0,
      Glute_Volume: 0.16,
      Glute_Drop: 0.04,
      Hip_Thigh_Width: 0.08,
      Waist_Taper: 0.12,
      Upper_Muscle: preset === 'realistic-male' ? 0.42 : 0.32,
      Lower_Muscle: preset === 'realistic-male' ? 0.36 : 0.26,
    };
  }
  return {
    Bust_Volume: 0,
    Glute_Volume: 0,
    Glute_Drop: 0,
    Hip_Thigh_Width: 0,
    Waist_Taper: 0,
    Upper_Muscle: 0,
    Lower_Muscle: 0,
  };
}

function getDefaultFaceSettings(): FaceSettings {
  return {
    showFeatures: true,
    expressionPreset: 'neutral',
    eyeGazeX: 0,
    eyeGazeY: 0,
    blinkLeft: 0,
    blinkRight: 0,
    irisScale: 1.0,
    browHeight: 0,
    browAngle: 0,
    mouthSmile: 0.12,
    mouthOpen: 0,
  };
}

function getDefaultHairSettings(preset: ModelPreset): HairSettings {
  const isMale = preset === 'realistic-male' || preset === 'anime-male';
  const style =
    preset === 'sotai1' ? 'bald' : isMale ? 'short-crop' : 'ponytail';
  return {
    style,
    length: 1.0,
    bangsLength: 1.0,
    volume: 1.0,
    windPitch: 0,
    windSway: 0,
    color: isMale ? '#6a6c7a' : '#7f7d8e',
  };
}

function createInitialCharacter(
  id: string,
  label: string,
  modelPreset: ModelPreset,
  stagePosition: Vec3Tuple,
  stageRotationY: number,
  initialPoseId: string
): CharacterState {
  const pose =
    STARTER_POSES.find((p) => p.id === initialPoseId) ?? STARTER_POSES[0];
  return {
    id,
    label,
    modelPreset,
    modelSourceType: 'procedural',
    detectedFingerBoneCount: 30,
    stagePosition,
    stageRotation: [0, stageRotationY, 0],
    stageRotationY,
    hipsPosition: [...pose.hipsPosition] as Vec3Tuple,
    bones: cloneBones(pose.bones),
    morphs: getDefaultMorphsForPreset(modelPreset),
    availableMorphs: [],
    physics: {
      enabled: true,
      weight: 0.62,
      floppiness: 0.48,
      damping: 0.42,
    },
    face: getDefaultFaceSettings(),
    hair: getDefaultHairSettings(modelPreset),
    pinFeetToFloor: false,
    activePoseId: pose.id,
    poseVersion: 1,
  };
}

function createSnapshot(characters: CharacterState[]): HistorySnapshot {
  return {
    characters: characters.map((c) => ({
      id: c.id,
      hipsPosition: [...c.hipsPosition] as Vec3Tuple,
      bones: cloneBones(c.bones),
      stagePosition: [...c.stagePosition] as Vec3Tuple,
      stageRotation: [...c.stageRotation] as Vec3Tuple,
      stageRotationY: c.stageRotationY,
    })),
  };
}

const PROP_DEFAULTS: Record<
  Exclude<PropPrimitiveType, 'custom-glb'>,
  { name: string; dimensions: Vec3Tuple; position: Vec3Tuple; color: string }
> = {
  box: {
    name: 'Studio Box',
    dimensions: [0.45, 0.45, 0.45],
    position: [0.55, 0, 0],
    color: '#3f4152',
  },
  cylinder: {
    name: 'Cylinder / Staff',
    dimensions: [0.06, 0.56, 0.06],
    position: [0.48, 0, 0.15],
    color: '#525770',
  },
  chair: {
    name: 'Studio Chair',
    dimensions: [0.5, 0.92, 0.52],
    position: [0, 0, -0.06],
    color: '#3c4054',
  },
  couch: {
    name: 'Studio Couch',
    dimensions: [1.55, 0.84, 0.82],
    position: [0, 0, -0.14],
    color: '#393d50',
  },
  table: {
    name: 'Studio Table',
    dimensions: [1.15, 0.76, 0.65],
    position: [0, 0, 0.62],
    color: '#434659',
  },
  steps: {
    name: 'Studio Steps',
    dimensions: [1.05, 0.6, 0.96],
    position: [0, 0, 0.15],
    color: '#3e4254',
  },
};

const initialChar1 = createInitialCharacter(
  'char-1',
  'Figure A',
  'realistic-female',
  [0, 0, 0],
  0,
  'classic-contrapposto'
);

interface StudioStore {
  characters: CharacterState[];
  activeCharacterId: string;

  // Selection & Gizmo
  selectedBone: BodyBoneName | null;
  selectedIKHandle: IKHandleType | null;
  wholeModelGizmoMode: WholeModelGizmoMode;
  showJointMarkers: boolean;
  showIKHandles: boolean;
  isDraggingControl: boolean;

  // Props & Surface Snapping
  props: PropItem[];
  selectedPropId: string | null;
  propGizmoMode: 'translate' | 'rotate';
  surfaceSnapRequest: { charId: string; mode: SurfaceSnapMode; nonce: number } | null;

  // Poses
  starterPoses: PoseDefinition[];
  customPoses: PoseDefinition[];

  // Material & Environment
  materialMode: MaterialMode;
  celThreshold: number;
  focalLength: number;
  cameraPresetRequest: { preset: CameraPreset; nonce: number } | null;
  lighting: LightingSettings;
  showGrid: boolean;
  showFloor: boolean;

  // Physics telemetry & impulse
  physicsImpulseNonce: number;
  telemetryByChar: Record<string, PhysicsTelemetry>;

  // Export
  exportRequest: { transparent: boolean; nonce: number } | null;
  isExporting: boolean;

  // UI Navigation
  activeTab: ActiveTab;
  drawerHeight: DrawerHeight;
  toastMessage: string | null;

  // Undo / Redo
  history: HistorySnapshot[];
  historyIndex: number;

  // Actions
  setActiveCharacter: (id: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setDrawerHeight: (h: DrawerHeight) => void;
  showToast: (msg: string) => void;

  selectBone: (bone: BodyBoneName | null) => void;
  selectIKHandle: (handle: IKHandleType | null) => void;
  setWholeModelGizmoMode: (mode: WholeModelGizmoMode) => void;
  setShowJointMarkers: (v: boolean) => void;
  setShowIKHandles: (v: boolean) => void;
  setIsDraggingControl: (v: boolean) => void;

  // Model actions
  setCharacterModelPreset: (
    charId: string,
    preset: ModelPreset,
    customUrl?: string,
    customName?: string
  ) => void;
  setCharacterModelMeta: (
    charId: string,
    sourceType: ModelSourceType,
    detectedFingerBoneCount: number
  ) => void;
  spawnSecondCharacter: () => void;
  removeSecondCharacter: () => void;
  setCharacterStageTransform: (
    charId: string,
    position: Vec3Tuple,
    rotationY: number,
    rotationEuler?: Vec3Tuple
  ) => void;
  nudgeCharacterYaw: (charId: string, deltaDeg: number) => void;

  // Posing, Fingers & IK actions
  updateCharacterBones: (
    charId: string,
    bonesDelta: BoneRotationsMap,
    hipsPosition?: Vec3Tuple
  ) => void;
  applyHandControls: (
    charId: string,
    side: HandSide,
    controls: HandPoseControls,
    commitHistory?: boolean
  ) => void;
  applyHandPreset: (charId: string, side: HandSide, preset: HandPresetName) => void;
  applyPose: (charId: string, poseId: string) => void;
  mirrorActivePose: (direction: MirrorDirection) => void;
  resetActivePose: () => void;
  togglePinFeetToFloor: (charId: string) => void;
  saveCustomPose: (name: string) => void;
  deleteCustomPose: (poseId: string) => void;

  // Props, Hierarchical Parenting, Smart Snapping & Adaptive Hand Wrap
  addPrimitiveProp: (kind: Exclude<PropPrimitiveType, 'custom-glb'>) => void;
  addCustomGlbProp: (name: string, url: string) => void;
  selectProp: (propId: string | null) => void;
  setPropGizmoMode: (mode: 'translate' | 'rotate') => void;
  updateProp: (propId: string, partial: Partial<PropItem>) => void;
  removeProp: (propId: string) => void;
  attachPropToBone: (
    propId: string,
    charId: string | null,
    bone: PropAttachTarget,
    autoWrapHand?: boolean
  ) => void;
  parentPropToProp: (
    childPropId: string,
    parentPropId: string | null,
    snapOnTop?: boolean
  ) => void;
  wrapHandAroundProp: (propId: string, tightness?: number) => void;
  requestSurfaceSnap: (charId: string, mode: SurfaceSnapMode) => void;
  clearSurfaceSnapRequest: () => void;

  // Morphs, Face & Hair
  setAvailableMorphs: (charId: string, morphs: MorphTargetDescriptor[]) => void;
  setMorphValue: (charId: string, key: string, value: number) => void;
  resetMorphs: (charId: string) => void;
  applyBodyPreset: (charId: string, preset: ArchetypeBodyPreset) => void;
  updateFace: (charId: string, partial: Partial<FaceSettings>) => void;
  applyExpressionPreset: (charId: string, preset: ExpressionPresetName) => void;
  updateHair: (charId: string, partial: Partial<HairSettings>) => void;

  // Physics
  updatePhysics: (charId: string, partial: Partial<PhysicsSettings>) => void;
  triggerPhysicsImpulse: () => void;
  setPhysicsTelemetry: (charId: string, telemetry: PhysicsTelemetry) => void;

  // Material, Camera & Lighting
  setMaterialMode: (mode: MaterialMode) => void;
  setCelThreshold: (t: number) => void;
  setFocalLength: (mm: number) => void;
  requestCameraPreset: (preset: CameraPreset) => void;
  updateLighting: (partial: Partial<LightingSettings>) => void;
  setShowGrid: (v: boolean) => void;
  setShowFloor: (v: boolean) => void;

  // Export & Scene JSON
  requestExportPng: (transparent: boolean) => void;
  setIsExporting: (v: boolean) => void;
  clearExportRequest: () => void;
  buildSceneExport: () => ExportedSceneData;
  importSceneData: (data: ExportedSceneData) => void;

  // History
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

let toastTimer: number | null = null;

export const useStudioStore = create<StudioStore>((set, get) => ({
  characters: [initialChar1],
  activeCharacterId: initialChar1.id,

  selectedBone: null,
  selectedIKHandle: null,
  wholeModelGizmoMode: 'none',
  showJointMarkers: true,
  showIKHandles: true,
  isDraggingControl: false,

  props: [],
  selectedPropId: null,
  propGizmoMode: 'translate',
  surfaceSnapRequest: null,

  starterPoses: STARTER_POSES,
  customPoses: loadCustomPoses(),

  materialMode: 'clay',
  celThreshold: 0.46,
  focalLength: 38,
  cameraPresetRequest: null,
  lighting: {
    keyIntensity: 2.35,
    keyAzimuth: 38,
    keyElevation: 48,
    rimIntensity: 1.45,
    rimAzimuth: -145,
    rimColor: '#9db8ff',
    fillIntensity: 0.65,
  },
  showGrid: true,
  showFloor: true,

  physicsImpulseNonce: 0,
  telemetryByChar: {},

  exportRequest: null,
  isExporting: false,

  activeTab: 'poses',
  drawerHeight: 'half',
  toastMessage: null,

  history: [createSnapshot([initialChar1])],
  historyIndex: 0,

  setActiveCharacter: (id) =>
    set({
      activeCharacterId: id,
      selectedBone: null,
      selectedIKHandle: null,
      selectedPropId: null,
    }),

  setActiveTab: (tab) =>
    set((state) => ({
      activeTab: tab,
      drawerHeight: state.drawerHeight === 'collapsed' ? 'half' : state.drawerHeight,
    })),

  setDrawerHeight: (h) => set({ drawerHeight: h }),

  showToast: (msg) => {
    if (toastTimer) window.clearTimeout(toastTimer);
    set({ toastMessage: msg });
    toastTimer = window.setTimeout(() => {
      set({ toastMessage: null });
      toastTimer = null;
    }, 2600);
  },

  selectBone: (bone) =>
    set({
      selectedBone: bone,
      selectedIKHandle: null,
      selectedPropId: null,
      wholeModelGizmoMode: 'none',
    }),

  selectIKHandle: (handle) =>
    set({
      selectedIKHandle: handle,
      selectedBone: null,
      selectedPropId: null,
      wholeModelGizmoMode: 'none',
    }),

  setWholeModelGizmoMode: (mode) =>
    set({
      wholeModelGizmoMode: mode,
      selectedBone: null,
      selectedIKHandle: null,
      selectedPropId: null,
    }),

  setShowJointMarkers: (v) =>
    set((s) => ({
      showJointMarkers: v,
      selectedBone: v ? s.selectedBone : null,
    })),

  setShowIKHandles: (v) =>
    set((s) => ({
      showIKHandles: v,
      selectedIKHandle: v ? s.selectedIKHandle : null,
    })),

  setIsDraggingControl: (v) => set({ isDraggingControl: v }),

  setCharacterModelPreset: (charId, preset, customUrl, customName) =>
    set((state) => ({
      characters: state.characters.map((c) => {
        if (c.id !== charId) return c;
        return {
          ...c,
          modelPreset: preset,
          customModelUrl: preset === 'custom' ? customUrl : undefined,
          customModelName: preset === 'custom' ? customName : undefined,
          availableMorphs: [],
          morphs: getDefaultMorphsForPreset(preset),
          hair: getDefaultHairSettings(preset),
          poseVersion: c.poseVersion + 1,
        };
      }),
    })),

  setCharacterModelMeta: (charId, sourceType, detectedFingerBoneCount) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId
          ? { ...c, modelSourceType: sourceType, detectedFingerBoneCount }
          : c
      ),
    })),

  spawnSecondCharacter: () => {
    const state = get();
    if (state.characters.length >= 2) return;
    const first = state.characters[0];
    const nextPreset: ModelPreset =
      first.modelPreset === 'realistic-female'
        ? 'realistic-male'
        : first.modelPreset === 'realistic-male'
        ? 'realistic-female'
        : first.modelPreset === 'anime-female'
        ? 'anime-male'
        : 'anime-female';

    const shiftedFirst: CharacterState =
      Math.abs(first.stagePosition[0]) < 0.15
        ? {
            ...first,
            stagePosition: [-0.46, first.stagePosition[1], 0],
            stageRotation: [0, 16, 0],
            stageRotationY: 16,
          }
        : first;
    const char2 = createInitialCharacter(
      'char-2',
      'Figure B',
      nextPreset,
      [0.48, 0, 0.08],
      -20,
      'heroic-stance'
    );
    const nextChars = [shiftedFirst, char2];
    set({
      characters: nextChars,
      activeCharacterId: char2.id,
      selectedBone: null,
      selectedIKHandle: null,
      selectedPropId: null,
    });
    get().pushHistory();
    get().showToast('Spawned Figure B for multi-character staging');
  },

  removeSecondCharacter: () => {
    const state = get();
    if (state.characters.length < 2) return;
    const first = {
      ...state.characters[0],
      stagePosition: [0, 0, 0] as Vec3Tuple,
      stageRotation: [0, 0, 0] as Vec3Tuple,
      stageRotationY: 0,
    };
    set({
      characters: [first],
      activeCharacterId: first.id,
      selectedBone: null,
      selectedIKHandle: null,
      props: state.props.map((p) =>
        p.attachedCharacterId === 'char-2'
          ? { ...p, attachedCharacterId: null, attachedBone: 'none' }
          : p
      ),
    });
    get().pushHistory();
    get().showToast('Removed Figure B');
  },

  setCharacterStageTransform: (charId, position, rotationY, rotationEuler) =>
    set((state) => ({
      characters: state.characters.map((c) => {
        if (c.id !== charId) return c;
        const rot: Vec3Tuple = rotationEuler
          ? [rotationEuler[0], rotationEuler[1], rotationEuler[2]]
          : [c.stageRotation[0], rotationY, c.stageRotation[2]];
        return {
          ...c,
          stagePosition: position,
          stageRotation: rot,
          stageRotationY: rot[1],
        };
      }),
    })),

  nudgeCharacterYaw: (charId, deltaDeg) => {
    set((state) => ({
      characters: state.characters.map((c) => {
        if (c.id !== charId) return c;
        let nextY = c.stageRotation[1] + deltaDeg;
        if (nextY > 180) nextY -= 360;
        if (nextY < -180) nextY += 360;
        const rounded = Math.round(nextY);
        return {
          ...c,
          stageRotation: [c.stageRotation[0], rounded, c.stageRotation[2]],
          stageRotationY: rounded,
        };
      }),
    }));
    get().pushHistory();
  },

  updateCharacterBones: (charId, bonesDelta, hipsPosition) =>
    set((state) => ({
      characters: state.characters.map((c) => {
        if (c.id !== charId) return c;
        return {
          ...c,
          bones: { ...c.bones, ...bonesDelta },
          hipsPosition: hipsPosition ? ([...hipsPosition] as Vec3Tuple) : c.hipsPosition,
          activePoseId: null,
        };
      }),
    })),

  applyHandControls: (charId, side, controls, commitHistory = false) => {
    const delta = buildHandBoneRotations(side, controls);
    get().updateCharacterBones(charId, delta);
    if (commitHistory) {
      get().pushHistory();
    }
  },

  applyHandPreset: (charId, side, preset) => {
    const def = HAND_PRESETS[preset];
    if (!def) return;
    const delta = buildHandBoneRotations(side, def.controls);
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId
          ? {
              ...c,
              bones: { ...c.bones, ...delta },
              activePoseId: null,
              poseVersion: c.poseVersion + 1,
            }
          : c
      ),
    }));
    get().pushHistory();
    get().showToast(`${side === 'left' ? 'Left' : 'Right'} hand: ${def.label}`);
  },

  applyPose: (charId, poseId) => {
    const state = get();
    const allPoses = [...state.starterPoses, ...state.customPoses];
    const pose = allPoses.find((p) => p.id === poseId);
    if (!pose) return;
    set({
      characters: state.characters.map((c) =>
        c.id === charId
          ? {
              ...c,
              hipsPosition: [...pose.hipsPosition] as Vec3Tuple,
              bones: cloneBones(pose.bones),
              morphs: pose.morphs ? { ...c.morphs, ...pose.morphs } : c.morphs,
              activePoseId: pose.id,
              poseVersion: c.poseVersion + 1,
            }
          : c
      ),
    });
    get().pushHistory();
  },

  mirrorActivePose: (direction) => {
    const state = get();
    const activeId = state.activeCharacterId;
    set({
      characters: state.characters.map((c) => {
        if (c.id !== activeId) return c;
        const mirrored = mirrorPoseBones(c.bones, direction);
        const mirroredHips: Vec3Tuple =
          direction === 'swap'
            ? [-c.hipsPosition[0], c.hipsPosition[1], c.hipsPosition[2]]
            : [...c.hipsPosition];
        return {
          ...c,
          bones: mirrored,
          hipsPosition: mirroredHips,
          activePoseId: null,
          poseVersion: c.poseVersion + 1,
        };
      }),
    });
    get().pushHistory();
    const label =
      direction === 'left-to-right'
        ? 'Mirrored Left → Right'
        : direction === 'right-to-left'
        ? 'Mirrored Right → Left'
        : 'Mirrored Full Pose';
    get().showToast(label);
  },

  resetActivePose: () => {
    const activeId = get().activeCharacterId;
    get().applyPose(activeId, 'neutral-a-pose');
    get().showToast('Reset to Neutral A-Pose');
  },

  togglePinFeetToFloor: (charId) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId ? { ...c, pinFeetToFloor: !c.pinFeetToFloor } : c
      ),
    })),

  saveCustomPose: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const state = get();
    const activeChar = state.characters.find((c) => c.id === state.activeCharacterId);
    if (!activeChar) return;

    const newPose: PoseDefinition = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      category: 'Custom',
      description: 'Saved custom pose (includes fingers & proportions).',
      hipsPosition: [...activeChar.hipsPosition] as Vec3Tuple,
      bones: cloneBones(activeChar.bones),
      morphs: { ...activeChar.morphs },
      isCustom: true,
    };
    const nextCustom = [newPose, ...state.customPoses];
    persistCustomPoses(nextCustom);
    set({ customPoses: nextCustom });
    get().showToast(`Saved pose "${trimmed}"`);
  },

  deleteCustomPose: (poseId) => {
    const nextCustom = get().customPoses.filter((p) => p.id !== poseId);
    persistCustomPoses(nextCustom);
    set({ customPoses: nextCustom });
    get().showToast('Deleted custom pose');
  },

  // --- Props, Hierarchical Parenting, Smart Palm Snapping & Auto-Wrap ---
  addPrimitiveProp: (kind) => {
    const def = PROP_DEFAULTS[kind];
    const count = get().props.length;
    const item: PropItem = {
      id: `prop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: count > 0 ? `${def.name} ${count + 1}` : def.name,
      kind,
      position: [...def.position] as Vec3Tuple,
      rotation: [0, 0, 0],
      dimensions: [...def.dimensions] as Vec3Tuple,
      color: def.color,
      attachedCharacterId: null,
      attachedBone: 'none',
      parentPropId: null,
      gripTightness: 0.68,
    };
    set((s) => ({
      props: [...s.props, item],
      selectedPropId: item.id,
      selectedBone: null,
      selectedIKHandle: null,
      wholeModelGizmoMode: 'none',
    }));
    get().showToast(`Spawned ${item.name}`);
  },

  addCustomGlbProp: (name, url) => {
    const cleanName = name.replace(/\.(glb|gltf)$/i, '');
    const item: PropItem = {
      id: `prop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: cleanName || 'Custom Prop',
      kind: 'custom-glb',
      customUrl: url,
      position: [0.45, 0, 0.2],
      rotation: [0, 0, 0],
      dimensions: [0.35, 0.35, 0.35],
      color: '#6b7280',
      attachedCharacterId: null,
      attachedBone: 'none',
      parentPropId: null,
      gripTightness: 0.68,
    };
    set((s) => ({
      props: [...s.props, item],
      selectedPropId: item.id,
      selectedBone: null,
      selectedIKHandle: null,
      wholeModelGizmoMode: 'none',
    }));
    get().showToast(`Imported prop "${item.name}"`);
  },

  selectProp: (propId) =>
    set({
      selectedPropId: propId,
      selectedBone: null,
      selectedIKHandle: null,
      wholeModelGizmoMode: 'none',
    }),

  setPropGizmoMode: (mode) => set({ propGizmoMode: mode }),

  updateProp: (propId, partial) =>
    set((s) => ({
      props: s.props.map((p) => (p.id === propId ? { ...p, ...partial } : p)),
    })),

  removeProp: (propId) =>
    set((s) => ({
      props: s.props
        .filter((p) => p.id !== propId)
        .map((p) =>
          p.parentPropId === propId ? { ...p, parentPropId: null } : p
        ),
      selectedPropId: s.selectedPropId === propId ? null : s.selectedPropId,
    })),

  attachPropToBone: (propId, charId, bone, autoWrapHand = true) => {
    const state = get();
    const prop = state.props.find((p) => p.id === propId);
    if (!prop) return;

    const targetCharId = bone === 'none' ? null : charId ?? state.activeCharacterId;
    const snap =
      bone === 'none'
        ? { position: [0.45, 0, 0.2] as Vec3Tuple, rotation: [0, 0, 0] as Vec3Tuple }
        : computeSmartBoneSnapTransform(bone, prop.kind, prop.dimensions);

    set((s) => ({
      props: s.props.map((p) =>
        p.id === propId
          ? {
              ...p,
              attachedCharacterId: targetCharId,
              attachedBone: bone,
              parentPropId: null,
              position: snap.position,
              rotation: snap.rotation,
            }
          : p
      ),
    }));

    // Automatically wrap hand fingers around the object when snapped to Left or Right Hand
    if (
      autoWrapHand &&
      targetCharId &&
      (bone === 'rightHand' || bone === 'leftHand')
    ) {
      get().wrapHandAroundProp(propId, prop.gripTightness ?? 0.68);
    }

    const labelMap: Record<PropAttachTarget, string> = {
      none: 'Detached to World Stage',
      rightHand: 'Snapped into Right Hand Grip (+Wrapped Fingers)',
      leftHand: 'Snapped into Left Hand Grip (+Wrapped Fingers)',
      rightLowerArm: 'Snapped to Right Forearm',
      leftLowerArm: 'Snapped to Left Forearm',
      head: 'Snapped to Head',
      chest: 'Snapped to Chest',
      hips: 'Snapped to Hips / Waist',
      rightFoot: 'Snapped to Right Foot',
      leftFoot: 'Snapped to Left Foot',
      'character-root': 'Parented to Mannequin Base',
    };
    get().showToast(labelMap[bone]);
  },

  parentPropToProp: (childPropId, parentPropId, snapOnTop = true) => {
    if (childPropId === parentPropId) return;
    const state = get();
    const parentProp = parentPropId
      ? state.props.find((p) => p.id === parentPropId)
      : null;

    // Prevent circular parent chains
    if (parentProp && parentProp.parentPropId === childPropId) {
      get().showToast('Cannot create circular prop parent');
      return;
    }

    const nextPos: Vec3Tuple =
      parentProp && snapOnTop
        ? [0, Math.round(parentProp.dimensions[1] * 1000) / 1000, 0]
        : [0, 0, 0];

    set((s) => ({
      props: s.props.map((p) =>
        p.id === childPropId
          ? {
              ...p,
              parentPropId,
              attachedCharacterId: null,
              attachedBone: 'none',
              position: parentProp ? nextPos : [0.45, 0, 0.2],
              rotation: [0, 0, 0],
            }
          : p
      ),
    }));

    get().showToast(
      parentProp
        ? `Snapped & parented to ${parentProp.name}`
        : 'Unparented prop to World Stage'
    );
  },

  wrapHandAroundProp: (propId, tightness) => {
    const state = get();
    const prop = state.props.find((p) => p.id === propId);
    if (!prop || !prop.attachedCharacterId) return;
    if (prop.attachedBone !== 'rightHand' && prop.attachedBone !== 'leftHand') {
      return;
    }
    const side: HandSide = prop.attachedBone === 'leftHand' ? 'left' : 'right';
    const effectiveTightness = tightness ?? prop.gripTightness ?? 0.68;

    const fingerBones = buildAdaptiveObjectWrapBones(
      side,
      prop.kind,
      prop.dimensions,
      effectiveTightness
    );

    set((s) => ({
      props: s.props.map((p) =>
        p.id === propId ? { ...p, gripTightness: effectiveTightness } : p
      ),
      characters: s.characters.map((c) =>
        c.id === prop.attachedCharacterId
          ? {
              ...c,
              bones: { ...c.bones, ...fingerBones },
              activePoseId: null,
            }
          : c
      ),
    }));
  },

  requestSurfaceSnap: (charId, mode) =>
    set((s) => ({
      surfaceSnapRequest: {
        charId,
        mode,
        nonce: (s.surfaceSnapRequest?.nonce ?? 0) + 1,
      },
    })),

  clearSurfaceSnapRequest: () => set({ surfaceSnapRequest: null }),

  setAvailableMorphs: (charId, morphs) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId ? { ...c, availableMorphs: morphs } : c
      ),
    })),

  setMorphValue: (charId, key, value) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId ? { ...c, morphs: { ...c.morphs, [key]: value } } : c
      ),
    })),

  resetMorphs: (charId) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId ? { ...c, morphs: {} } : c
      ),
    })),

  applyBodyPreset: (charId, preset) => {
    const presetMap: Record<ArchetypeBodyPreset, Record<string, number>> = {
      default: {
        Bust_Volume: 0.15,
        Bust_Splay: 0.05,
        Glute_Volume: 0.15,
        Glute_Drop: 0.05,
        Hip_Thigh_Width: 0.1,
        Waist_Taper: 0.12,
        Upper_Muscle: 0.1,
        Lower_Muscle: 0.1,
        Shoulder_Width: 0.0,
      },
      athletic: {
        Bust_Volume: 0.18,
        Bust_Splay: 0.04,
        Glute_Volume: 0.52,
        Glute_Drop: 0.05,
        Hip_Thigh_Width: 0.24,
        Waist_Taper: 0.42,
        Upper_Muscle: 0.85,
        Lower_Muscle: 0.88,
        Shoulder_Width: 0.45,
      },
      curvy: {
        Bust_Volume: 0.88,
        Bust_Splay: 0.22,
        Glute_Volume: 0.9,
        Glute_Drop: 0.42,
        Hip_Thigh_Width: 0.78,
        Waist_Taper: 0.8,
        Upper_Muscle: 0.06,
        Lower_Muscle: 0.26,
        Shoulder_Width: 0.0,
      },
      slender: {
        Bust_Volume: 0.05,
        Bust_Splay: 0.0,
        Glute_Volume: 0.08,
        Glute_Drop: 0.0,
        Hip_Thigh_Width: 0.0,
        Waist_Taper: 0.56,
        Upper_Muscle: 0.0,
        Lower_Muscle: 0.05,
        Shoulder_Width: 0.0,
      },
      heroic: {
        Bust_Volume: 0.34,
        Bust_Splay: 0.08,
        Glute_Volume: 0.46,
        Glute_Drop: 0.08,
        Hip_Thigh_Width: 0.34,
        Waist_Taper: 0.52,
        Upper_Muscle: 0.72,
        Lower_Muscle: 0.68,
        Shoulder_Width: 0.65,
      },
    };

    const target = presetMap[preset];
    const startChar = get().characters.find((c) => c.id === charId);
    if (!startChar) return;
    const startMorphs = { ...startChar.morphs };
    const keys = Object.keys(target);

    const durationMs = 280;
    const startTime = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const ease = 1 - Math.pow(1 - t, 3);
      const blended: Record<string, number> = {};
      for (const k of keys) {
        const from = startMorphs[k] ?? 0;
        const to = target[k];
        blended[k] = Math.round((from + (to - from) * ease) * 100) / 100;
      }
      set((state) => ({
        characters: state.characters.map((c) =>
          c.id === charId ? { ...c, morphs: { ...c.morphs, ...blended } } : c
        ),
      }));
      if (t < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  },

  updateFace: (charId, partial) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId ? { ...c, face: { ...c.face, ...partial } } : c
      ),
    })),

  applyExpressionPreset: (charId, preset) => {
    const def = EXPRESSION_PRESETS[preset];
    if (!def) return;
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId
          ? { ...c, face: { ...c.face, ...def.values } }
          : c
      ),
    }));
    get().showToast(`Expression: ${def.label}`);
  },

  updateHair: (charId, partial) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId ? { ...c, hair: { ...c.hair, ...partial } } : c
      ),
    })),

  updatePhysics: (charId, partial) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === charId ? { ...c, physics: { ...c.physics, ...partial } } : c
      ),
    })),

  triggerPhysicsImpulse: () =>
    set((s) => ({ physicsImpulseNonce: s.physicsImpulseNonce + 1 })),

  setPhysicsTelemetry: (charId, telemetry) =>
    set((s) => ({
      telemetryByChar: { ...s.telemetryByChar, [charId]: telemetry },
    })),

  setMaterialMode: (mode) => set({ materialMode: mode }),
  setCelThreshold: (t) => set({ celThreshold: t }),
  setFocalLength: (mm) => set({ focalLength: mm }),

  requestCameraPreset: (preset) =>
    set((s) => ({
      cameraPresetRequest: {
        preset,
        nonce: (s.cameraPresetRequest?.nonce ?? 0) + 1,
      },
    })),

  updateLighting: (partial) =>
    set((s) => ({ lighting: { ...s.lighting, ...partial } })),

  setShowGrid: (v) => set({ showGrid: v }),
  setShowFloor: (v) => set({ showFloor: v }),

  requestExportPng: (transparent) =>
    set((s) => ({
      exportRequest: {
        transparent,
        nonce: (s.exportRequest?.nonce ?? 0) + 1,
      },
    })),

  setIsExporting: (v) => set({ isExporting: v }),
  clearExportRequest: () => set({ exportRequest: null }),

  buildSceneExport: () => {
    const s = get();
    return {
      version: 2,
      savedAt: new Date().toISOString(),
      materialMode: s.materialMode,
      celThreshold: s.celThreshold,
      focalLength: s.focalLength,
      lighting: { ...s.lighting },
      characters: s.characters.map((c) => ({
        id: c.id,
        label: c.label,
        modelPreset: c.modelPreset === 'custom' ? 'realistic-female' : c.modelPreset,
        stagePosition: [...c.stagePosition] as Vec3Tuple,
        stageRotation: [...c.stageRotation] as Vec3Tuple,
        stageRotationY: c.stageRotationY,
        hipsPosition: [...c.hipsPosition] as Vec3Tuple,
        bones: cloneBones(c.bones),
        morphs: { ...c.morphs },
        physics: { ...c.physics },
        face: { ...c.face },
        hair: { ...c.hair },
        pinFeetToFloor: c.pinFeetToFloor,
      })),
      props: s.props
        .filter((p) => p.kind !== 'custom-glb')
        .map(({ customUrl: _omit, ...rest }) => rest),
    };
  },

  importSceneData: (data) => {
    if (!data || !Array.isArray(data.characters) || data.characters.length === 0) {
      get().showToast('Invalid scene JSON file');
      return;
    }
    const restored: CharacterState[] = data.characters.slice(0, 2).map((c, idx) => {
      const preset = c.modelPreset || 'realistic-female';
      return {
        id: c.id || `char-${idx + 1}`,
        label: c.label || (idx === 0 ? 'Figure A' : 'Figure B'),
        modelPreset: preset,
        modelSourceType: 'procedural',
        detectedFingerBoneCount: 30,
        stagePosition: c.stagePosition ?? [0, 0, 0],
        stageRotation: c.stageRotation ?? [0, c.stageRotationY ?? 0, 0],
        stageRotationY: c.stageRotationY ?? 0,
        hipsPosition: c.hipsPosition ?? [0, 0, 0],
        bones: cloneBones(c.bones ?? {}),
        morphs: { ...(c.morphs ?? {}) },
        availableMorphs: [],
        physics: c.physics ?? {
          enabled: true,
          weight: 0.6,
          floppiness: 0.45,
          damping: 0.42,
        },
        face: c.face ?? getDefaultFaceSettings(),
        hair: c.hair ?? getDefaultHairSettings(preset),
        pinFeetToFloor: Boolean(c.pinFeetToFloor),
        activePoseId: null,
        poseVersion: 1,
      };
    });

    set({
      characters: restored,
      activeCharacterId: restored[0].id,
      materialMode: data.materialMode ?? 'clay',
      celThreshold: data.celThreshold ?? 0.46,
      focalLength: data.focalLength ?? 38,
      lighting: data.lighting ?? get().lighting,
      props: Array.isArray(data.props)
        ? data.props.map((p) => ({
            ...p,
            parentPropId: p.parentPropId ?? null,
          }))
        : [],
      selectedBone: null,
      selectedIKHandle: null,
      selectedPropId: null,
    });
    get().pushHistory();
    get().showToast('Imported scene successfully');
  },

  pushHistory: () => {
    const state = get();
    const snap = createSnapshot(state.characters);
    const trimmed = state.history.slice(0, state.historyIndex + 1);
    trimmed.push(snap);
    if (trimmed.length > MAX_HISTORY) {
      trimmed.shift();
    }
    set({
      history: trimmed,
      historyIndex: trimmed.length - 1,
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) return;
    const nextIdx = state.historyIndex - 1;
    const snap = state.history[nextIdx];
    set({
      historyIndex: nextIdx,
      characters: state.characters.map((c) => {
        const match = snap.characters.find((sc) => sc.id === c.id);
        if (!match) return c;
        return {
          ...c,
          hipsPosition: [...match.hipsPosition] as Vec3Tuple,
          bones: cloneBones(match.bones),
          stagePosition: [...match.stagePosition] as Vec3Tuple,
          stageRotation: [...match.stageRotation] as Vec3Tuple,
          stageRotationY: match.stageRotationY,
          poseVersion: c.poseVersion + 1,
        };
      }),
    });
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    const nextIdx = state.historyIndex + 1;
    const snap = state.history[nextIdx];
    set({
      historyIndex: nextIdx,
      characters: state.characters.map((c) => {
        const match = snap.characters.find((sc) => sc.id === c.id);
        if (!match) return c;
        return {
          ...c,
          hipsPosition: [...match.hipsPosition] as Vec3Tuple,
          bones: cloneBones(match.bones),
          stagePosition: [...match.stagePosition] as Vec3Tuple,
          stageRotation: [...match.stageRotation] as Vec3Tuple,
          stageRotationY: match.stageRotationY,
          poseVersion: c.poseVersion + 1,
        };
      }),
    });
  },
}));
