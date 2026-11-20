import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import {
  BodyBoneName,
  CharacterState,
  IKHandleType,
  MAJOR_JOINTS,
  Vec3Tuple,
  VrmBoneName,
} from '../../types/pose';
import { useStudioStore } from '../../store/useStudioStore';
import {
  applyMaterialStyle,
  extractMorphTargetDescriptors,
  loadMannequinModel,
} from '../../engine/modelLoader';
import { RiggedMannequinHandle } from '../../engine/proceduralMannequin';
import {
  ALL_VRM_BONES,
  degTupleToQuaternion,
  quaternionToDegTuple,
} from '../../engine/poseUtils';
import {
  solveHeadLookAtIK,
  solveLimbIK,
  solvePinnedFeetToFloor,
} from '../../engine/ikSolver';
import {
  createPhysicsRuntimeState,
  resetSpringBones,
  stepHybridPhysics,
  triggerSpringImpulse,
} from '../../engine/physicsEngine';
import { sceneRegistry } from '../../engine/sceneRegistry';
import { snapFeetToSurface, snapHipsToSurface } from '../../engine/surfaceSnap';
import { updateFaceAndHairRig } from '../../engine/faceAndHairEngine';

interface MannequinRigProps {
  character: CharacterState;
  isActive: boolean;
}

const IK_HANDLES: Array<{
  type: IKHandleType;
  label: string;
  color: string;
}> = [
  { type: 'leftHand', label: 'L Hand', color: '#38bdf8' },
  { type: 'rightHand', label: 'R Hand', color: '#38bdf8' },
  { type: 'leftFoot', label: 'L Foot', color: '#f59e0b' },
  { type: 'rightFoot', label: 'R Foot', color: '#f59e0b' },
  { type: 'hips', label: 'Hips', color: '#a855f7' },
  { type: 'head', label: 'Head Aim', color: '#34d399' },
];

function getErgonomicGizmoSize(base: number): number {
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return Math.min(1.05, base + 0.18);
  }
  return base;
}

export const MannequinRig: React.FC<MannequinRigProps> = ({
  character,
  isActive,
}) => {
  const materialMode = useStudioStore((s) => s.materialMode);
  const celThreshold = useStudioStore((s) => s.celThreshold);
  const selectedBone = useStudioStore((s) => s.selectedBone);
  const selectedIKHandle = useStudioStore((s) => s.selectedIKHandle);
  const wholeModelGizmoMode = useStudioStore((s) => s.wholeModelGizmoMode);
  const showJointMarkers = useStudioStore((s) => s.showJointMarkers);
  const showIKHandles = useStudioStore((s) => s.showIKHandles);
  const isExporting = useStudioStore((s) => s.isExporting);
  const physicsImpulseNonce = useStudioStore((s) => s.physicsImpulseNonce);
  const surfaceSnapRequest = useStudioStore((s) => s.surfaceSnapRequest);

  const selectBone = useStudioStore((s) => s.selectBone);
  const selectIKHandle = useStudioStore((s) => s.selectIKHandle);
  const setActiveCharacter = useStudioStore((s) => s.setActiveCharacter);
  const setIsDraggingControl = useStudioStore((s) => s.setIsDraggingControl);
  const setCharacterStageTransform = useStudioStore(
    (s) => s.setCharacterStageTransform
  );
  const updateCharacterBones = useStudioStore((s) => s.updateCharacterBones);
  const setAvailableMorphs = useStudioStore((s) => s.setAvailableMorphs);
  const setCharacterModelMeta = useStudioStore((s) => s.setCharacterModelMeta);
  const setPhysicsTelemetry = useStudioStore((s) => s.setPhysicsTelemetry);
  const clearSurfaceSnapRequest = useStudioStore((s) => s.clearSurfaceSnapRequest);
  const pushHistory = useStudioStore((s) => s.pushHistory);
  const showToast = useStudioStore((s) => s.showToast);

  const [handle, setHandle] = useState<RiggedMannequinHandle | null>(null);
  const stageGroupRef = useRef<THREE.Group>(null);
  const physicsRuntimeRef = useRef(createPhysicsRuntimeState());

  // Proxy groups for interactive markers (visual dot + generous invisible touch hit-sphere)
  const jointMarkerRefs = useRef<Partial<Record<BodyBoneName, THREE.Group | null>>>({});
  const ikMarkerRefs = useRef<Partial<Record<IKHandleType, THREE.Group | null>>>({});
  const ikProxyObj = useMemo(() => new THREE.Object3D(), []);
  const isDraggingLocalRef = useRef(false);
  const lastTelemetryTimeRef = useRef(0);

  // Foot floor pin anchors
  const footPinsRef = useRef<{
    left: THREE.Vector3;
    right: THREE.Vector3;
    active: boolean;
  }>({
    left: new THREE.Vector3(0.1, 0.065, 0),
    right: new THREE.Vector3(-0.1, 0.065, 0),
    active: false,
  });

  // SLERP pose interpolation state
  const slerpRef = useRef<{
    active: boolean;
    t: number;
    duration: number;
    lastPoseVersion: number;
    fromQuats: Partial<Record<VrmBoneName, THREE.Quaternion>>;
    toQuats: Partial<Record<VrmBoneName, THREE.Quaternion>>;
    fromHipsPos: THREE.Vector3;
    toHipsPos: THREE.Vector3;
  }>({
    active: false,
    t: 1,
    duration: 0.36,
    lastPoseVersion: -1,
    fromQuats: {},
    toQuats: {},
    fromHipsPos: new THREE.Vector3(),
    toHipsPos: new THREE.Vector3(),
  });

  // --- 1. Load Mannequin Model (VRM / GLB / Procedural Archetype Fallback) ---
  useEffect(() => {
    let cancelled = false;
    let loadedHandle: RiggedMannequinHandle | null = null;

    loadMannequinModel(character.modelPreset, character.customModelUrl)
      .then((h) => {
        if (cancelled) {
          h.dispose();
          return;
        }
        loadedHandle = h;
        setHandle(h);
        sceneRegistry.registerCharacter(character.id, h, stageGroupRef.current);

        const morphs = extractMorphTargetDescriptors(h.meshes);
        setAvailableMorphs(character.id, morphs);
        setCharacterModelMeta(character.id, h.sourceType, h.detectedFingerBoneCount);

        applyImmediatePose(h, character);
        slerpRef.current.lastPoseVersion = character.poseVersion;
        resetSpringBones(h);
      })
      .catch((err) => {
        console.error('Failed to load mannequin:', err);
        showToast('Could not load custom model; check console');
      });

    return () => {
      cancelled = true;
      if (loadedHandle) {
        sceneRegistry.unregisterCharacter(character.id, loadedHandle);
        loadedHandle.dispose();
      }
      setHandle(null);
    };
  }, [character.modelPreset, character.customModelUrl, character.id]);

  // --- 2. Apply Matte Clay vs Cel-Shaded Material ---
  useEffect(() => {
    if (!handle) return;
    const tint =
      character.id === 'char-2'
        ? '#bec4d2'
        : character.modelPreset === 'anime-male' ||
          character.modelPreset === 'realistic-male'
        ? '#c7c8ce'
        : '#d0cecc';
    const cleanup = applyMaterialStyle(handle, materialMode, celThreshold, tint);
    return cleanup;
  }, [handle, materialMode, celThreshold, character.id, character.modelPreset]);

  // --- 3. Trigger SLERP when Pose Preset / Hand Preset / Mirror / Undo-Redo fires ---
  useEffect(() => {
    if (!handle) return;
    if (slerpRef.current.lastPoseVersion === character.poseVersion) return;

    const fromQuats: Partial<Record<VrmBoneName, THREE.Quaternion>> = {};
    const toQuats: Partial<Record<VrmBoneName, THREE.Quaternion>> = {};
    for (const bName of ALL_VRM_BONES) {
      const bone = handle.bones[bName];
      if (!bone) continue;
      fromQuats[bName] = bone.quaternion.clone();
      const targetDeg = character.bones[bName] ?? [0, 0, 0];
      toQuats[bName] = degTupleToQuaternion(
        targetDeg,
        new THREE.Quaternion(),
        handle.isVrm0
      );
    }

    const hipsSign = handle.isVrm0 ? -1 : 1;
    const hipsBone = handle.bones.hips;
    const fromHipsPos = hipsBone
      ? hipsBone.position.clone()
      : new THREE.Vector3(0, handle.restHipsY, 0);
    const toHipsPos = new THREE.Vector3(
      hipsSign * character.hipsPosition[0],
      handle.restHipsY + character.hipsPosition[1],
      hipsSign * character.hipsPosition[2]
    );

    slerpRef.current = {
      active: true,
      t: 0,
      duration: 0.34,
      lastPoseVersion: character.poseVersion,
      fromQuats,
      toQuats,
      fromHipsPos,
      toHipsPos,
    };
  }, [handle, character.poseVersion, character.bones, character.hipsPosition]);

  // --- 4. Handle Surface Raycast Snapping (Snap Feet / Snap Hips to Surface) ---
  useEffect(() => {
    if (!handle || !surfaceSnapRequest || surfaceSnapRequest.charId !== character.id) {
      return;
    }

    slerpRef.current.active = false;
    handle.root.updateMatrixWorld(true);

    if (surfaceSnapRequest.mode === 'feet') {
      const res = snapFeetToSurface(handle);
      if (res) {
        updateCharacterBones(character.id, res.bones, res.hipsPosition);
        pushHistory();
        const elevCm = Math.round(res.hitElevation * 100);
        showToast(
          elevCm > 1
            ? `Snapped feet to prop surface (+${elevCm}cm)`
            : 'Snapped feet cleanly to studio floor'
        );
      }
    } else if (surfaceSnapRequest.mode === 'hips') {
      const res = snapHipsToSurface(handle);
      if (res) {
        updateCharacterBones(character.id, {}, res.hipsPosition);
        pushHistory();
        const elevCm = Math.round(res.hitElevation * 100);
        showToast(
          elevCm > 1
            ? `Snapped hips onto surface (+${elevCm}cm)`
            : 'Snapped hips to floor surface'
        );
      }
    }

    clearSurfaceSnapRequest();
  }, [
    handle,
    surfaceSnapRequest,
    character.id,
    updateCharacterBones,
    pushHistory,
    showToast,
    clearSurfaceSnapRequest,
  ]);

  // --- 5. Record Foot Pin Positions when Pin Foot to Floor is toggled ON ---
  useEffect(() => {
    if (!handle) return;
    if (character.pinFeetToFloor) {
      handle.root.updateMatrixWorld(true);
      const lf = handle.bones.leftFoot;
      const rf = handle.bones.rightFoot;
      if (lf) {
        lf.getWorldPosition(footPinsRef.current.left);
        footPinsRef.current.left.y = handle.footSoleOffset;
      }
      if (rf) {
        rf.getWorldPosition(footPinsRef.current.right);
        footPinsRef.current.right.y = handle.footSoleOffset;
      }
      footPinsRef.current.active = true;
    } else {
      footPinsRef.current.active = false;
    }
  }, [handle, character.pinFeetToFloor]);

  // --- 6. Spring Bounce Impulse Trigger ---
  useEffect(() => {
    if (!handle || !isActive || physicsImpulseNonce === 0) return;
    triggerSpringImpulse(handle, physicsRuntimeRef.current);
  }, [handle, isActive, physicsImpulseNonce]);

  // --- 7. Sync IK Proxy position when selecting an IK Handle ---
  useEffect(() => {
    if (!handle || !isActive || !selectedIKHandle) return;
    handle.root.updateMatrixWorld(true);
    const wp = computeIKHandleWorldPos(handle, selectedIKHandle);
    ikProxyObj.position.copy(wp);
    ikProxyObj.updateMatrixWorld(true);
  }, [handle, isActive, selectedIKHandle, ikProxyObj]);

  function applyImmediatePose(h: RiggedMannequinHandle, c: CharacterState) {
    for (const bName of ALL_VRM_BONES) {
      const bone = h.bones[bName];
      if (!bone) continue;
      const deg = c.bones[bName] ?? [0, 0, 0];
      degTupleToQuaternion(deg, bone.quaternion, h.isVrm0);
    }
    const hipsSign = h.isVrm0 ? -1 : 1;
    if (h.bones.hips) {
      h.bones.hips.position.set(
        hipsSign * c.hipsPosition[0],
        h.restHipsY + c.hipsPosition[1],
        hipsSign * c.hipsPosition[2]
      );
    }
    h.vrm?.humanoid?.update?.();
    h.root.updateMatrixWorld(true);
  }

  function computeIKHandleWorldPos(
    h: RiggedMannequinHandle,
    type: IKHandleType,
    out = new THREE.Vector3()
  ): THREE.Vector3 {
    if (type === 'head') {
      const head = h.bones.head;
      if (head) {
        head.getWorldPosition(out);
        const q = new THREE.Quaternion();
        head.getWorldQuaternion(q);
        const zSign = h.isVrm0 ? -1 : 1;
        const forwardOffset = new THREE.Vector3(0, 0.08, zSign * 0.36).applyQuaternion(q);
        out.add(forwardOffset);
      }
      return out;
    }
    const bone = h.bones[type];
    if (bone) {
      bone.getWorldPosition(out);
    }
    return out;
  }

  // --- 8. Per-Frame Animation, Morphs, Physics & Marker Tracking ---
  const _tmpVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (!handle) return;

    const latestChar = useStudioStore
      .getState()
      .characters.find((c) => c.id === character.id);
    if (!latestChar) return;

    const slerp = slerpRef.current;
    if (slerp.active) {
      slerp.t = Math.min(1, slerp.t + delta / slerp.duration);
      const ease = 1 - Math.pow(1 - slerp.t, 3);
      for (const bName of ALL_VRM_BONES) {
        const bone = handle.bones[bName];
        const fq = slerp.fromQuats[bName];
        const tq = slerp.toQuats[bName];
        if (bone && fq && tq) {
          bone.quaternion.slerpQuaternions(fq, tq, ease);
        }
      }
      if (handle.bones.hips) {
        handle.bones.hips.position.lerpVectors(
          slerp.fromHipsPos,
          slerp.toHipsPos,
          ease
        );
      }
      if (slerp.t >= 1) {
        slerp.active = false;
      }
    } else if (!isDraggingLocalRef.current) {
      for (const bName of ALL_VRM_BONES) {
        const bone = handle.bones[bName];
        if (!bone) continue;
        const deg = latestChar.bones[bName] ?? [0, 0, 0];
        degTupleToQuaternion(deg, bone.quaternion, handle.isVrm0);
      }
      const hipsSign = handle.isVrm0 ? -1 : 1;
      if (handle.bones.hips) {
        handle.bones.hips.position.set(
          hipsSign * latestChar.hipsPosition[0],
          handle.restHipsY + latestChar.hipsPosition[1],
          hipsSign * latestChar.hipsPosition[2]
        );
      }
    }
    handle.vrm?.humanoid?.update?.();

    // Apply Anatomical Proportion Morph Targets smoothly (strictly morphTargetInfluences, never scaling bones)
    const morphAlpha = Math.min(1, delta * 9.5);
    for (const mesh of handle.meshes) {
      const dict = mesh.morphTargetDictionary;
      const infl = mesh.morphTargetInfluences;
      if (!dict || !infl) continue;

      for (const [key, idx] of Object.entries(dict)) {
        const lower = key.toLowerCase();
        if (
          lower.includes('hang_forward') ||
          lower.includes('splay_back') ||
          lower.includes('standing_droop') ||
          lower.includes('gravity_drop')
        ) {
          continue;
        }
        // Mirror Bust_Volume -> Bust_Fullness and Hip_Thigh_Width -> Hip_Width on procedural detail meshes
        let targetVal = latestChar.morphs[key];
        if (targetVal === undefined && key === 'Bust_Fullness') {
          targetVal = latestChar.morphs['Bust_Volume'] ?? 0;
        } else if (targetVal === undefined && key === 'Hip_Width') {
          targetVal = latestChar.morphs['Hip_Thigh_Width'] ?? 0;
        }
        infl[idx] = THREE.MathUtils.lerp(infl[idx], targetVal ?? 0, morphAlpha);
      }
    }

    // Step Hybrid Gravity & Softness Physics
    const telemetry = stepHybridPhysics(
      handle,
      latestChar.physics,
      physicsRuntimeRef.current,
      delta
    );

    // Step Facial Features (Gaze, Blink, Brows, Mouth) & Hair Style / Wind Flow
    updateFaceAndHairRig(handle, latestChar.face, latestChar.hair);

    const now = state.clock.elapsedTime;
    if (isActive && now - lastTelemetryTimeRef.current > 0.12) {
      lastTelemetryTimeRef.current = now;
      setPhysicsTelemetry(character.id, telemetry);
    }

    // Update 3D Joint Marker & IK Handle positions
    if (isActive && !isExporting) {
      handle.root.updateMatrixWorld(true);

      if (showJointMarkers) {
        for (const jName of MAJOR_JOINTS) {
          const marker = jointMarkerRefs.current[jName];
          const bone = handle.bones[jName];
          if (marker && bone) {
            bone.getWorldPosition(_tmpVec);
            marker.position.copy(_tmpVec);
          }
        }
      }

      if (showIKHandles) {
        for (const ik of IK_HANDLES) {
          const marker = ikMarkerRefs.current[ik.type];
          if (!marker) continue;
          if (selectedIKHandle === ik.type && isDraggingLocalRef.current) {
            marker.position.copy(ikProxyObj.position);
          } else {
            computeIKHandleWorldPos(handle, ik.type, _tmpVec);
            marker.position.copy(_tmpVec);
            if (selectedIKHandle === ik.type && !isDraggingLocalRef.current) {
              ikProxyObj.position.copy(_tmpVec);
            }
          }
        }
      }
    }
  });

  // --- Handlers for Rotation Gizmo (FK Joint) ---
  const handleFKDragStart = () => {
    isDraggingLocalRef.current = true;
    slerpRef.current.active = false;
    setIsDraggingControl(true);
  };

  const handleFKObjectChange = () => {
    if (!handle || !selectedBone) return;
    const bone = handle.bones[selectedBone];
    if (!bone) return;
    const deg = quaternionToDegTuple(bone.quaternion, handle.isVrm0);
    const updates = { [selectedBone]: deg };

    if (
      character.pinFeetToFloor &&
      footPinsRef.current.active &&
      (selectedBone === 'hips' || selectedBone === 'spine')
    ) {
      handle.root.updateMatrixWorld(true);
      const footFix = solvePinnedFeetToFloor(
        handle,
        footPinsRef.current.left,
        footPinsRef.current.right
      );
      Object.assign(updates, footFix);
    }
    updateCharacterBones(character.id, updates);
  };

  const handleFKDragEnd = () => {
    isDraggingLocalRef.current = false;
    setIsDraggingControl(false);
    pushHistory();
  };

  // --- Handlers for IK Translate Gizmo ---
  const handleIKDragStart = () => {
    isDraggingLocalRef.current = true;
    slerpRef.current.active = false;
    setIsDraggingControl(true);

    if (handle && selectedIKHandle === 'hips' && character.pinFeetToFloor) {
      handle.root.updateMatrixWorld(true);
      const lf = handle.bones.leftFoot;
      const rf = handle.bones.rightFoot;
      if (lf) {
        lf.getWorldPosition(footPinsRef.current.left);
        footPinsRef.current.left.y = handle.footSoleOffset;
      }
      if (rf) {
        rf.getWorldPosition(footPinsRef.current.right);
        footPinsRef.current.right.y = handle.footSoleOffset;
      }
      footPinsRef.current.active = true;
    }
  };

  const handleIKObjectChange = () => {
    if (!handle || !selectedIKHandle) return;
    const targetWorld = ikProxyObj.position.clone();

    if (selectedIKHandle === 'hips') {
      const hips = handle.bones.hips;
      if (!hips || !hips.parent) return;
      hips.parent.updateWorldMatrix(true, false);
      const localTarget = hips.parent.worldToLocal(targetWorld.clone());
      localTarget.y = Math.max(0.08, localTarget.y);
      hips.position.copy(localTarget);
      handle.root.updateMatrixWorld(true);

      const hipsSign = handle.isVrm0 ? -1 : 1;
      const hipsOffset: Vec3Tuple = [
        Math.round(hipsSign * localTarget.x * 1000) / 1000,
        Math.round((localTarget.y - handle.restHipsY) * 1000) / 1000,
        Math.round(hipsSign * localTarget.z * 1000) / 1000,
      ];

      let legUpdates = {};
      if (character.pinFeetToFloor && footPinsRef.current.active) {
        legUpdates = solvePinnedFeetToFloor(
          handle,
          footPinsRef.current.left,
          footPinsRef.current.right
        );
      }
      updateCharacterBones(character.id, legUpdates, hipsOffset);
    } else if (selectedIKHandle === 'head') {
      const headUpdates = solveHeadLookAtIK(handle, targetWorld);
      if (Object.keys(headUpdates).length > 0) {
        updateCharacterBones(character.id, headUpdates);
      }
    } else {
      if (
        character.pinFeetToFloor &&
        (selectedIKHandle === 'leftFoot' || selectedIKHandle === 'rightFoot')
      ) {
        targetWorld.y = Math.max(handle.footSoleOffset, targetWorld.y);
        if (selectedIKHandle === 'leftFoot') {
          footPinsRef.current.left.copy(targetWorld);
        } else {
          footPinsRef.current.right.copy(targetWorld);
        }
      }
      const updates = solveLimbIK(handle, selectedIKHandle, targetWorld);
      if (Object.keys(updates).length > 0) {
        updateCharacterBones(character.id, updates);
      }
    }
  };

  const handleIKDragEnd = () => {
    isDraggingLocalRef.current = false;
    setIsDraggingControl(false);
    pushHistory();
  };

  // Sync stageGroupRef transform from store when not actively dragging whole-model gizmo
  useEffect(() => {
    const g = stageGroupRef.current;
    if (!g || isDraggingLocalRef.current) return;
    g.position.set(
      character.stagePosition[0],
      character.stagePosition[1],
      character.stagePosition[2]
    );
    g.rotation.set(
      THREE.MathUtils.degToRad(character.stageRotation[0]),
      THREE.MathUtils.degToRad(character.stageRotation[1]),
      THREE.MathUtils.degToRad(character.stageRotation[2]),
      'YXZ'
    );
  }, [character.stagePosition, character.stageRotation]);

  // --- Handlers for Whole-Model Stage Gizmo ---
  const handleStageDragStart = () => {
    isDraggingLocalRef.current = true;
    setIsDraggingControl(true);
  };

  const handleStageObjectChange = () => {
    const g = stageGroupRef.current;
    if (!g) return;
    const pos: Vec3Tuple = [
      Math.round(g.position.x * 1000) / 1000,
      Math.round(g.position.y * 1000) / 1000,
      Math.round(g.position.z * 1000) / 1000,
    ];
    const euler = new THREE.Euler().setFromQuaternion(g.quaternion, 'YXZ');
    const rot: Vec3Tuple = [
      Math.round(THREE.MathUtils.radToDeg(euler.x) * 10) / 10,
      Math.round(THREE.MathUtils.radToDeg(euler.y) * 10) / 10,
      Math.round(THREE.MathUtils.radToDeg(euler.z) * 10) / 10,
    ];
    setCharacterStageTransform(character.id, pos, rot[1], rot);
  };

  const handleStageDragEnd = () => {
    isDraggingLocalRef.current = false;
    setIsDraggingControl(false);
    pushHistory();
  };

  const activeBoneObject =
    isActive && selectedBone && handle ? handle.bones[selectedBone] ?? null : null;
  const isWholeModelActive = isActive && wholeModelGizmoMode !== 'none' && !isExporting;

  return (
    <>
      <group
        ref={stageGroupRef}
        onClick={(e) => {
          if (!isActive) {
            e.stopPropagation();
            setActiveCharacter(character.id);
          }
        }}
      >
        {handle && <primitive object={handle.root} />}

        {/* Glowing Floor Turntable Ring when Whole-Model Transform is active */}
        {isWholeModelActive && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[0.42, 0.48, 48]} />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.75}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}
      </group>

      {/* World-space IK Proxy Object */}
      <primitive object={ikProxyObj} />

      {/* Touch-Friendly FK Joint Hotspots with Generous Invisible Hit-Spheres */}
      {handle && isActive && showJointMarkers && !isWholeModelActive && !isExporting && (
        <group>
          {MAJOR_JOINTS.map((jName) => {
            if (!handle.bones[jName]) return null;
            const isSel = selectedBone === jName;
            return (
              <group
                key={jName}
                ref={(el) => {
                  jointMarkerRefs.current[jName] = el;
                }}
              >
                {/* Generous invisible touch hit-sphere for mobile thumb/stylus ergonomics */}
                <mesh
                  renderOrder={19}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectBone(isSel ? null : jName);
                  }}
                >
                  <sphereGeometry args={[0.068, 12, 12]} />
                  <meshBasicMaterial
                    transparent
                    opacity={0}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
                {/* Crisp visual joint marker */}
                <mesh renderOrder={20}>
                  <sphereGeometry args={[isSel ? 0.036 : 0.023, 14, 14]} />
                  <meshBasicMaterial
                    color={isSel ? '#a5b4fc' : '#6366f1'}
                    transparent
                    opacity={isSel ? 0.96 : 0.65}
                    depthTest={false}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
      )}

      {/* Touch-Friendly IK Drag Handles with Generous Invisible Hit-Spheres */}
      {handle && isActive && showIKHandles && !isWholeModelActive && !isExporting && (
        <group>
          {IK_HANDLES.map((ik) => {
            const isSel = selectedIKHandle === ik.type;
            return (
              <group
                key={ik.type}
                ref={(el) => {
                  ikMarkerRefs.current[ik.type] = el;
                }}
              >
                {/* Generous invisible touch target */}
                <mesh
                  renderOrder={24}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectIKHandle(isSel ? null : ik.type);
                  }}
                >
                  <sphereGeometry args={[0.088, 12, 12]} />
                  <meshBasicMaterial
                    transparent
                    opacity={0}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
                {/* Crisp diamond handle */}
                <mesh renderOrder={25}>
                  <octahedronGeometry args={[isSel ? 0.056 : 0.044, 0]} />
                  <meshBasicMaterial
                    color={isSel ? '#ffffff' : ik.color}
                    transparent
                    opacity={isSel ? 0.98 : 0.82}
                    depthTest={false}
                    wireframe={!isSel}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
      )}

      {/* 3D Rotation Gizmo for Selected FK Joint (mobile-ergonomic size) */}
      {activeBoneObject && isActive && !isExporting && (
        <TransformControls
          object={activeBoneObject}
          mode="rotate"
          space="local"
          size={getErgonomicGizmoSize(0.82)}
          onMouseDown={handleFKDragStart}
          onObjectChange={handleFKObjectChange}
          onMouseUp={handleFKDragEnd}
        />
      )}

      {/* 3D Translation Gizmo for Selected IK Handle (mobile-ergonomic size) */}
      {handle && isActive && selectedIKHandle && !isExporting && (
        <TransformControls
          object={ikProxyObj}
          mode="translate"
          space="world"
          size={getErgonomicGizmoSize(0.8)}
          onMouseDown={handleIKDragStart}
          onObjectChange={handleIKObjectChange}
          onMouseUp={handleIKDragEnd}
        />
      )}
      {/* World-Space Whole-Model Rotate / Move Gizmo */}
      {isWholeModelActive && stageGroupRef.current && (
        <TransformControls
          object={stageGroupRef.current}
          mode={wholeModelGizmoMode === 'translate' ? 'translate' : 'rotate'}
          space="world"
          size={getErgonomicGizmoSize(0.98)}
          onMouseDown={handleStageDragStart}
          onObjectChange={handleStageObjectChange}
          onMouseUp={handleStageDragEnd}
        />
      )}
    </>
  );
};
