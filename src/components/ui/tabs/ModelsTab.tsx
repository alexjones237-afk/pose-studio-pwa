import React, { useRef } from 'react';
import { Upload, UserPlus, UserMinus, Palette, CheckCircle2 } from 'lucide-react';
import { useStudioStore } from '../../../store/useStudioStore';
import { BuiltInArchetype } from '../../../types/pose';

const MODEL_SLOTS: Array<{
  id: BuiltInArchetype;
  title: string;
  subtitle: string;
  fileHint: string;
}> = [
  {
    id: 'sotai1',
    title: '素体1',
    subtitle: 'Sculpted Base Body',
    fileHint: 'sotai1.glb/.vrm',
  },
  {
    id: 'realistic-female',
    title: 'Realistic Female',
    subtitle: '8-Heads Proportions',
    fileHint: 'realistic-female.vrm/.glb',
  },
  {
    id: 'realistic-male',
    title: 'Realistic Male',
    subtitle: '8-Heads Proportions',
    fileHint: 'realistic-male.vrm/.glb',
  },
  {
    id: 'anime-female',
    title: 'Stylized Anime Female',
    subtitle: '6.2-Heads Stylized',
    fileHint: 'anime-female.vrm/.glb',
  },
  {
    id: 'anime-male',
    title: 'Stylized Anime Male',
    subtitle: '6.5-Heads Stylized',
    fileHint: 'anime-male.vrm/.glb',
  },
];

export const ModelsTab: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const characters = useStudioStore((s) => s.characters);
  const activeCharacterId = useStudioStore((s) => s.activeCharacterId);
  const setActiveCharacter = useStudioStore((s) => s.setActiveCharacter);
  const setCharacterModelPreset = useStudioStore((s) => s.setCharacterModelPreset);
  const spawnSecondCharacter = useStudioStore((s) => s.spawnSecondCharacter);
  const removeSecondCharacter = useStudioStore((s) => s.removeSecondCharacter);
  const setCharacterStageTransform = useStudioStore(
    (s) => s.setCharacterStageTransform
  );
  const materialMode = useStudioStore((s) => s.materialMode);
  const setMaterialMode = useStudioStore((s) => s.setMaterialMode);
  const celThreshold = useStudioStore((s) => s.celThreshold);
  const setCelThreshold = useStudioStore((s) => s.setCelThreshold);
  const showToast = useStudioStore((s) => s.showToast);

  const activeChar =
    characters.find((c) => c.id === activeCharacterId) ?? characters[0];

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCharacterModelPreset(activeChar.id, 'custom', url, file.name);
    showToast(`Loading ${file.name}...`);
    e.target.value = '';
  };

  const sourceBadge =
    activeChar.modelSourceType === 'vrm'
      ? { text: 'External .VRM Rig', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' }
      : activeChar.modelSourceType === 'glb'
      ? { text: 'External .GLB Rig', cls: 'bg-sky-500/15 text-sky-300 border-sky-400/30' }
      : { text: 'Procedural Fallback Rig', cls: 'bg-white/5 text-zinc-400 border-white/10' };

  return (
    <div className="space-y-4">
      {/* Multi-Character Stage Selector */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {characters.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCharacter(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                c.id === activeChar.id
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white/5 text-zinc-300 hover:bg-white/10'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {characters.length < 2 ? (
          <button
            onClick={spawnSecondCharacter}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-emerald-300 text-xs font-medium transition"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add 2nd Mannequin</span>
          </button>
        ) : (
          <button
            onClick={removeSecondCharacter}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 text-xs font-medium transition"
          >
            <UserMinus className="w-3.5 h-3.5" />
            <span>Remove Figure B</span>
          </button>
        )}
      </div>

      {/* Multi-Archetype Model Library */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Model Library ({activeChar.label})
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${sourceBadge.cls}`}
          >
            <CheckCircle2 className="w-3 h-3" />
            {sourceBadge.text}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {MODEL_SLOTS.map((slot) => {
            const selected = activeChar.modelPreset === slot.id;
            return (
              <button
                key={slot.id}
                onClick={() => setCharacterModelPreset(activeChar.id, slot.id)}
                className={`text-left p-2.5 rounded-xl border transition ${
                  selected
                    ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-100'
                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/[0.08]'
                }`}
              >
                <div className="text-xs font-semibold leading-tight">{slot.title}</div>
                <div className="text-[10px] text-indigo-300/80 mt-0.5">{slot.subtitle}</div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className={`w-full py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
            activeChar.modelPreset === 'custom'
              ? 'bg-indigo-500/25 border-indigo-400/50 text-indigo-200'
              : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'
          }`}
        >
          <Upload className="w-3.5 h-3.5 text-indigo-400" />
          <span>
            {activeChar.customModelName
              ? `Custom: ${activeChar.customModelName}`
              : 'Upload Custom .VRM / .GLB Humanoid'}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".vrm,.glb,.gltf"
          className="hidden"
          onChange={handleImportFile}
        />

        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Auto-loads <code className="text-zinc-400">/public/models/*.vrm</code> or{' '}
          <code className="text-zinc-400">.glb</code> when present; otherwise uses matching articulated fallback rigs with 30-bone hands.
        </p>
      </div>

      {/* Studio Material Shading Toggle */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
            <Palette className="w-3.5 h-3.5 text-indigo-400" />
            <span>Studio Shading</span>
          </div>
          <div className="flex rounded-lg bg-black/40 p-0.5 border border-white/10">
            <button
              onClick={() => setMaterialMode('clay')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                materialMode === 'clay'
                  ? 'bg-indigo-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Matte Clay
            </button>
            <button
              onClick={() => setMaterialMode('cel')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                materialMode === 'cel'
                  ? 'bg-indigo-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Cel-Shaded
            </button>
          </div>
        </div>

        {materialMode === 'cel' && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">Shadow Threshold</span>
              <span className="text-indigo-300 font-mono">
                {Math.round(celThreshold * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.12}
              max={0.85}
              step={0.01}
              value={celThreshold}
              onChange={(e) => setCelThreshold(parseFloat(e.target.value))}
              className="studio-slider"
            />
          </div>
        )}
      </div>

      {/* Stage Placement */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">
            Stage Placement ({activeChar.label})
          </span>
          <button
            onClick={() =>
              setCharacterStageTransform(activeChar.id, [0, 0, 0], 0, [0, 0, 0])
            }
            className="text-[10px] text-indigo-300 hover:underline"
          >
            Center
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Pos X</span>
              <span className="font-mono">{activeChar.stagePosition[0].toFixed(2)}m</span>
            </div>
            <input
              type="range"
              min={-2}
              max={2}
              step={0.02}
              value={activeChar.stagePosition[0]}
              onChange={(e) =>
                setCharacterStageTransform(
                  activeChar.id,
                  [
                    parseFloat(e.target.value),
                    activeChar.stagePosition[1],
                    activeChar.stagePosition[2],
                  ],
                  activeChar.stageRotationY
                )
              }
              className="studio-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Pos Z</span>
              <span className="font-mono">{activeChar.stagePosition[2].toFixed(2)}m</span>
            </div>
            <input
              type="range"
              min={-2}
              max={2}
              step={0.02}
              value={activeChar.stagePosition[2]}
              onChange={(e) =>
                setCharacterStageTransform(
                  activeChar.id,
                  [
                    activeChar.stagePosition[0],
                    activeChar.stagePosition[1],
                    parseFloat(e.target.value),
                  ],
                  activeChar.stageRotationY
                )
              }
              className="studio-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Turn Y</span>
              <span className="font-mono">{Math.round(activeChar.stageRotationY)}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={activeChar.stageRotationY}
              onChange={(e) =>
                setCharacterStageTransform(
                  activeChar.id,
                  activeChar.stagePosition,
                  parseFloat(e.target.value)
                )
              }
              className="studio-slider"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
