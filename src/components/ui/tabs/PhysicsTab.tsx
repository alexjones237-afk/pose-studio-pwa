import React from 'react';
import { Sparkles, Power, Activity } from 'lucide-react';
import { useStudioStore } from '../../../store/useStudioStore';

export const PhysicsTab: React.FC = () => {
  const characters = useStudioStore((s) => s.characters);
  const activeCharacterId = useStudioStore((s) => s.activeCharacterId);
  const updatePhysics = useStudioStore((s) => s.updatePhysics);
  const triggerPhysicsImpulse = useStudioStore((s) => s.triggerPhysicsImpulse);
  const telemetryByChar = useStudioStore((s) => s.telemetryByChar);
  const applyPose = useStudioStore((s) => s.applyPose);

  const activeChar =
    characters.find((c) => c.id === activeCharacterId) ?? characters[0];
  const { physics } = activeChar;
  const telemetry = telemetryByChar[activeChar.id] ?? {
    chestTiltDeg: 0,
    hipsTiltDeg: 0,
    hangForward: 0,
    splayBack: 0,
    standingDroop: 0,
    gluteGravity: 0,
    springBoneCount: 0,
  };

  return (
    <div className="space-y-3.5">
      {/* Header Controls */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => updatePhysics(activeChar.id, { enabled: !physics.enabled })}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
            physics.enabled
              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
              : 'bg-white/5 border-white/10 text-zinc-400'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{physics.enabled ? 'Softness & Gravity ON' : 'Physics Paused'}</span>
        </button>

        <button
          onClick={triggerPhysicsImpulse}
          disabled={!physics.enabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-xs font-medium disabled:opacity-40 transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Test Bounce</span>
        </button>
      </div>

      {/* Live Sliders */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2.5">
        <div>
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-200 font-medium">
              Softness / Weight (Gravity Pull)
            </span>
            <span className="font-mono text-indigo-300">
              {Math.round(physics.weight * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={physics.weight}
            onChange={(e) =>
              updatePhysics(activeChar.id, { weight: parseFloat(e.target.value) })
            }
            className="studio-slider"
          />
          <div className="flex justify-between text-[9.5px] text-zinc-500 -mt-1">
            <span>0% Firm</span>
            <span>100% Heavy / Natural</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-200 font-medium">Floppiness (Inverse Stiffness)</span>
            <span className="font-mono text-indigo-300">
              {Math.round(physics.floppiness * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={physics.floppiness}
            onChange={(e) =>
              updatePhysics(activeChar.id, { floppiness: parseFloat(e.target.value) })
            }
            className="studio-slider"
          />
        </div>

        <div>
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-200 font-medium">Damping (Settling Drag)</span>
            <span className="font-mono text-indigo-300">
              {Math.round(physics.damping * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={physics.damping}
            onChange={(e) =>
              updatePhysics(activeChar.id, { damping: parseFloat(e.target.value) })
            }
            className="studio-slider"
          />
        </div>
      </div>

      {/* Real-Time Universal Orientation-Driven Gravity Solver Telemetry */}
      <div className="p-3 rounded-xl bg-indigo-950/25 border border-indigo-400/20 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-200">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>Universal Gravity Solver</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            Chest {telemetry.chestTiltDeg}° • Hips {telemetry.hipsTiltDeg}°
          </span>
        </div>

        <div className="space-y-1.5">
          <div>
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="text-zinc-300">
                <code>Chest_Hang_Forward</code> (Forward Lean / All-Fours)
              </span>
              <span className="font-mono text-sky-300">{telemetry.hangForward}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/50 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-100"
                style={{ width: `${telemetry.hangForward}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="text-zinc-300">
                <code>Chest_Splay_Back</code> (Supine / Lying Flat)
              </span>
              <span className="font-mono text-purple-300">{telemetry.splayBack}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/50 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 transition-all duration-100"
                style={{ width: `${telemetry.splayBack}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-zinc-400">Standing Droop</span>
                <span className="font-mono text-indigo-300">{telemetry.standingDroop}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-black/50 overflow-hidden">
                <div
                  className="h-full bg-indigo-400 transition-all duration-100"
                  style={{ width: `${telemetry.standingDroop}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-zinc-400">Glute Gravity</span>
                <span className="font-mono text-emerald-300">{telemetry.gluteGravity}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-black/50 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-100"
                  style={{ width: `${telemetry.gluteGravity}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
          <span>Active Spring Bones: {telemetry.springBoneCount}</span>
          <span>Works on any .VRM / .GLB</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <button
            onClick={() => applyPose(activeChar.id, 'all-fours-crawl')}
            className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-sky-200 transition"
          >
            Preview All-Fours Droop
          </button>
          <button
            onClick={() => applyPose(activeChar.id, 'supine-recline')}
            className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-purple-200 transition"
          >
            Preview Supine Splay
          </button>
        </div>
      </div>
    </div>
  );
};
