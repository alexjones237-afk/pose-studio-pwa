import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PropAttachTarget, PropItem, Vec3Tuple } from '../../types/pose';
import { useStudioStore } from '../../store/useStudioStore';
import { sceneRegistry } from '../../engine/sceneRegistry';
import { createCelGradientTexture } from '../../engine/modelLoader';

interface PropObjectProps {
  prop: PropItem;
  isSelected: boolean;
}

function getGizmoSize(): number {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? 0.96 : 0.82;
}

/**
 * Renders a scalable studio prop (Box, Cylinder, Chair, Couch, Table, Steps, or imported .glb),
 * supporting:
 *  - Smart palm-centered bone snapping & fine local in-hand offset/rotation adjustments
 *  - Parenting to mannequin bones, whole mannequin base, OR other props (e.g. Cup on Table)
 *  - Downward Raycaster surface detection for unattached stage props
 */
export const PropObject: React.FC<PropObjectProps> = ({ prop, isSelected }) => {
  const { scene } = useThree();
  const materialMode = useStudioStore((s) => s.materialMode);
  const celThreshold = useStudioStore((s) => s.celThreshold);
  const propGizmoMode = useStudioStore((s) => s.propGizmoMode);
  const isExporting = useStudioStore((s) => s.isExporting);
  const selectProp = useStudioStore((s) => s.selectProp);
  const updateProp = useStudioStore((s) => s.updateProp);
  const setIsDraggingControl = useStudioStore((s) => s.setIsDraggingControl);

  const propGroup = useMemo(() => {
    const g = new THREE.Group();
    g.name = `Prop_${prop.id}`;
    return g;
  }, [prop.id]);

  const isDraggingRef = useRef(false);
  const [customGlbScene, setCustomGlbScene] = useState<THREE.Group | null>(null);

  const isBoneAttached =
    prop.attachedBone !== 'none' &&
    prop.attachedBone !== 'character-root' &&
    Boolean(prop.attachedCharacterId);

  // Load custom .glb prop if applicable
  useEffect(() => {
    if (prop.kind !== 'custom-glb' || !prop.customUrl) {
      setCustomGlbScene(null);
      return;
    }
    let cancelled = false;
    const loader = new GLTFLoader();
    loader
      .loadAsync(prop.customUrl)
      .then((gltf) => {
        if (cancelled) return;
        const container = new THREE.Group();
        const model = gltf.scene;
        model.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            if (m.geometry && !m.geometry.getAttribute('normal')) {
              m.geometry.computeVertexNormals();
            }
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const normScale = 1 / maxDim;
        model.scale.setScalar(normScale);
        model.position.set(
          -center.x * normScale,
          -box.min.y * normScale,
          -center.z * normScale
        );
        container.add(model);
        setCustomGlbScene(container);
      })
      .catch((err) => {
        console.error('Failed to load custom GLB prop:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [prop.kind, prop.customUrl]);

  // Mount propGroup into scene on init and clean up on unmount
  useEffect(() => {
    if (!propGroup.parent) {
      scene.add(propGroup);
    }
    return () => {
      sceneRegistry.unregisterProp(prop.id);
      if (propGroup.parent) {
        propGroup.parent.remove(propGroup);
      }
    };
  }, [propGroup, scene, prop.id]);

  // Keep hierarchical parent (Bone, Character Root, Another Prop, or World Scene) synced every frame
  useFrame(() => {
    let targetParent: THREE.Object3D = scene;

    let isVrm0Bone = false;

    if (prop.parentPropId) {
      const parentObj = sceneRegistry.getPropObject(prop.parentPropId);
      if (parentObj && parentObj !== propGroup) {
        targetParent = parentObj;
      }
    } else if (prop.attachedCharacterId && prop.attachedBone !== 'none') {
      if (prop.attachedBone === 'character-root') {
        const stageGrp = sceneRegistry.getCharacterStageGroup(
          prop.attachedCharacterId
        );
        if (stageGrp) targetParent = stageGrp;
      } else {
        const charHandle = sceneRegistry.getCharacter(prop.attachedCharacterId);
        const bone =
          charHandle?.bones[
            prop.attachedBone as Exclude<
              PropAttachTarget,
              'none' | 'character-root'
            >
          ];
        if (bone) {
          targetParent = bone;
          isVrm0Bone = Boolean(charHandle?.isVrm0);
        }
      }
    }

    if (propGroup.parent !== targetParent) {
      targetParent.add(propGroup);
    }

    if (!isDraggingRef.current) {
      const sign = isVrm0Bone ? -1 : 1;
      propGroup.position.set(
        sign * prop.position[0],
        prop.position[1],
        sign * prop.position[2]
      );
      propGroup.rotation.set(
        THREE.MathUtils.degToRad(prop.rotation[0]),
        THREE.MathUtils.degToRad(prop.rotation[1]),
        THREE.MathUtils.degToRad(prop.rotation[2]),
        'XYZ'
      );
    }

    sceneRegistry.registerProp(prop.id, propGroup, isBoneAttached);
  });

  // Studio matte clay / cel material for architectural primitives
  const { primaryMat, accentMat, disposeMat } = useMemo(() => {
    const celTex = materialMode === 'cel' ? createCelGradientTexture(celThreshold) : null;
    const baseColor = isSelected && !isExporting ? '#5a6085' : prop.color;
    const trimColor = isSelected && !isExporting ? '#7379a6' : '#2d303f';

    const pMat =
      materialMode === 'cel'
        ? new THREE.MeshToonMaterial({ color: baseColor, gradientMap: celTex })
        : new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: 0.82,
            metalness: 0.04,
          });

    const aMat =
      materialMode === 'cel'
        ? new THREE.MeshToonMaterial({ color: trimColor, gradientMap: celTex })
        : new THREE.MeshStandardMaterial({
            color: trimColor,
            roughness: 0.72,
            metalness: 0.08,
          });

    return {
      primaryMat: pMat,
      accentMat: aMat,
      disposeMat: () => {
        pMat.dispose();
        aMat.dispose();
        celTex?.dispose();
      },
    };
  }, [materialMode, celThreshold, prop.color, isSelected, isExporting]);

  useEffect(() => disposeMat, [disposeMat]);

  const [w, h, d] = prop.dimensions;

  const renderPrimitiveContent = () => {
    switch (prop.kind) {
      case 'box':
        return (
          <mesh position={[0, h / 2, 0]} material={primaryMat} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
          </mesh>
        );

      case 'cylinder':
        return (
          <mesh
            position={[0, h / 2, 0]}
            scale={[1, 1, d / Math.max(0.01, w)]}
            material={primaryMat}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[w / 2, w / 2, h, 28]} />
          </mesh>
        );

      case 'chair': {
        const seatH = h * 0.48;
        const seatThick = Math.min(0.065, h * 0.08);
        const legW = Math.min(0.05, w * 0.1);
        const legH = seatH - seatThick;
        const backH = h - seatH;
        const backThick = Math.min(0.06, d * 0.13);
        const lx = w / 2 - legW * 0.65;
        const lz = d / 2 - legW * 0.65;
        return (
          <group>
            <mesh
              position={[0, seatH - seatThick / 2, 0]}
              material={primaryMat}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[w, seatThick, d]} />
            </mesh>
            <mesh
              position={[0, seatH + backH / 2, -d / 2 + backThick / 2]}
              material={primaryMat}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[w, backH, backThick]} />
            </mesh>
            {[
              [lx, lz],
              [-lx, lz],
              [lx, -lz],
              [-lx, -lz],
            ].map(([x, z], i) => (
              <mesh
                key={i}
                position={[x, legH / 2, z]}
                material={accentMat}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[legW, legH, legW]} />
              </mesh>
            ))}
          </group>
        );
      }

      case 'couch': {
        const seatH = h * 0.46;
        const baseH = seatH * 0.45;
        const cushionH = seatH - baseH;
        const armW = Math.min(0.18, w * 0.14);
        const armH = h * 0.68;
        const backThick = Math.min(0.2, d * 0.24);
        const innerW = Math.max(0.2, w - armW * 2);
        return (
          <group>
            <mesh
              position={[0, baseH / 2, 0]}
              material={accentMat}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[w, baseH, d]} />
            </mesh>
            <mesh
              position={[0, baseH + cushionH / 2, backThick * 0.35]}
              material={primaryMat}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[innerW, cushionH, Math.max(0.15, d - backThick * 0.7)]} />
            </mesh>
            <mesh
              position={[0, h / 2, -d / 2 + backThick / 2]}
              material={primaryMat}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[w, h, backThick]} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * (w / 2 - armW / 2), armH / 2, 0]}
                material={primaryMat}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[armW, armH, d]} />
              </mesh>
            ))}
          </group>
        );
      }

      case 'table': {
        const topThick = Math.min(0.06, h * 0.09);
        const legW = Math.min(0.06, Math.min(w, d) * 0.09);
        const legH = Math.max(0.05, h - topThick);
        const lx = w / 2 - legW * 0.9;
        const lz = d / 2 - legW * 0.9;
        return (
          <group>
            <mesh
              position={[0, h - topThick / 2, 0]}
              material={primaryMat}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[w, topThick, d]} />
            </mesh>
            {[
              [lx, lz],
              [-lx, lz],
              [lx, -lz],
              [-lx, -lz],
            ].map(([x, z], i) => (
              <mesh
                key={i}
                position={[x, legH / 2, z]}
                material={accentMat}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[legW, legH, legW]} />
              </mesh>
            ))}
          </group>
        );
      }

      case 'steps': {
        const tierCount = 3;
        const stepDepth = d / tierCount;
        return (
          <group>
            {[0, 1, 2].map((i) => {
              const tierH = ((i + 1) / tierCount) * h;
              const tierZ = d / 2 - stepDepth * (i + 0.5);
              return (
                <mesh
                  key={i}
                  position={[0, tierH / 2, tierZ]}
                  material={i % 2 === 0 ? primaryMat : accentMat}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[w, tierH, stepDepth]} />
                </mesh>
              );
            })}
          </group>
        );
      }

      case 'custom-glb':
        return customGlbScene ? (
          <primitive object={customGlbScene} scale={[w, h, d]} />
        ) : null;

      default:
        return null;
    }
  };

  const handleDragStart = () => {
    isDraggingRef.current = true;
    setIsDraggingControl(true);
  };

  const handleObjectChange = () => {
    const pos: Vec3Tuple = [
      Math.round(propGroup.position.x * 1000) / 1000,
      Math.round(propGroup.position.y * 1000) / 1000,
      Math.round(propGroup.position.z * 1000) / 1000,
    ];
    const e = new THREE.Euler().setFromQuaternion(propGroup.quaternion, 'XYZ');
    const rot: Vec3Tuple = [
      Math.round(THREE.MathUtils.radToDeg(e.x) * 10) / 10,
      Math.round(THREE.MathUtils.radToDeg(e.y) * 10) / 10,
      Math.round(THREE.MathUtils.radToDeg(e.z) * 10) / 10,
    ];
    updateProp(prop.id, { position: pos, rotation: rot });
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    setIsDraggingControl(false);
  };

  const isLocalParented =
    prop.attachedBone !== 'none' || Boolean(prop.parentPropId);

  return (
    <>
      <primitive
        object={propGroup}
        onClick={(e: any) => {
          e.stopPropagation();
          selectProp(isSelected ? null : prop.id);
        }}
      >
        {/* Center object origin at its midpoint when attached to a hand/bone so it sits & pivots right inside the palm */}
        <group position={[0, isBoneAttached ? -h / 2 : 0, 0]}>
          {renderPrimitiveContent()}
        </group>
      </primitive>

      {isSelected && !isExporting && (
        <TransformControls
          object={propGroup}
          mode={propGizmoMode}
          space={isLocalParented ? 'local' : 'world'}
          size={getGizmoSize()}
          onMouseDown={handleDragStart}
          onObjectChange={handleObjectChange}
          onMouseUp={handleDragEnd}
        />
      )}
    </>
  );
};
