import {
  BoneRotationsMap,
  FingerName,
  HandPoseControls,
  HandPresetName,
  HandSide,
  PropAttachTarget,
  PropPrimitiveType,
  Vec3Tuple,
  VrmBoneName,
} from '../types/pose';

/**
 * 8 Studio Hand Presets including object-wrapping grips (Cylinder Wrap, Sphere Hold, Pinch, Flat Carry).
 */
export const HAND_PRESETS: Record<
  HandPresetName,
  { label: string; controls: HandPoseControls }
> = {
  relaxed: {
    label: 'Relaxed',
    controls: {
      thumb: 0.25,
      index: 0.22,
      middle: 0.3,
      ring: 0.38,
      little: 0.45,
      spread: 0.14,
    },
  },
  fist: {
    label: 'Fist',
    controls: {
      thumb: 0.88,
      index: 0.96,
      middle: 0.98,
      ring: 0.98,
      little: 0.98,
      spread: -0.05,
    },
  },
  open: {
    label: 'Open',
    controls: {
      thumb: 0.02,
      index: 0.0,
      middle: 0.0,
      ring: 0.0,
      little: 0.0,
      spread: 0.72,
    },
  },
  point: {
    label: 'Point',
    controls: {
      thumb: 0.62,
      index: 0.04,
      middle: 0.92,
      ring: 0.95,
      little: 0.95,
      spread: 0.08,
    },
  },
  cylinderWrap: {
    label: 'Cylinder Wrap',
    controls: {
      thumb: 0.66,
      index: 0.64,
      middle: 0.68,
      ring: 0.7,
      little: 0.72,
      spread: 0.06,
    },
  },
  sphereHold: {
    label: 'Sphere / Cup',
    controls: {
      thumb: 0.48,
      index: 0.46,
      middle: 0.5,
      ring: 0.48,
      little: 0.44,
      spread: 0.56,
    },
  },
  pinch: {
    label: 'Pinch / Pen',
    controls: {
      thumb: 0.68,
      index: 0.64,
      middle: 0.34,
      ring: 0.42,
      little: 0.5,
      spread: 0.12,
    },
  },
  flatCarry: {
    label: 'Flat Carry',
    controls: {
      thumb: 0.18,
      index: 0.12,
      middle: 0.14,
      ring: 0.14,
      little: 0.16,
      spread: 0.28,
    },
  },
};

const FINGER_SPREAD_WEIGHTS: Record<Exclude<FingerName, 'thumb'>, number> = {
  index: 1.0,
  middle: 0.18,
  ring: -0.45,
  little: -1.1,
};

/**
 * Generates VRM-standard Euler degree rotations for all 15 bones of one hand
 * from per-finger curl (0..1) and spread (-0.2..1) sliders.
 */
export function buildHandBoneRotations(
  side: HandSide,
  controls: HandPoseControls
): BoneRotationsMap {
  const prefix = side === 'left' ? 'left' : 'right';
  const sign = side === 'left' ? 1 : -1;
  const out: BoneRotationsMap = {};

  // Thumb opposes across palm to meet or wrap around held objects
  const t = controls.thumb;
  const tSpread = controls.spread;
  out[`${prefix}ThumbProximal` as VrmBoneName] = [
    Math.round((14 + t * 36) * 10) / 10,
    Math.round(sign * (20 - t * 42 + tSpread * 16) * 10) / 10,
    Math.round(sign * -(14 + t * 32) * 10) / 10,
  ];
  out[`${prefix}ThumbIntermediate` as VrmBoneName] = [
    Math.round((t * 16) * 10) / 10,
    Math.round(sign * -(t * 32) * 10) / 10,
    Math.round(sign * -(t * 36) * 10) / 10,
  ];
  out[`${prefix}ThumbDistal` as VrmBoneName] = [
    0,
    Math.round(sign * -(t * 26) * 10) / 10,
    Math.round(sign * -(t * 38) * 10) / 10,
  ];

  // Index, Middle, Ring, Little
  const fingers: Array<{ key: Exclude<FingerName, 'thumb'>; cap: string }> = [
    { key: 'index', cap: 'Index' },
    { key: 'middle', cap: 'Middle' },
    { key: 'ring', cap: 'Ring' },
    { key: 'little', cap: 'Little' },
  ];

  for (const f of fingers) {
    const curl = controls[f.key];
    const proxZ = sign * -(curl * 82);
    const interZ = sign * -(curl * 92);
    const distZ = sign * -(curl * 66);

    const spreadAttenuation = 1 - curl * 0.65;
    const spreadY =
      sign * FINGER_SPREAD_WEIGHTS[f.key] * controls.spread * 16 * spreadAttenuation;

    out[`${prefix}${f.cap}Proximal` as VrmBoneName] = [
      0,
      Math.round(spreadY * 10) / 10,
      Math.round(proxZ * 10) / 10,
    ];
    out[`${prefix}${f.cap}Intermediate` as VrmBoneName] = [
      0,
      0,
      Math.round(interZ * 10) / 10,
    ];
    out[`${prefix}${f.cap}Distal` as VrmBoneName] = [
      0,
      0,
      Math.round(distZ * 10) / 10,
    ];
  }

  return out;
}

/**
 * Computes diameter-adaptive finger wrap rotations around a held prop (e.g. Cylinder, Box, Handle)
 * so the fingers and opposing thumb wrap naturally around the object's thickness.
 */
export function buildAdaptiveObjectWrapBones(
  side: HandSide,
  propKind: PropPrimitiveType,
  dimensions: Vec3Tuple,
  tightness = 0.68
): BoneRotationsMap {
  const prefix = side === 'left' ? 'left' : 'right';
  const sign = side === 'left' ? 1 : -1;

  // Effective grip diameter (meters)
  const rawDiameter = Math.min(dimensions[0], dimensions[2]);
  // Normalize diameter in [0.02m (thin wand) .. 0.14m (wide bottle)]
  const diamFactor = Math.max(0, Math.min(1, (rawDiameter - 0.02) / 0.12));

  // Thinner object + higher tightness = deeper curl; wider object = wider circular arc
  const baseCurl = Math.max(
    0.22,
    Math.min(0.95, tightness * (1.02 - diamFactor * 0.48))
  );

  // For circular/cylindrical wrap, proximal & intermediate form a C-ring while distal hugs tangent
  const proxAngle = sign * -(36 + baseCurl * 46);
  const interAngle = sign * -(42 + baseCurl * 46);
  const distAngle = sign * -(24 + baseCurl * 38);

  const out: BoneRotationsMap = {};
  const fingers = ['Index', 'Middle', 'Ring', 'Little'] as const;

  fingers.forEach((cap, idx) => {
    // Subtle natural cascade (little finger wraps slightly tighter than index)
    const cascade = 1 + idx * 0.035;
    const spreadDeg =
      propKind === 'cylinder'
        ? sign * (1.5 - idx) * 2.2
        : sign * (1.5 - idx) * (3.5 + diamFactor * 4);

    out[`${prefix}${cap}Proximal` as VrmBoneName] = [
      0,
      Math.round(spreadDeg * 10) / 10,
      Math.round(proxAngle * cascade * 10) / 10,
    ];
    out[`${prefix}${cap}Intermediate` as VrmBoneName] = [
      0,
      0,
      Math.round(interAngle * cascade * 10) / 10,
    ];
    out[`${prefix}${cap}Distal` as VrmBoneName] = [
      0,
      0,
      Math.round(distAngle * cascade * 10) / 10,
    ];
  });

  // Opposing thumb wraps around the opposite side of the cylinder barrel
  const tCurl = Math.max(0.25, Math.min(0.92, baseCurl * 0.95));
  out[`${prefix}ThumbProximal` as VrmBoneName] = [
    Math.round((28 + tCurl * 24) * 10) / 10,
    Math.round(sign * -(12 + tCurl * 22) * 10) / 10,
    Math.round(sign * -(22 + tCurl * 24) * 10) / 10,
  ];
  out[`${prefix}ThumbIntermediate` as VrmBoneName] = [
    Math.round((10 + tCurl * 14) * 10) / 10,
    Math.round(sign * -(18 + tCurl * 22) * 10) / 10,
    Math.round(sign * -(18 + tCurl * 26) * 10) / 10,
  ];
  out[`${prefix}ThumbDistal` as VrmBoneName] = [
    0,
    Math.round(sign * -(14 + tCurl * 18) * 10) / 10,
    Math.round(sign * -(16 + tCurl * 26) * 10) / 10,
  ];

  return out;
}

/**
 * Computes the ideal local snap position & rotation when attaching a prop to a mannequin bone
 * so held objects land directly inside the palm grip (instead of floating out in front).
 */
export function computeSmartBoneSnapTransform(
  target: PropAttachTarget,
  propKind: PropPrimitiveType,
  dimensions: Vec3Tuple
): { position: Vec3Tuple; rotation: Vec3Tuple } {
  const radius = Math.min(dimensions[0], dimensions[2]) * 0.5;

  if (target === 'rightHand' || target === 'leftHand') {
    const side = target === 'leftHand' ? 1 : -1;
    // Place object center directly in the palm hollow (-Y palm face, ±X palm center)
    const palmX = side * 0.056;
    const palmY = -(0.016 + Math.min(0.08, radius * 0.85));
    const palmZ = 0.004;

    // Orient cylinders/handles along the palm crease (90° X pitch) so fingers wrap around the barrel!
    const rot: Vec3Tuple =
      propKind === 'cylinder' ? [90, 0, 0] : [0, 0, 0];

    return {
      position: [
        Math.round(palmX * 1000) / 1000,
        Math.round(palmY * 1000) / 1000,
        Math.round(palmZ * 1000) / 1000,
      ],
      rotation: rot,
    };
  }

  if (target === 'rightLowerArm' || target === 'leftLowerArm') {
    const side = target === 'leftLowerArm' ? 1 : -1;
    return {
      position: [side * 0.13, -(0.03 + radius * 0.6), 0],
      rotation: [0, 0, 0],
    };
  }

  if (target === 'head') {
    return {
      position: [0, 0.16 + dimensions[1] * 0.35, 0.01],
      rotation: [0, 0, 0],
    };
  }

  if (target === 'chest') {
    return {
      position: [0, 0.08, 0.12 + dimensions[2] * 0.4],
      rotation: [0, 0, 0],
    };
  }

  if (target === 'hips') {
    return {
      position: [0.15 + radius * 0.5, 0, 0],
      rotation: [0, 0, 0],
    };
  }

  if (target === 'rightFoot' || target === 'leftFoot') {
    return {
      position: [0, -0.06 - dimensions[1] * 0.5, 0.05],
      rotation: [0, 0, 0],
    };
  }

  // character-root or none
  return {
    position: [0.35, 0, 0.25],
    rotation: [0, 0, 0],
  };
}

export function extractHandControlsFromBones(
  side: HandSide,
  bones: BoneRotationsMap
): HandPoseControls {
  const prefix = side === 'left' ? 'left' : 'right';
  const sign = side === 'left' ? 1 : -1;

  const readCurl = (cap: string): number => {
    const prox: Vec3Tuple | undefined = bones[`${prefix}${cap}Proximal` as VrmBoneName];
    const inter: Vec3Tuple | undefined = bones[`${prefix}${cap}Intermediate` as VrmBoneName];
    if (!prox && !inter) return 0.25;
    const pz = prox ? (-sign * prox[2]) / 82 : 0;
    const iz = inter ? (-sign * inter[2]) / 92 : pz;
    return Math.max(0, Math.min(1, (pz + iz) * 0.5));
  };

  const thumbInter = bones[`${prefix}ThumbIntermediate` as VrmBoneName];
  const thumbCurl = thumbInter
    ? Math.max(0, Math.min(1, (-sign * thumbInter[2]) / 36))
    : 0.25;

  const idxProx = bones[`${prefix}IndexProximal` as VrmBoneName];
  const litProx = bones[`${prefix}LittleProximal` as VrmBoneName];
  let spread = 0.14;
  if (idxProx || litProx) {
    const idxY = idxProx ? (sign * idxProx[1]) / 16 : 0;
    const litY = litProx ? (-sign * litProx[1]) / 17.6 : idxY;
    spread = Math.max(-0.2, Math.min(1, (idxY + litY) * 0.5));
  }

  return {
    thumb: Math.round(thumbCurl * 100) / 100,
    index: Math.round(readCurl('Index') * 100) / 100,
    middle: Math.round(readCurl('Middle') * 100) / 100,
    ring: Math.round(readCurl('Ring') * 100) / 100,
    little: Math.round(readCurl('Little') * 100) / 100,
    spread: Math.round(spread * 100) / 100,
  };
}
