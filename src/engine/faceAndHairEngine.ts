import * as THREE from 'three';
import {
  ExpressionPresetName,
  FaceSettings,
  HairSettings,
  HairStyleId,
} from '../types/pose';
import { ProceduralSpringBone, RiggedMannequinHandle } from './proceduralMannequin';

export const EXPRESSION_PRESETS: Record<
  ExpressionPresetName,
  { label: string; values: Omit<FaceSettings, 'showFeatures' | 'irisScale'> }
> = {
  neutral: {
    label: 'Neutral',
    values: {
      expressionPreset: 'neutral',
      eyeGazeX: 0,
      eyeGazeY: 0,
      blinkLeft: 0,
      blinkRight: 0,
      browHeight: 0,
      browAngle: 0,
      mouthSmile: 0.08,
      mouthOpen: 0,
    },
  },
  smile: {
    label: 'Smile',
    values: {
      expressionPreset: 'smile',
      eyeGazeX: 0,
      eyeGazeY: 0.05,
      blinkLeft: 0.18,
      blinkRight: 0.18,
      browHeight: 0.25,
      browAngle: -0.15,
      mouthSmile: 0.88,
      mouthOpen: 0.22,
    },
  },
  angry: {
    label: 'Fierce / Angry',
    values: {
      expressionPreset: 'angry',
      eyeGazeX: 0,
      eyeGazeY: -0.1,
      blinkLeft: 0.15,
      blinkRight: 0.15,
      browHeight: -0.45,
      browAngle: 0.92,
      mouthSmile: -0.65,
      mouthOpen: 0.35,
    },
  },
  surprised: {
    label: 'Surprised',
    values: {
      expressionPreset: 'surprised',
      eyeGazeX: 0,
      eyeGazeY: 0.12,
      blinkLeft: 0,
      blinkRight: 0,
      browHeight: 0.85,
      browAngle: -0.25,
      mouthSmile: -0.1,
      mouthOpen: 0.82,
    },
  },
  sad: {
    label: 'Sad / Worried',
    values: {
      expressionPreset: 'sad',
      eyeGazeX: -0.15,
      eyeGazeY: -0.28,
      blinkLeft: 0.32,
      blinkRight: 0.32,
      browHeight: 0.35,
      browAngle: -0.88,
      mouthSmile: -0.72,
      mouthOpen: 0.08,
    },
  },
  wink: {
    label: 'Playful Wink',
    values: {
      expressionPreset: 'wink',
      eyeGazeX: 0.12,
      eyeGazeY: 0.06,
      blinkLeft: 0.98,
      blinkRight: 0.0,
      browHeight: 0.3,
      browAngle: -0.1,
      mouthSmile: 0.82,
      mouthOpen: 0.3,
    },
  },
  focused: {
    label: 'Focused',
    values: {
      expressionPreset: 'focused',
      eyeGazeX: 0,
      eyeGazeY: 0.04,
      blinkLeft: 0.12,
      blinkRight: 0.12,
      browHeight: -0.28,
      browAngle: 0.52,
      mouthSmile: -0.18,
      mouthOpen: 0.0,
    },
  },
};

export const HAIR_STYLE_CATALOG: Array<{
  id: HairStyleId;
  label: string;
  subtitle: string;
}> = [
  { id: 'ponytail', label: 'Long Ponytail', subtitle: 'Dynamic Back Tail' },
  { id: 'bob', label: 'Classic Bob', subtitle: 'Chin-Length Frame' },
  { id: 'twintails', label: 'Twin Tails', subtitle: 'Dual High Cascades' },
  { id: 'long-flowing', label: 'Long Flowing', subtitle: 'Full Back Locks' },
  { id: 'short-crop', label: 'Short Tousled', subtitle: 'Layered Athletic' },
  { id: 'swept-bangs', label: 'Swept Fringe', subtitle: 'Asymmetric Bangs' },
  { id: 'bald', label: 'Bald / Loomis', subtitle: 'Pure Skull Reference' },
];

export const HAIR_COLOR_SWATCHES = [
  { label: 'Studio Slate', hex: '#7f7d8e' },
  { label: 'Obsidian Black', hex: '#2e2e38' },
  { label: 'Silver White', hex: '#d8dae3' },
  { label: 'Warm Auburn', hex: '#9c5248' },
  { label: 'Golden Blonde', hex: '#d4b26f' },
  { label: 'Indigo Blue', hex: '#4f5d95' },
  { label: 'Sakura Rose', hex: '#c77d92' },
];

export interface ProceduralFaceAndHairRig {
  faceGroup: THREE.Group;
  leftIrisGroup: THREE.Group;
  rightIrisGroup: THREE.Group;
  leftEyelid: THREE.Mesh;
  rightEyelid: THREE.Mesh;
  leftBrow: THREE.Mesh;
  rightBrow: THREE.Mesh;
  upperLip: THREE.Mesh;
  lowerLip: THREE.Mesh;
  leftMouthCorner: THREE.Mesh;
  rightMouthCorner: THREE.Mesh;
  mouthCavity: THREE.Mesh;
  // Base positions for relative offsets
  eyeBaseX: number;
  eyeBaseY: number;
  eyeBaseZ: number;
  browBaseY: number;
  mouthBaseY: number;
  // Hair style groups
  hairRootGroup: THREE.Group;
  hairCapGroup: THREE.Group;
  bangsGroup: THREE.Group;
  styleGroups: Record<Exclude<HairStyleId, 'bald'>, THREE.Group>;
  hairMeshes: THREE.Mesh[];
  hairSpringBones: Array<{
    sb: ProceduralSpringBone;
    baseEuler: THREE.Euler;
    lengthTarget: THREE.Object3D;
  }>;
}

/**
 * Updates facial features (eye gaze, eyelids/blink, brow height & angle, mouth smile & open)
 * and hair style (active style, length, bangs length, volume, wind flow pitch/sway, hair color)
 * in real time every frame. Also bridges to native VRM expressionManager if loaded.
 */
export function updateFaceAndHairRig(
  handle: RiggedMannequinHandle,
  face: FaceSettings,
  hair: HairSettings
) {
  // 1. Bridge to Native VRM ExpressionManager (including VRM 0.x lookleft/right/up/down & blink/joy/angry/sorrow/a)
  if (handle.vrm?.expressionManager) {
    const em = handle.vrm.expressionManager;
    const setExp = (names: string[], val: number) => {
      const clamped = THREE.MathUtils.clamp(val, 0, 1);
      for (const n of names) {
        try {
          em.setValue(n, clamped);
        } catch {
          // ignore unsupported expression name
        }
      }
    };
    setExp(['blinkLeft', 'blink_l', 'Blink_L'], face.blinkLeft);
    setExp(['blinkRight', 'blink_r', 'Blink_R'], face.blinkRight);
    setExp(['happy', 'joy', 'Joy', 'fun', 'Fun'], Math.max(0, face.mouthSmile));
    setExp(
      ['sad', 'sorrow', 'Sorrow'],
      Math.max(0, -face.mouthSmile * 0.7 - face.browAngle * 0.4)
    );
    setExp(['angry', 'Angry'], Math.max(0, face.browAngle));
    setExp(
      ['surprised', 'Surprised'],
      Math.max(0, face.browHeight * 0.6 + face.mouthOpen * 0.5)
    );
    setExp(['aa', 'a', 'A'], face.mouthOpen);
    setExp(['lookLeft', 'lookleft', 'LookLeft'], Math.max(0, -face.eyeGazeX));
    setExp(['lookRight', 'lookright', 'LookRight'], Math.max(0, face.eyeGazeX));
    setExp(['lookUp', 'lookup', 'LookUp'], Math.max(0, face.eyeGazeY));
    setExp(['lookDown', 'lookdown', 'LookDown'], Math.max(0, -face.eyeGazeY));
  }

  // Also drive VRM leftEye / rightEye humanoid bones if present on imported VRM
  if (handle.vrm?.humanoid) {
    const le =
      handle.vrm.humanoid.getNormalizedBoneNode?.('leftEye') ??
      handle.vrm.humanoid.getRawBoneNode?.('leftEye');
    const re =
      handle.vrm.humanoid.getNormalizedBoneNode?.('rightEye') ??
      handle.vrm.humanoid.getRawBoneNode?.('rightEye');
    const yaw = THREE.MathUtils.clamp(face.eyeGazeX, -1, 1) * 0.28;
    const pitch = THREE.MathUtils.clamp(-face.eyeGazeY, -1, 1) * 0.22;
    if (le) le.rotation.set(pitch, yaw, 0, 'XYZ');
    if (re) re.rotation.set(pitch, yaw, 0, 'XYZ');
  }

  const isProcedural = handle.sourceType === 'procedural';
  if (!isProcedural) {
    for (const m of handle.meshes) {
      if (m.userData.isFaceFeature) {
        m.visible = face.showFeatures;
      }
    }
  }

  const rig = handle.faceAndHairRig;
  if (!rig) return;

  // 2. Procedural Facial Features (only on procedural head; imported VRMs use their native sculpted face/eyes)
  rig.faceGroup.visible = isProcedural && face.showFeatures;
  if (isProcedural && face.showFeatures) {
    const gazeMaxX = 0.0085;
    const gazeMaxY = 0.0055;
    const gx = THREE.MathUtils.clamp(face.eyeGazeX, -1, 1) * gazeMaxX;
    const gy = THREE.MathUtils.clamp(face.eyeGazeY, -1, 1) * gazeMaxY;
    const irisS = THREE.MathUtils.clamp(face.irisScale, 0.6, 1.4);

    rig.leftIrisGroup.position.set(rig.eyeBaseX + gx, rig.eyeBaseY + gy, rig.eyeBaseZ + 0.0045);
    rig.rightIrisGroup.position.set(-rig.eyeBaseX + gx, rig.eyeBaseY + gy, rig.eyeBaseZ + 0.0045);
    rig.leftIrisGroup.scale.set(irisS, irisS, 1);
    rig.rightIrisGroup.scale.set(irisS, irisS, 1);

    // Eyelids (Blink Left / Right)
    const bl = THREE.MathUtils.clamp(face.blinkLeft, 0, 1);
    const br = THREE.MathUtils.clamp(face.blinkRight, 0, 1);
    rig.leftEyelid.scale.y = 0.18 + bl * 1.05;
    rig.leftEyelid.position.y = rig.eyeBaseY + 0.011 - bl * 0.0095;
    rig.rightEyelid.scale.y = 0.18 + br * 1.05;
    rig.rightEyelid.position.y = rig.eyeBaseY + 0.011 - br * 0.0095;

    // Eyebrows (Height & Angle: +browAngle tilts inner brow down for fierce/angry; -browAngle tilts inner up for sad)
    const bh = THREE.MathUtils.clamp(face.browHeight, -1, 1) * 0.009;
    const ba = THREE.MathUtils.clamp(face.browAngle, -1, 1) * 0.42;
    rig.leftBrow.position.y = rig.browBaseY + bh;
    rig.rightBrow.position.y = rig.browBaseY + bh;
    // Left brow (+X side): rotating around Z by +ba lowers inner (+X -> 0) end!
    rig.leftBrow.rotation.z = ba;
    rig.rightBrow.rotation.z = -ba;

    // Mouth (Smile/Frown & Open)
    const smile = THREE.MathUtils.clamp(face.mouthSmile, -1, 1);
    const open = THREE.MathUtils.clamp(face.mouthOpen, 0, 1);

    rig.upperLip.position.y = rig.mouthBaseY + 0.0015 + open * 0.0025;
    rig.lowerLip.position.y = rig.mouthBaseY - 0.0015 - open * 0.0075 - Math.max(0, smile) * 0.001;

    // Mouth corners curve up for smile, down for frown
    const cornerY = rig.mouthBaseY + smile * 0.0055 - open * 0.002;
    const cornerX = 0.015 + smile * 0.0025;
    rig.leftMouthCorner.position.x = cornerX;
    rig.leftMouthCorner.position.y = cornerY;
    rig.rightMouthCorner.position.x = -cornerX;
    rig.rightMouthCorner.position.y = cornerY;
    rig.leftMouthCorner.rotation.z = smile * 0.45;
    rig.rightMouthCorner.rotation.z = -smile * 0.45;

    rig.mouthCavity.visible = open > 0.05;
    rig.mouthCavity.scale.set(
      0.85 + Math.max(0, smile) * 0.25,
      Math.max(0.08, open * 1.15),
      1
    );
    rig.mouthCavity.position.y = rig.mouthBaseY - open * 0.003;
  }

  // 3. Procedural Hair Styles & Wind/Flow Manipulation
  const isBald = hair.style === 'bald';
  rig.hairRootGroup.visible = !isBald;
  if (!isBald) {
    const vol = THREE.MathUtils.clamp(hair.volume, 0.7, 1.45);
    rig.hairCapGroup.scale.set(vol, 0.95 + (vol - 1) * 0.45, vol);
    rig.bangsGroup.scale.set(1, THREE.MathUtils.clamp(hair.bangsLength, 0.4, 1.5), 1);
    rig.bangsGroup.visible = hair.style !== 'short-crop';

    for (const [styleKey, grp] of Object.entries(rig.styleGroups)) {
      grp.visible = styleKey === hair.style;
    }

    const lenScale = THREE.MathUtils.clamp(hair.length, 0.5, 1.6);
    const pitchRad = THREE.MathUtils.degToRad(hair.windPitch);
    const swayRad = THREE.MathUtils.degToRad(hair.windSway);

    for (const entry of rig.hairSpringBones) {
      entry.lengthTarget.scale.set(vol, lenScale, vol);
      const e = new THREE.Euler(
        entry.baseEuler.x + pitchRad,
        entry.baseEuler.y,
        entry.baseEuler.z + swayRad,
        'XYZ'
      );
      entry.sb.restRotation.setFromEuler(e);
    }

    // Update hair mesh tint color smoothly
    for (const hm of rig.hairMeshes) {
      const mat = hm.material as THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
      if (mat && mat.color) {
        mat.color.set(hair.color);
      }
    }
  }
}
