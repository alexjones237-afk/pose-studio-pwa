import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import { useStudioStore } from '../../store/useStudioStore';
import { focalLengthToFov } from '../../engine/poseUtils';
import { CameraPreset } from '../../types/pose';

interface StudioEnvironmentProps {
  orbitRef: React.RefObject<any>;
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  front: { pos: [0, 1.15, 2.75], target: [0, 0.96, 0] },
  threeQuarter: { pos: [1.65, 1.32, 2.25], target: [0, 0.96, 0] },
  side: { pos: [2.75, 1.12, 0.02], target: [0, 0.96, 0] },
  lowAngle: { pos: [0.85, 0.34, 2.35], target: [0, 1.08, 0] },
  topDown: { pos: [0.05, 3.35, 0.72], target: [0, 0.78, 0] },
};

export const StudioEnvironment: React.FC<StudioEnvironmentProps> = ({ orbitRef }) => {
  const { camera, scene } = useThree();
  const focalLength = useStudioStore((s) => s.focalLength);
  const cameraPresetRequest = useStudioStore((s) => s.cameraPresetRequest);
  const lighting = useStudioStore((s) => s.lighting);
  const showGrid = useStudioStore((s) => s.showGrid);
  const showFloor = useStudioStore((s) => s.showFloor);
  const isExporting = useStudioStore((s) => s.isExporting);
  const exportRequest = useStudioStore((s) => s.exportRequest);

  // Camera transition animation state
  const animRef = useRef<{
    active: boolean;
    t: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  }>({
    active: false,
    t: 1,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
  });

  // Keep studio background synced unless transparent export is active
  useEffect(() => {
    const isTransparentExport = isExporting && exportRequest?.transparent;
    if (isTransparentExport) {
      scene.background = null;
    } else {
      scene.background = new THREE.Color('#121216');
    }
  }, [scene, isExporting, exportRequest]);

  // Update PerspectiveCamera FOV whenever focalLength slider moves
  useEffect(() => {
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const persp = camera as THREE.PerspectiveCamera;
      persp.fov = focalLengthToFov(focalLength);
      persp.updateProjectionMatrix();
    }
  }, [camera, focalLength]);

  // Trigger smooth transition when user taps a camera angle preset
  useEffect(() => {
    if (!cameraPresetRequest) return;
    const preset = CAMERA_PRESETS[cameraPresetRequest.preset];
    if (!preset) return;

    animRef.current.active = true;
    animRef.current.t = 0;
    animRef.current.fromPos.copy(camera.position);
    animRef.current.toPos.set(...preset.pos);
    if (orbitRef.current?.target) {
      animRef.current.fromTarget.copy(orbitRef.current.target);
    } else {
      animRef.current.fromTarget.set(0, 0.96, 0);
    }
    animRef.current.toTarget.set(...preset.target);
  }, [cameraPresetRequest, camera, orbitRef]);

  useFrame((_, delta) => {
    const anim = animRef.current;
    if (!anim.active) return;

    anim.t = Math.min(1, anim.t + delta / 0.42);
    const ease = 1 - Math.pow(1 - anim.t, 3);

    camera.position.lerpVectors(anim.fromPos, anim.toPos, ease);
    if (orbitRef.current?.target) {
      orbitRef.current.target.lerpVectors(anim.fromTarget, anim.toTarget, ease);
      orbitRef.current.update();
    } else {
      camera.lookAt(anim.toTarget);
    }

    if (anim.t >= 1) {
      anim.active = false;
    }
  });

  // Compute directional key & rim light world coordinates from azimuth/elevation
  const keyAz = THREE.MathUtils.degToRad(lighting.keyAzimuth);
  const keyEl = THREE.MathUtils.degToRad(lighting.keyElevation);
  const keyDist = 5.5;
  const keyPos: [number, number, number] = [
    Math.sin(keyAz) * Math.cos(keyEl) * keyDist,
    Math.sin(keyEl) * keyDist,
    Math.cos(keyAz) * Math.cos(keyEl) * keyDist,
  ];

  const rimAz = THREE.MathUtils.degToRad(lighting.rimAzimuth);
  const rimPos: [number, number, number] = [
    Math.sin(rimAz) * 4.2,
    2.6,
    Math.cos(rimAz) * 4.2,
  ];

  const hideGuidesForExport = isExporting;
  const hideFloorForTransparent = isExporting && Boolean(exportRequest?.transparent);

  return (
    <>
      {/* Studio Fill & Hemisphere bounce */}
      <ambientLight intensity={lighting.fillIntensity * 0.45} color="#d6dce8" />
      <hemisphereLight
        args={['#dce4f7', '#262430', lighting.fillIntensity * 0.95]}
      />

      {/* Primary Key Light with Soft Shadows */}
      <directionalLight
        position={keyPos}
        intensity={lighting.keyIntensity}
        color="#fff8f0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        shadow-camera-left={-2.8}
        shadow-camera-right={2.8}
        shadow-camera-top={3.2}
        shadow-camera-bottom={-1.2}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      />

      {/* Adjustable Rim Light */}
      <directionalLight
        position={rimPos}
        intensity={lighting.rimIntensity}
        color={lighting.rimColor}
      />

      {/* Subtle Ground Grid (hidden during PNG export) */}
      {showGrid && !hideGuidesForExport && (
        <Grid
          position={[0, 0.002, 0]}
          args={[12, 12]}
          cellSize={0.25}
          cellThickness={0.5}
          cellColor="#262632"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#3b3b4e"
          fadeDistance={9}
          fadeStrength={1.6}
          infiniteGrid
        />
      )}

      {/* Shadow-catching Floor Plane */}
      {showFloor && !hideFloorForTransparent && (
        <group>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.001, 0]}
            receiveShadow
          >
            <circleGeometry args={[6.5, 48]} />
            <meshStandardMaterial
              color="#15151b"
              roughness={0.92}
              metalness={0.02}
              transparent
              opacity={0.78}
            />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.0005, 0]}
            receiveShadow
          >
            <planeGeometry args={[12, 12]} />
            <shadowMaterial transparent opacity={0.42} />
          </mesh>
        </group>
      )}
    </>
  );
};
