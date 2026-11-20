import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStudioStore } from '../../store/useStudioStore';
import { StudioEnvironment } from './StudioEnvironment';
import { MannequinRig } from './MannequinRig';
import { PropObject } from './PropObject';
import { ExportManager } from './ExportManager';

export const StudioCanvas: React.FC = () => {
  const orbitRef = useRef<any>(null);
  const characters = useStudioStore((s) => s.characters);
  const activeCharacterId = useStudioStore((s) => s.activeCharacterId);
  const props = useStudioStore((s) => s.props);
  const selectedPropId = useStudioStore((s) => s.selectedPropId);
  const isDraggingControl = useStudioStore((s) => s.isDraggingControl);
  const selectBone = useStudioStore((s) => s.selectBone);
  const selectIKHandle = useStudioStore((s) => s.selectIKHandle);
  const selectProp = useStudioStore((s) => s.selectProp);
  const setWholeModelGizmoMode = useStudioStore((s) => s.setWholeModelGizmoMode);

  return (
    <div className="fixed inset-0 w-full h-full touch-none bg-[#121216]">
      <Canvas
        className="w-full h-full touch-none"
        shadows
        dpr={[1, 2]}
        camera={{
          position: [1.35, 1.32, 2.45],
          fov: 35,
          near: 0.05,
          far: 60,
        }}
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          alpha: true,
        }}
        onPointerMissed={() => {
          selectBone(null);
          selectIKHandle(null);
          selectProp(null);
          setWholeModelGizmoMode('none');
        }}
      >
        <StudioEnvironment orbitRef={orbitRef} />

        {characters.map((char) => (
          <MannequinRig
            key={char.id}
            character={char}
            isActive={char.id === activeCharacterId}
          />
        ))}

        {props.map((prop) => (
          <PropObject
            key={prop.id}
            prop={prop}
            isSelected={prop.id === selectedPropId}
          />
        ))}

        <OrbitControls
          ref={orbitRef}
          makeDefault
          enabled={!isDraggingControl}
          target={[0, 0.96, 0]}
          enableDamping
          dampingFactor={0.075}
          minDistance={0.45}
          maxDistance={9.5}
          maxPolarAngle={Math.PI * 0.56}
          rotateSpeed={0.78}
          zoomSpeed={0.9}
          panSpeed={0.85}
        />

        <ExportManager />
      </Canvas>
    </div>
  );
};
