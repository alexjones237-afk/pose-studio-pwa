import * as THREE from 'three';
import { RiggedMannequinHandle } from './proceduralMannequin';
import { PhysicsSettings, PhysicsTelemetry } from '../types/pose';

const WORLD_GRAVITY = new THREE.Vector3(0, -1, 0);
const _parentWorldPos = new THREE.Vector3();
const _parentWorldQuat = new THREE.Quaternion();
const _invParentWorldQuat = new THREE.Quaternion();
const _boneWorldPos = new THREE.Vector3();
const _restTipWorld = new THREE.Vector3();
const _velocity = new THREE.Vector3();
const _toTip = new THREE.Vector3();
const _desiredLocalDir = new THREE.Vector3();
const _deltaQuat = new THREE.Quaternion();
const _chestWorldQuat = new THREE.Quaternion();
const _chestForwardWorld = new THREE.Vector3();
const _chestDownWorld = new THREE.Vector3();
const _hipsWorldQuat = new THREE.Quaternion();
const _hipsDownWorld = new THREE.Vector3();
const _hipsBackWorld = new THREE.Vector3();

export interface PhysicsRuntimeState {
  currentHangForward: number;
  currentSplayBack: number;
  currentStandingDroop: number;
  currentGluteGravity: number;
  impulseRemaining: number;
  impulseDir: THREE.Vector3;
}

export function createPhysicsRuntimeState(): PhysicsRuntimeState {
  return {
    currentHangForward: 0,
    currentSplayBack: 0,
    currentStandingDroop: 0,
    currentGluteGravity: 0,
    impulseRemaining: 0,
    impulseDir: new THREE.Vector3(0, -1, 0.35).normalize(),
  };
}

export function triggerSpringImpulse(
  handle: RiggedMannequinHandle,
  runtime: PhysicsRuntimeState
) {
  runtime.impulseRemaining = 0.16;
  runtime.impulseDir.set((Math.random() - 0.5) * 0.4, -1, 0.45).normalize();

  for (const sb of handle.springBones) {
    if (sb.initialized) {
      sb.prevTipWorld.addScaledVector(runtime.impulseDir, -0.022);
    }
  }
}

export function resetSpringBones(handle: RiggedMannequinHandle) {
  handle.root.updateMatrixWorld(true);
  for (const sb of handle.springBones) {
    sb.bone.quaternion.copy(sb.restRotation);
    sb.initialized = false;
  }
  if (handle.vrm?.springBoneManager?.reset) {
    handle.vrm.springBoneManager.reset();
  }
}

function applyMorphByAliases(
  meshes: THREE.Mesh[],
  aliases: string[],
  value: number
) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  for (const mesh of meshes) {
    const dict = mesh.morphTargetDictionary;
    const infl = mesh.morphTargetInfluences;
    if (!dict || !infl) continue;

    for (const key of Object.keys(dict)) {
      const lower = key.toLowerCase();
      if (aliases.some((alias) => lower === alias || lower.includes(alias))) {
        infl[dict[key]] = clamped;
      }
    }
  }
}

/**
 * Steps the Universal Softness & Gravity Physics Engine for ANY model (VRM, GLB, or procedural):
 *  1. Spring Bones: hooks native VRM `VRMSpringBoneManager` OR procedural Verlet spring bones
 *     to Weight (Gravity Power), Floppiness (Inverse Stiffness), and Damping.
 *  2. Universal Orientation-Driven Gravity Solver: evaluates world orientation of BOTH `chest`
 *     and `hips` relative to world gravity `(0, -1, 0)` and blends dynamic droop/splay morphs in real time.
 */
export function stepHybridPhysics(
  handle: RiggedMannequinHandle,
  settings: PhysicsSettings,
  runtime: PhysicsRuntimeState,
  deltaSec: number
): PhysicsTelemetry {
  const dt = Math.min(Math.max(deltaSec, 0.001), 0.045);

  // --- 1. SPRING BONES (Native VRM or Procedural Verlet) ---
  let springBoneCount = handle.springBones.length;

  if (handle.vrm) {
    const sbm = handle.vrm.springBoneManager;
    if (sbm && sbm.joints) {
      springBoneCount = sbm.joints.size ?? Array.from(sbm.joints).length;
      const stiffnessScale = settings.enabled
        ? Math.max(0.08, 1.38 - settings.floppiness * 1.18)
        : 2.5;
      const gravityPower = settings.enabled ? settings.weight * 1.75 : 0;
      const dragForce = settings.enabled
        ? THREE.MathUtils.clamp(0.14 + settings.damping * 0.78, 0.05, 0.95)
        : 0.95;

      for (const joint of sbm.joints) {
        if (joint?.settings) {
          joint.settings.stiffness = stiffnessScale;
          joint.settings.gravityPower = gravityPower;
          joint.settings.dragForce = dragForce;
        }
      }
    }
    handle.vrm.update(dt);
  }

  if (handle.springBones.length > 0) {
    if (!settings.enabled) {
      for (const sb of handle.springBones) {
        sb.bone.quaternion.slerp(sb.restRotation, 1 - Math.exp(-12 * dt));
        sb.initialized = false;
      }
    } else {
      handle.root.updateMatrixWorld(true);

      const impulsePower = runtime.impulseRemaining > 0 ? 1.8 : 0;
      if (runtime.impulseRemaining > 0) {
        runtime.impulseRemaining = Math.max(0, runtime.impulseRemaining - dt);
      }

      const floppiness = THREE.MathUtils.clamp(settings.floppiness, 0, 1);
      const weight = THREE.MathUtils.clamp(settings.weight, 0, 1);
      const damping = THREE.MathUtils.clamp(settings.damping, 0, 1);

      for (const sb of handle.springBones) {
        const parent = sb.bone.parent;
        if (!parent) continue;

        parent.getWorldPosition(_parentWorldPos);
        parent.getWorldQuaternion(_parentWorldQuat);
        sb.bone.getWorldPosition(_boneWorldPos);

        _restTipWorld
          .copy(sb.restLocalDir)
          .applyQuaternion(sb.restRotation)
          .applyQuaternion(_parentWorldQuat)
          .multiplyScalar(sb.length)
          .add(_boneWorldPos);

        if (!sb.initialized) {
          sb.currTipWorld.copy(_restTipWorld);
          sb.prevTipWorld.copy(_restTipWorld);
          sb.initialized = true;
          continue;
        }

        const dragRetention = THREE.MathUtils.clamp(
          1 - (0.06 + damping * 0.42 + sb.baseDrag * 0.12),
          0.35,
          0.95
        );
        _velocity.subVectors(sb.currTipWorld, sb.prevTipWorld).multiplyScalar(dragRetention);
        sb.prevTipWorld.copy(sb.currTipWorld);

        const stiffness = sb.baseStiffness * (1.28 - floppiness * 1.05);
        const restoreFactor = THREE.MathUtils.clamp(stiffness * dt * 28, 0.02, 0.72);
        const gravityAccel = sb.baseGravity * weight * (0.45 + floppiness * 1.15);

        sb.currTipWorld.add(_velocity);
        sb.currTipWorld.lerp(_restTipWorld, restoreFactor);
        sb.currTipWorld.addScaledVector(WORLD_GRAVITY, gravityAccel * dt * dt * 18);

        if (impulsePower > 0) {
          sb.currTipWorld.addScaledVector(
            runtime.impulseDir,
            impulsePower * (0.4 + floppiness * 0.9) * dt * dt * 14
          );
        }

        _toTip.subVectors(sb.currTipWorld, _boneWorldPos);
        if (_toTip.lengthSq() < 1e-8) {
          _toTip.copy(_restTipWorld).sub(_boneWorldPos);
        }
        _toTip.normalize().multiplyScalar(sb.length);
        sb.currTipWorld.copy(_boneWorldPos).add(_toTip);

        _invParentWorldQuat.copy(_parentWorldQuat).invert();
        _desiredLocalDir.copy(_toTip).normalize().applyQuaternion(_invParentWorldQuat).normalize();

        const restDir = sb.restLocalDir;
        const dot = THREE.MathUtils.clamp(restDir.dot(_desiredLocalDir), -1, 1);
        const angle = Math.acos(dot);
        const effectiveMaxAngle = sb.maxAngleRad * (0.55 + floppiness * 0.65);

        if (angle > effectiveMaxAngle && angle > 1e-4) {
          const t = effectiveMaxAngle / angle;
          _deltaQuat.setFromUnitVectors(restDir, _desiredLocalDir);
          _deltaQuat.slerp(new THREE.Quaternion(), 1 - t);
          sb.bone.quaternion.copy(sb.restRotation).premultiply(_deltaQuat);
        } else {
          _deltaQuat.setFromUnitVectors(restDir, _desiredLocalDir);
          sb.bone.quaternion.copy(sb.restRotation).premultiply(_deltaQuat);
        }

        sb.bone.updateWorldMatrix(true, false);
        sb.currTipWorld
          .copy(restDir)
          .applyQuaternion(sb.bone.quaternion)
          .applyQuaternion(_parentWorldQuat)
          .multiplyScalar(sb.length)
          .add(_boneWorldPos);
      }
    }
  }

  // --- 2. UNIVERSAL ORIENTATION-DRIVEN GRAVITY SOLVER (CHEST + HIPS) ---
  let chestTiltDeg = 0;
  let hipsTiltDeg = 0;
  let targetHangForward = 0;
  let targetSplayBack = 0;
  let targetStandingDroop = 0;
  let targetGluteGravity = 0;

  const softnessScale = settings.enabled
    ? THREE.MathUtils.clamp(settings.weight * (0.78 + settings.floppiness * 0.35), 0, 1.15)
    : 0;

  const zSign = handle.isVrm0 ? -1 : 1;

  // A. Chest Orientation vs World Gravity (0, -1, 0)
  const chestBone = handle.bones.chest ?? handle.bones.spine ?? handle.bones.hips;
  if (chestBone) {
    chestBone.updateWorldMatrix(true, false);
    chestBone.getWorldQuaternion(_chestWorldQuat);

    _chestForwardWorld.set(0, 0, zSign).applyQuaternion(_chestWorldQuat).normalize();
    _chestDownWorld.set(0, -1, 0).applyQuaternion(_chestWorldQuat).normalize();

    const forwardDot = _chestForwardWorld.dot(WORLD_GRAVITY);
    const downDot = _chestDownWorld.dot(WORLD_GRAVITY);

    chestTiltDeg = Math.round(
      THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(forwardDot, -1, 1)))
    );

    if (settings.enabled) {
      // Leaning forward / All-Fours -> Bust hangs forward toward world down
      targetHangForward = THREE.MathUtils.clamp(
        Math.max(0, forwardDot) * softnessScale,
        0,
        1
      );
      // Lying Supine (chest facing sky) -> Bust flattens & splays laterally
      targetSplayBack = THREE.MathUtils.clamp(
        Math.max(0, -forwardDot) * softnessScale,
        0,
        1
      );
      // Standing upright -> Subtle natural teardrop gravity weight
      targetStandingDroop = THREE.MathUtils.clamp(
        Math.max(0, downDot) * softnessScale * 0.65,
        0,
        1
      );

      if (downDot < -0.2) {
        targetSplayBack = Math.min(1, targetSplayBack + Math.abs(downDot) * 0.15 * softnessScale);
      }
    }
  }

  // B. Hips Orientation vs World Gravity (0, -1, 0)
  const hipsBone = handle.bones.hips;
  if (hipsBone) {
    hipsBone.updateWorldMatrix(true, false);
    hipsBone.getWorldQuaternion(_hipsWorldQuat);

    _hipsDownWorld.set(0, -1, 0).applyQuaternion(_hipsWorldQuat).normalize();
    _hipsBackWorld.set(0, 0, -zSign).applyQuaternion(_hipsWorldQuat).normalize();

    const hipsDownDot = _hipsDownWorld.dot(WORLD_GRAVITY);
    const hipsBackDot = _hipsBackWorld.dot(WORLD_GRAVITY);

    hipsTiltDeg = Math.round(
      THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-hipsBackDot, -1, 1)))
    );

    if (settings.enabled) {
      // Standing upright or gently leaned -> gravity pulls lower glute mass subtly downward;
      // when supine (hipsBackDot > 0) glute weight presses down against the floor
      const uprightWeight = Math.max(0, hipsDownDot) * 0.72;
      const supineCompress = Math.max(0, hipsBackDot) * 0.55;
      targetGluteGravity = THREE.MathUtils.clamp(
        Math.max(uprightWeight, supineCompress) * softnessScale,
        0,
        1
      );
    }
  }

  const responseSpeed = 7 + (1 - settings.damping) * 8;
  const alpha = 1 - Math.exp(-responseSpeed * dt);

  runtime.currentHangForward = THREE.MathUtils.lerp(
    runtime.currentHangForward,
    targetHangForward,
    alpha
  );
  runtime.currentSplayBack = THREE.MathUtils.lerp(
    runtime.currentSplayBack,
    targetSplayBack,
    alpha
  );
  runtime.currentStandingDroop = THREE.MathUtils.lerp(
    runtime.currentStandingDroop,
    targetStandingDroop,
    alpha
  );
  runtime.currentGluteGravity = THREE.MathUtils.lerp(
    runtime.currentGluteGravity,
    targetGluteGravity,
    alpha
  );

  applyMorphByAliases(
    handle.meshes,
    ['chest_hang_forward', 'chesthangforward', 'bust_hang', 'breast_hang'],
    runtime.currentHangForward
  );
  applyMorphByAliases(
    handle.meshes,
    ['chest_splay_back', 'chestsplayback', 'bust_splay_back', 'breast_supine'],
    runtime.currentSplayBack
  );
  applyMorphByAliases(
    handle.meshes,
    ['chest_standing_droop', 'cheststandingdroop'],
    runtime.currentStandingDroop
  );
  applyMorphByAliases(
    handle.meshes,
    ['glute_gravity_drop', 'glutegravitydrop'],
    runtime.currentGluteGravity
  );

  return {
    chestTiltDeg,
    hipsTiltDeg,
    hangForward: Math.round(runtime.currentHangForward * 100),
    splayBack: Math.round(runtime.currentSplayBack * 100),
    standingDroop: Math.round(runtime.currentStandingDroop * 100),
    gluteGravity: Math.round(runtime.currentGluteGravity * 100),
    springBoneCount,
  };
}
