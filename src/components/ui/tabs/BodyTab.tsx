import React, { useMemo, useState } from 'react';
import {
  RotateCcw,
  Sparkles,
  Smile,
  Scissors,
  Sliders,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useStudioStore } from '../../../store/useStudioStore';
import {
  ArchetypeBodyPreset,
  ExpressionPresetName,
  MorphTargetDescriptor,
} from '../../../types/pose';
import {
  EXPRESSION_PRESETS,
  HAIR_COLOR_SWATCHES,
  HAIR_STYLE_CATALOG,
} from '../../../engine/faceAndHairEngine';

const ARCHETYPE_PRESETS: Array<{ id: ArchetypeBodyPreset; label: string }> = [
  { id: 'default', label: 'Default Base' },
  { id: 'athletic', label: 'Athletic / Muscular' },
  { id: 'curvy', label: 'Curvy / Soft' },
  { id: 'slender', label: 'Slender' },
  { id: 'heroic', label: 'Heroic 8-Heads' },
];

const EXPRESSION_KEYS: ExpressionPresetName[] = [
  'neutral',
  'smile',
  'angry',
  'surprised',
  'sad',
  'wink',
  'focused',
];

type SubSection = 'proportions' | 'face' | 'hair';

export const BodyTab: React.FC = () => {
  const [subSection, setSubSection] = useState<SubSection>('proportions');

  const characters = useStudioStore((s) => s.characters);
  const activeCharacterId = useStudioStore((s) => s.activeCharacterId);
  const setMorphValue = useStudioStore((s) => s.setMorphValue);
  const resetMorphs = useStudioStore((s) => s.resetMorphs);
  const applyBodyPreset = useStudioStore((s) => s.applyBodyPreset);
  const updateFace = useStudioStore((s) => s.updateFace);
  const applyExpressionPreset = useStudioStore((s) => s.applyExpressionPreset);
  const updateHair = useStudioStore((s) => s.updateHair);

  const activeChar =
    characters.find((c) => c.id === activeCharacterId) ?? characters[0];
  const { face, hair } = activeChar;

  const groupedMorphs = useMemo(() => {
    const groups = new Map<string, MorphTargetDescriptor[]>();
    for (const desc of activeChar.availableMorphs) {
      if (desc.isPhysicsDriven) continue;
      const list = groups.get(desc.category) ?? [];
      list.push(desc);
      groups.set(desc.category, list);
    }
    return Array.from(groups.entries());
  }, [activeChar.availableMorphs]);

  const universalCount = useMemo(
    () =>
      activeChar.availableMorphs.filter((m) => m.isUniversal && !m.isPhysicsDriven)
        .length,
    [activeChar.availableMorphs]
  );

  return (
    <div className="space-y-3.5">
      {/* Sub-Navigation Switcher: Proportions | Face & Eyes | Hair Style */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
        <button
          onClick={() => setSubSection('proportions')}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            subSection === 'proportions'
              ? 'bg-indigo-500 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Proportions</span>
        </button>

        <button
          onClick={() => setSubSection('face')}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            subSection === 'face'
              ? 'bg-indigo-500 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Smile className="w-3.5 h-3.5" />
          <span>Face &amp; Eyes</span>
        </button>

        <button
          onClick={() => setSubSection('hair')}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            subSection === 'hair'
              ? 'bg-indigo-500 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>Hair Style</span>
        </button>
      </div>

      {/* SECTION 1: ANATOMICAL PROPORTIONS */}
      {subSection === 'proportions' && (
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                  Archetype Presets
                </span>
              </div>
              <button
                onClick={() => resetMorphs(activeChar.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 text-[10px] text-zinc-300 transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Zero All</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ARCHETYPE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyBodyPreset(activeChar.id, preset.id)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-indigo-500/25 border border-white/10 hover:border-indigo-400/45 text-[11px] font-medium text-zinc-100 transition active:scale-95"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-400/25 text-[10px] text-indigo-200">
            <span>Universal Landmark Morph Engine ({universalCount} active)</span>
            <span className="text-indigo-300/80 font-mono">Zero Bone Scaling</span>
          </div>

          {groupedMorphs.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-zinc-400">
              Analyzing skeleton landmarks and generating universal morph targets...
            </div>
          ) : (
            <div className="space-y-3">
              {groupedMorphs.map(([category, items]) => (
                <div
                  key={category}
                  className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                      {category}
                    </span>
                    {category === 'Native Body Blendshapes' && (
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                        Imported Native
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {items.map((item) => {
                      const val = activeChar.morphs[item.key] ?? 0;
                      return (
                        <div key={item.key}>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-zinc-200 flex items-center gap-1.5">
                              {item.label}
                              {item.isUniversal && (
                                <span className="text-[9px] px-1 rounded bg-white/5 text-zinc-400">
                                  Universal
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-indigo-300">
                              {Math.round(val * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={val}
                            onChange={(e) =>
                              setMorphValue(
                                activeChar.id,
                                item.key,
                                parseFloat(e.target.value)
                              )
                            }
                            className="studio-slider"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: FACIAL FEATURES & EXPRESSIONS */}
      {subSection === 'face' && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() =>
                updateFace(activeChar.id, { showFeatures: !face.showFeatures })
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                face.showFeatures
                  ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200'
                  : 'bg-white/5 border-white/10 text-zinc-400'
              }`}
            >
              {face.showFeatures ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              <span>
                {face.showFeatures ? 'Facial Features Visible' : 'Blank Loomis Head'}
              </span>
            </button>

            <button
              onClick={() => applyExpressionPreset(activeChar.id, 'neutral')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-zinc-300 transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Face</span>
            </button>
          </div>

          {/* Expression Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              One-Tap Expressions
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {EXPRESSION_KEYS.map((key) => {
                const active = face.expressionPreset === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyExpressionPreset(activeChar.id, key)}
                    className={`py-1.5 px-2 rounded-xl border text-[11px] font-medium transition truncate ${
                      active
                        ? 'bg-indigo-500 text-white border-indigo-400'
                        : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/10'
                    }`}
                  >
                    {EXPRESSION_PRESETS[key].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Eye Gaze, Blink & Iris Controls */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              Eyes &amp; Gaze Direction
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div>
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Gaze Left / Right</span>
                  <span className="font-mono text-indigo-300">
                    {Math.round(face.eyeGazeX * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={face.eyeGazeX}
                  onChange={(e) =>
                    updateFace(activeChar.id, {
                      eyeGazeX: parseFloat(e.target.value),
                    })
                  }
                  className="studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Gaze Down / Up</span>
                  <span className="font-mono text-indigo-300">
                    {Math.round(face.eyeGazeY * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={face.eyeGazeY}
                  onChange={(e) =>
                    updateFace(activeChar.id, {
                      eyeGazeY: parseFloat(e.target.value),
                    })
                  }
                  className="studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Blink Left Eye</span>
                  <span className="font-mono text-indigo-300">
                    {Math.round(face.blinkLeft * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={face.blinkLeft}
                  onChange={(e) =>
                    updateFace(activeChar.id, {
                      blinkLeft: parseFloat(e.target.value),
                    })
                  }
                  className="studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Blink Right Eye</span>
                  <span className="font-mono text-indigo-300">
                    {Math.round(face.blinkRight * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={face.blinkRight}
                  onChange={(e) =>
                    updateFace(activeChar.id, {
                      blinkRight: parseFloat(e.target.value),
                    })
                  }
                  className="studio-slider"
                />
              </div>

              <div className="col-span-2">
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Iris Size (Realistic ↔ Anime)</span>
                  <span className="font-mono text-indigo-300">
                    {Math.round(face.irisScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.65}
                  max={1.38}
                  step={0.01}
                  value={face.irisScale}
                  onChange={(e) =>
                    updateFace(activeChar.id, {
                      irisScale: parseFloat(e.target.value),
                    })
                  }
                  className="studio-slider"
                />
              </div>
            </div>
          </div>

          {/* Eyebrows & Mouth Sliders */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              Eyebrows &amp; Mouth Sculpting
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div>
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Brow Height</span>
                  <span className="font-mono text-indigo-300">
                    {Math.round(face.browHeight * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={face.browHeight}
                  onChange={(e) =>
                    updateFace(activeChar.id, {
                      browHeight: parseFloat(e.target.value),
                    })
                  }
                  className="studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Brow Tilt (Sad ↔ Angry)</span>
                  <span className="font-mono text-indigo-300">
                    {Math.round(face.browAngle * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={face.browAngle}
                  onChange={(e) =>
                    updateFace(activeChar.id, {
                      browAngle: parseFloat(e.target.value),
                    })
                  }
                  className="studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Mouth (Frown ↔ Smile)</span>
                  <span className="font-mono text-indigo-300">
                    {Math.round(face.mouthSmile * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={face.mouthSmile}
                  onChange={(e) =>
                    updateFace(activeChar.id, {
                      mouthSmile: parseFloat(e.target.value),
                    })
                  }
                  className="studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Mouth Open</span>
                  <span className="font-mono text-indigo-300">
                    {Math.round(face.mouthOpen * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={face.mouthOpen}
                  onChange={(e) =>
                    updateFace(activeChar.id, {
                      mouthOpen: parseFloat(e.target.value),
                    })
                  }
                  className="studio-slider"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: HAIR STYLES & FLOW MANIPULATION */}
      {subSection === 'hair' && (
        <div className="space-y-3.5">
          {/* Hair Style Picker Grid */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              3D Hair Style ({activeChar.label})
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {HAIR_STYLE_CATALOG.map((item) => {
                const active = hair.style === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => updateHair(activeChar.id, { style: item.id })}
                    className={`text-left p-2 rounded-xl border transition ${
                      active
                        ? 'bg-indigo-500/25 border-indigo-400/60 text-indigo-100'
                        : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-xs font-semibold leading-tight">
                      {item.label}
                    </div>
                    <div className="text-[9.5px] text-indigo-300/80 mt-0.5">
                      {item.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hair Tint Swatches */}
          {hair.style !== 'bald' && (
            <>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/8">
                <span className="text-xs font-medium text-zinc-300">Hair Tone</span>
                <div className="flex items-center gap-1.5">
                  {HAIR_COLOR_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      onClick={() => updateHair(activeChar.id, { color: sw.hex })}
                      title={sw.label}
                      className={`w-5 h-5 rounded-full border-2 transition ${
                        hair.color === sw.hex
                          ? 'border-white scale-110'
                          : 'border-white/20 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>
              </div>

              {/* Hair Length, Bangs, Volume & Wind Flow Sliders */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                    Hair Length &amp; Wind Flow Pose
                  </span>
                  <button
                    onClick={() =>
                      updateHair(activeChar.id, {
                        length: 1,
                        bangsLength: 1,
                        volume: 1,
                        windPitch: 0,
                        windSway: 0,
                      })
                    }
                    className="text-[10px] text-zinc-400 hover:text-zinc-200"
                  >
                    Reset Hair
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-300">
                      <span>Hair Length</span>
                      <span className="font-mono text-indigo-300">
                        {Math.round(hair.length * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.6}
                      step={0.02}
                      value={hair.length}
                      onChange={(e) =>
                        updateHair(activeChar.id, {
                          length: parseFloat(e.target.value),
                        })
                      }
                      className="studio-slider"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-300">
                      <span>Bangs / Fringe Length</span>
                      <span className="font-mono text-indigo-300">
                        {Math.round(hair.bangsLength * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={1.5}
                      step={0.02}
                      value={hair.bangsLength}
                      onChange={(e) =>
                        updateHair(activeChar.id, {
                          bangsLength: parseFloat(e.target.value),
                        })
                      }
                      className="studio-slider"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-300">
                      <span>Crown Volume</span>
                      <span className="font-mono text-indigo-300">
                        {Math.round(hair.volume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.75}
                      max={1.4}
                      step={0.02}
                      value={hair.volume}
                      onChange={(e) =>
                        updateHair(activeChar.id, {
                          volume: parseFloat(e.target.value),
                        })
                      }
                      className="studio-slider"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-sky-300">
                      <span>Wind Billow (Back/Fwd)</span>
                      <span className="font-mono text-sky-300">
                        {Math.round(hair.windPitch)}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-55}
                      max={55}
                      step={1}
                      value={hair.windPitch}
                      onChange={(e) =>
                        updateHair(activeChar.id, {
                          windPitch: parseFloat(e.target.value),
                        })
                      }
                      className="studio-slider"
                    />
                  </div>

                  <div className="col-span-2">
                    <div className="flex justify-between text-[10px] text-sky-300">
                      <span>Wind Sway (Left / Right Flow)</span>
                      <span className="font-mono text-sky-300">
                        {Math.round(hair.windSway)}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-55}
                      max={55}
                      step={1}
                      value={hair.windSway}
                      onChange={(e) =>
                        updateHair(activeChar.id, {
                          windSway: parseFloat(e.target.value),
                        })
                      }
                      className="studio-slider"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
