import React, { useMemo, useState } from 'react';
import {
  FlipHorizontal2,
  RotateCcw,
  Anchor,
  Eye,
  EyeOff,
  Move,
  Hand,
  ArrowDownToLine,
  Rotate3d,
} from 'lucide-react';
import { useStudioStore } from '../../../store/useStudioStore';
import {
  FingerName,
  HandPresetName,
  HandSide,
  IKHandleType,
  JOINT_LABELS,
  MAJOR_JOINTS,
  Vec3Tuple,
} from '../../../types/pose';
import {
  extractHandControlsFromBones,
  HAND_PRESETS,
} from '../../../engine/fingerUtils';

const IK_ITEMS: Array<{ id: IKHandleType; label: string; colorClass: string }> = [
  { id: 'leftHand', label: 'L Hand', colorClass: 'text-sky-300' },
  { id: 'rightHand', label: 'R Hand', colorClass: 'text-sky-300' },
  { id: 'leftFoot', label: 'L Foot', colorClass: 'text-amber-300' },
  { id: 'rightFoot', label: 'R Foot', colorClass: 'text-amber-300' },
  { id: 'hips', label: 'Hips', colorClass: 'text-purple-300' },
  { id: 'head', label: 'Head Aim', colorClass: 'text-emerald-300' },
];

const FINGER_LIST: Array<{ key: FingerName; label: string }> = [
  { key: 'thumb', label: 'Thumb' },
  { key: 'index', label: 'Index' },
  { key: 'middle', label: 'Middle' },
  { key: 'ring', label: 'Ring' },
  { key: 'little', label: 'Little' },
];

const HAND_PRESET_KEYS: HandPresetName[] = [
  'relaxed',
  'fist',
  'open',
  'point',
  'cylinderWrap',
  'sphereHold',
  'pinch',
  'flatCarry',
];

export const PoseIKTab: React.FC = () => {
  const [activeHandSide, setActiveHandSide] = useState<HandSide>('right');

  const characters = useStudioStore((s) => s.characters);
  const activeCharacterId = useStudioStore((s) => s.activeCharacterId);
  const selectedBone = useStudioStore((s) => s.selectedBone);
  const selectedIKHandle = useStudioStore((s) => s.selectedIKHandle);
  const wholeModelGizmoMode = useStudioStore((s) => s.wholeModelGizmoMode);
  const showJointMarkers = useStudioStore((s) => s.showJointMarkers);
  const showIKHandles = useStudioStore((s) => s.showIKHandles);

  const selectBone = useStudioStore((s) => s.selectBone);
  const selectIKHandle = useStudioStore((s) => s.selectIKHandle);
  const setWholeModelGizmoMode = useStudioStore((s) => s.setWholeModelGizmoMode);
  const setCharacterStageTransform = useStudioStore(
    (s) => s.setCharacterStageTransform
  );
  const nudgeCharacterYaw = useStudioStore((s) => s.nudgeCharacterYaw);
  const setShowJointMarkers = useStudioStore((s) => s.setShowJointMarkers);
  const setShowIKHandles = useStudioStore((s) => s.setShowIKHandles);
  const togglePinFeetToFloor = useStudioStore((s) => s.togglePinFeetToFloor);
  const mirrorActivePose = useStudioStore((s) => s.mirrorActivePose);
  const resetActivePose = useStudioStore((s) => s.resetActivePose);
  const updateCharacterBones = useStudioStore((s) => s.updateCharacterBones);
  const applyHandControls = useStudioStore((s) => s.applyHandControls);
  const applyHandPreset = useStudioStore((s) => s.applyHandPreset);
  const requestSurfaceSnap = useStudioStore((s) => s.requestSurfaceSnap);
  const pushHistory = useStudioStore((s) => s.pushHistory);

  const activeChar =
    characters.find((c) => c.id === activeCharacterId) ?? characters[0];

  const currentEuler: Vec3Tuple =
    (selectedBone ? activeChar.bones[selectedBone] : undefined) ?? [0, 0, 0];

  const handControls = useMemo(
    () => extractHandControlsFromBones(activeHandSide, activeChar.bones),
    [activeHandSide, activeChar.bones]
  );

  const setAxisValue = (axisIndex: 0 | 1 | 2, val: number) => {
    if (!selectedBone) return;
    const next: Vec3Tuple = [...currentEuler];
    next[axisIndex] = val;
    updateCharacterBones(activeChar.id, { [selectedBone]: next });
  };

  const handleFingerSliderChange = (
    field: FingerName | 'spread',
    val: number
  ) => {
    applyHandControls(
      activeChar.id,
      activeHandSide,
      { ...handControls, [field]: val },
      false
    );
  };

  return (
    <div className="space-y-3.5">
      {/* Whole Model Rotate & Move Controls (Works cleanly on All-Fours / Supine / Standing) */}
      <div className="p-3 rounded-xl bg-sky-950/20 border border-sky-400/25 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-200">
            <Rotate3d className="w-3.5 h-3.5 text-sky-400" />
            <span>Whole Model Rotate / Move</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setWholeModelGizmoMode(
                  wholeModelGizmoMode === 'rotate' ? 'none' : 'rotate'
                )
              }
              className={`px-2 py-1 rounded-lg border text-[10px] font-semibold transition ${
                wholeModelGizmoMode === 'rotate'
                  ? 'bg-sky-500 text-white border-sky-400'
                  : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'
              }`}
            >
              3D Rotate
            </button>
            <button
              onClick={() =>
                setWholeModelGizmoMode(
                  wholeModelGizmoMode === 'translate' ? 'none' : 'translate'
                )
              }
              className={`px-2 py-1 rounded-lg border text-[10px] font-semibold transition ${
                wholeModelGizmoMode === 'translate'
                  ? 'bg-sky-500 text-white border-sky-400'
                  : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'
              }`}
            >
              3D Move
            </button>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[10px] text-zinc-300">
            <span>Spin Whole Model (Turn Y)</span>
            <span className="font-mono text-sky-300">
              {Math.round(activeChar.stageRotationY)}°
            </span>
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
            onPointerUp={() => pushHistory()}
            className="studio-slider"
          />
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => nudgeCharacterYaw(activeChar.id, -45)}
            className="py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-medium text-zinc-200 transition"
          >
            -45°
          </button>
          <button
            onClick={() => nudgeCharacterYaw(activeChar.id, 45)}
            className="py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-medium text-zinc-200 transition"
          >
            +45°
          </button>
          <button
            onClick={() => nudgeCharacterYaw(activeChar.id, 180)}
            className="py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-medium text-zinc-200 transition"
          >
            Flip 180°
          </button>
          <button
            onClick={() => {
              setCharacterStageTransform(activeChar.id, [0, 0, 0], 0, [0, 0, 0]);
              pushHistory();
            }}
            className="py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 text-[10px] font-medium text-zinc-300 transition"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Visibility & Floor Pin Controls */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setShowJointMarkers(!showJointMarkers)}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-[11px] font-medium transition ${
            showJointMarkers
              ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200'
              : 'bg-white/5 border-white/10 text-zinc-400'
          }`}
        >
          {showJointMarkers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>Joints</span>
        </button>

        <button
          onClick={() => setShowIKHandles(!showIKHandles)}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-[11px] font-medium transition ${
            showIKHandles
              ? 'bg-sky-500/20 border-sky-400/40 text-sky-200'
              : 'bg-white/5 border-white/10 text-zinc-400'
          }`}
        >
          <Move className="w-3.5 h-3.5" />
          <span>IK Handles</span>
        </button>

        <button
          onClick={() => togglePinFeetToFloor(activeChar.id)}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-[11px] font-medium transition ${
            activeChar.pinFeetToFloor
              ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
              : 'bg-white/5 border-white/10 text-zinc-400'
          }`}
        >
          <Anchor className="w-3.5 h-3.5" />
          <span>Pin Feet</span>
        </button>
      </div>

      {/* Surface Raycast Snapping */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => requestSurfaceSnap(activeChar.id, 'feet')}
          className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-emerald-200 text-[11px] font-semibold transition"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          <span>Snap Feet to Surface</span>
        </button>
        <button
          onClick={() => requestSurfaceSnap(activeChar.id, 'hips')}
          className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/35 text-purple-200 text-[11px] font-semibold transition"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          <span>Snap Hips to Surface</span>
        </button>
      </div>

      {/* IK Handle Quick Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Inverse Kinematics (Drag Handles)
          </span>
          {activeChar.pinFeetToFloor && (
            <span className="text-[10px] text-amber-300">Feet Anchored to Floor</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {IK_ITEMS.map((item) => {
            const active = selectedIKHandle === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (!showIKHandles) setShowIKHandles(true);
                  selectIKHandle(active ? null : item.id);
                }}
                className={`py-1.5 px-2 rounded-xl border text-xs font-medium transition ${
                  active
                    ? 'bg-indigo-500 text-white border-indigo-400'
                    : `bg-white/[0.04] border-white/8 hover:bg-white/10 ${item.colorClass}`
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hands & Fingers (30-Bone Rig Articulation) */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Hand className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-semibold text-zinc-100">
              Hands &amp; Fingers
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono">
              {activeChar.detectedFingerBoneCount}/30
            </span>
          </div>

          <div className="flex rounded-lg bg-black/40 p-0.5 border border-white/10">
            <button
              onClick={() => setActiveHandSide('left')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition ${
                activeHandSide === 'left'
                  ? 'bg-indigo-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Left
            </button>
            <button
              onClick={() => setActiveHandSide('right')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition ${
                activeHandSide === 'right'
                  ? 'bg-indigo-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Right
            </button>
          </div>
        </div>

        {/* One-Tap Hand Presets (8 studio & object-wrapping shapes) */}
        <div className="grid grid-cols-4 gap-1">
          {HAND_PRESET_KEYS.map((presetKey) => (
            <button
              key={presetKey}
              onClick={() => applyHandPreset(activeChar.id, activeHandSide, presetKey)}
              className="py-1.5 px-1 rounded-lg bg-white/5 hover:bg-indigo-500/25 border border-white/10 text-[10px] font-medium text-zinc-200 transition truncate"
            >
              {HAND_PRESETS[presetKey].label}
            </button>
          ))}
        </div>

        {/* Individual Finger Curl Sliders + Spread */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-0.5">
          {FINGER_LIST.map((f) => (
            <div key={f.key}>
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-300">{f.label} Curl</span>
                <span className="font-mono text-indigo-300">
                  {Math.round(handControls[f.key] * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={handControls[f.key]}
                onChange={(e) =>
                  handleFingerSliderChange(f.key, parseFloat(e.target.value))
                }
                onPointerUp={() => pushHistory()}
                className="studio-slider"
              />
            </div>
          ))}

          <div>
            <div className="flex justify-between text-[10px]">
              <span className="text-sky-300 font-medium">Finger Spread</span>
              <span className="font-mono text-sky-300">
                {Math.round(handControls.spread * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={-0.2}
              max={1}
              step={0.01}
              value={handControls.spread}
              onChange={(e) =>
                handleFingerSliderChange('spread', parseFloat(e.target.value))
              }
              onPointerUp={() => pushHistory()}
              className="studio-slider"
            />
          </div>
        </div>
      </div>

      {/* Mirror & Reset Tools */}
      <div className="grid grid-cols-4 gap-1.5">
        <button
          onClick={() => mirrorActivePose('swap')}
          className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-zinc-200 transition"
          title="Mirror entire pose Left <-> Right"
        >
          <FlipHorizontal2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Mirror</span>
        </button>
        <button
          onClick={() => mirrorActivePose('left-to-right')}
          className="py-2 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-zinc-300 transition"
        >
          L → R
        </button>
        <button
          onClick={() => mirrorActivePose('right-to-left')}
          className="py-2 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-zinc-300 transition"
        >
          R → L
        </button>
        <button
          onClick={resetActivePose}
          className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-white/5 hover:bg-rose-500/20 border border-white/10 text-[11px] font-medium text-zinc-300 hover:text-rose-200 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Precision FK Joint Rotation Sliders */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">
            {selectedBone ? `Rotate: ${JOINT_LABELS[selectedBone]}` : 'Tap Any Joint to Pose'}
          </span>
          {selectedBone && (
            <button
              onClick={() => {
                updateCharacterBones(activeChar.id, { [selectedBone]: [0, 0, 0] });
                pushHistory();
              }}
              className="text-[10px] text-indigo-300 hover:underline"
            >
              Zero Joint
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {MAJOR_JOINTS.map((j) => (
            <button
              key={j}
              onClick={() => selectBone(selectedBone === j ? null : j)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition ${
                selectedBone === j
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white/5 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {JOINT_LABELS[j]}
            </button>
          ))}
        </div>

        {selectedBone && (
          <div className="space-y-1.5 pt-1">
            {(['X Pitch', 'Y Yaw', 'Z Roll'] as const).map((label, idx) => {
              const axisIdx = idx as 0 | 1 | 2;
              return (
                <div key={label}>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">{label}</span>
                    <span className="font-mono text-indigo-300">
                      {Math.round(currentEuler[axisIdx])}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-160}
                    max={160}
                    step={1}
                    value={currentEuler[axisIdx]}
                    onChange={(e) => setAxisValue(axisIdx, parseFloat(e.target.value))}
                    onPointerUp={() => pushHistory()}
                    className="studio-slider"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
