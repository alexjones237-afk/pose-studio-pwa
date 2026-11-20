import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useStudioStore } from '../../store/useStudioStore';

/**
 * Handles clean high-res PNG capture directly from the WebGL canvas,
 * hiding all gizmos/grid/markers and optionally using a transparent background for Clip Studio Paint.
 */
export const ExportManager: React.FC = () => {
  const { gl, scene, camera } = useThree();
  const exportRequest = useStudioStore((s) => s.exportRequest);
  const setIsExporting = useStudioStore((s) => s.setIsExporting);
  const clearExportRequest = useStudioStore((s) => s.clearExportRequest);
  const showToast = useStudioStore((s) => s.showToast);

  useEffect(() => {
    if (!exportRequest) return;
    let cancelled = false;

    const runExport = async () => {
      // Hide gizmos, joint spheres, IK handles, and grid
      setIsExporting(true);

      // Wait two animation frames so React + R3F commit the clean scene graph
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled) return;

      const prevBg = scene.background;
      const prevPixelRatio = gl.getPixelRatio();
      const prevClearAlpha = gl.getClearAlpha();

      try {
        // Bump pixel ratio for crisp artist reference export (up to 2.5x)
        const targetDpr = Math.min(2.5, Math.max(2, window.devicePixelRatio || 2));
        gl.setPixelRatio(targetDpr);

        if (exportRequest.transparent) {
          scene.background = null;
          gl.setClearColor(0x000000, 0);
        } else {
          scene.background = new THREE.Color('#121216');
          gl.setClearColor(0x121216, 1);
        }

        gl.render(scene, camera);

        const dataUrl = gl.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        const stamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .slice(0, 19);
        link.download = `poselab-${exportRequest.transparent ? 'transparent' : 'studio'}-${stamp}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast(
          exportRequest.transparent
            ? 'Exported Transparent PNG (CSP Ready)'
            : 'Exported High-Res Studio PNG'
        );
      } catch (err) {
        console.error('PNG Export failed:', err);
        showToast('Failed to export PNG');
      } finally {
        gl.setPixelRatio(prevPixelRatio);
        scene.background = prevBg;
        gl.setClearColor(0x121216, prevClearAlpha);
        gl.render(scene, camera);
        setIsExporting(false);
        clearExportRequest();
      }
    };

    runExport();
    return () => {
      cancelled = true;
    };
  }, [exportRequest, gl, scene, camera, setIsExporting, clearExportRequest, showToast]);

  return null;
};
