import React from 'react';
import { Video, Sun, Grid3X3 } from 'lucide-react';
import { useStudioStore } from '../../../store/useStudioStore';
import { CameraPreset } from '../../../types/pose';
import { focalLengthToFov } from '../../../engine/poseUtils';

const CAM_PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'front', label: 'Front' },
  { id: 'threeQuarter', label: '3/4' },
  { id: 'side', label: 'Side' },
  { id: 'lowAngle', label: 'Low Angle' },
  { id: 'topDown', label: 'Top-Down' },
];

const RIM_COLORS = [
  { label: 'Cool Blue', hex: '#9db8ff' },
  { label: 'Studio White', hex: '#f4f4f8' },
  { label: 'Warm Sunset', hex: '#ffba8c' },
  { label: 'Neon Violet', hex: '#c084fc' },
];

export const LightCamTab: React.FC = () => {
  const focalLength = useStudioStore((s) => s.focalLength);
  const setFocalLength = useStudioStore((s) => s.setFocalLength);
  const requestCameraPreset = useStudioStore((s) => s.requestCameraPreset);
  const lighting = useStudioStore((s) => s.lighting);
  const updateLighting = useStudioStore((s) => s.updateLighting);
  const showGrid = useStudioStore((s) => s.showGrid);
  const showFloor = useStudioStore((s) => s.showFloor);
  const setShowGrid = useStudioStore((s) => s.setShowGrid);
  const setShowFloor = useStudioStore((s) => s.setShowFloor);

  const fovDeg = Math.round(focalLengthToFov(focalLength));

  return (
    <div className="space-y-3.5">
      {/* Camera Focal Length & Presets */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
            <Video className="w-3.5 h-3.5 text-indigo-400" />
            <span>Camera Lens</span>
          </div>
          <span className="text-[11px] font-mono text-indigo-300">
            {focalLength}mm <span className="text-zinc-500">({fovDeg}° FOV)</span>
          </span>
        </div>

        <div>
          <input
            type="range"
            min={20}
            max={85}
            step={1}
            value={focalLength}
            onChange={(e) => setFocalLength(parseInt(e.target.value, 10))}
            className="studio-slider"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 -mt-1">
            <span>20mm Wide Foreshortening</span>
            <span>85mm Flat Portrait</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {[24, 35, 50, 85].map((mm) => (
            <button
              key={mm}
              onClick={() => setFocalLength(mm)}
              className={`flex-1 py-1 rounded-lg text-[10px] font-mono transition ${
                focalLength === mm
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
            >
              {mm}mm
            </button>
          ))}
        </div>

        <div className="pt-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">
            Quick Angle Presets
          </div>
          <div className="grid grid-cols-5 gap-1">
            {CAM_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => requestCameraPreset(p.id)}
                className="py-1.5 px-1 rounded-lg bg-white/5 hover:bg-indigo-500/25 border border-white/10 text-[10px] font-medium text-zinc-200 transition"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Studio Lighting Rig */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          <Sun className="w-3.5 h-3.5 text-amber-300" />
          <span>Studio Lighting</span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Key Angle</span>
              <span className="font-mono">{lighting.keyAzimuth}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={lighting.keyAzimuth}
              onChange={(e) =>
                updateLighting({ keyAzimuth: parseFloat(e.target.value) })
              }
              className="studio-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Key Height</span>
              <span className="font-mono">{lighting.keyElevation}°</span>
            </div>
            <input
              type="range"
              min={8}
              max={85}
              step={1}
              value={lighting.keyElevation}
              onChange={(e) =>
                updateLighting({ keyElevation: parseFloat(e.target.value) })
              }
              className="studio-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Key Power</span>
              <span className="font-mono">{lighting.keyIntensity.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={4.5}
              step={0.1}
              value={lighting.keyIntensity}
              onChange={(e) =>
                updateLighting({ keyIntensity: parseFloat(e.target.value) })
              }
              className="studio-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Fill Power</span>
              <span className="font-mono">{lighting.fillIntensity.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={lighting.fillIntensity}
              onChange={(e) =>
                updateLighting({ fillIntensity: parseFloat(e.target.value) })
              }
              className="studio-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Rim Power</span>
              <span className="font-mono">{lighting.rimIntensity.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={3.5}
              step={0.1}
              value={lighting.rimIntensity}
              onChange={(e) =>
                updateLighting({ rimIntensity: parseFloat(e.target.value) })
              }
              className="studio-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Rim Angle</span>
              <span className="font-mono">{lighting.rimAzimuth}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={lighting.rimAzimuth}
              onChange={(e) =>
                updateLighting({ rimAzimuth: parseFloat(e.target.value) })
              }
              className="studio-slider"
            />
          </div>
        </div>

        {/* Rim Light Tint Swatches */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-zinc-400">Rim Tint</span>
          <div className="flex items-center gap-1.5">
            {RIM_COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => updateLighting({ rimColor: c.hex })}
                title={c.label}
                className={`w-5 h-5 rounded-full border-2 transition ${
                  lighting.rimColor === c.hex
                    ? 'border-white scale-110'
                    : 'border-white/20 opacity-75 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Stage Guides */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition ${
            showGrid
              ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200'
              : 'bg-white/5 border-white/10 text-zinc-400'
          }`}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          <span>Ground Grid</span>
        </button>
        <button
          onClick={() => setShowFloor(!showFloor)}
          className={`py-2 rounded-xl border text-xs font-medium transition ${
            showFloor
              ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200'
              : 'bg-white/5 border-white/10 text-zinc-400'
          }`}
        >
          Shadow Floor
        </button>
      </div>
    </div>
  );
};
