import React, { useRef } from 'react';
import {
  Upload,
  Trash2,
  Link2,
  Move,
  RotateCw,
  ArrowDownToLine,
  Box,
  Hand,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { useStudioStore } from '../../../store/useStudioStore';
import { PropAttachTarget, PropPrimitiveType, Vec3Tuple } from '../../../types/pose';
import { computeSmartBoneSnapTransform } from '../../../engine/fingerUtils';

const PRIMITIVE_CATALOG: Array<{
  kind: Exclude<PropPrimitiveType, 'custom-glb'>;
  label: string;
}> = [
  { kind: 'box', label: 'Box' },
  { kind: 'cylinder', label: 'Cylinder' },
  { kind: 'chair', label: 'Chair' },
  { kind: 'couch', label: 'Couch' },
  { kind: 'table', label: 'Table' },
  { kind: 'steps', label: 'Steps' },
];

const ATTACH_TARGETS: Array<{ id: PropAttachTarget; label: string }> = [
  { id: 'none', label: 'World Stage' },
  { id: 'rightHand', label: 'R. Hand (+Wrap)' },
  { id: 'leftHand', label: 'L. Hand (+Wrap)' },
  { id: 'rightLowerArm', label: 'R. Forearm' },
  { id: 'leftLowerArm', label: 'L. Forearm' },
  { id: 'head', label: 'Head' },
  { id: 'chest', label: 'Chest' },
  { id: 'hips', label: 'Hips / Waist' },
  { id: 'rightFoot', label: 'R. Foot' },
  { id: 'leftFoot', label: 'L. Foot' },
  { id: 'character-root', label: 'Whole Figure' },
];

export const PropsTab: React.FC = () => {
  const glbInputRef = useRef<HTMLInputElement>(null);

  const props = useStudioStore((s) => s.props);
  const selectedPropId = useStudioStore((s) => s.selectedPropId);
  const propGizmoMode = useStudioStore((s) => s.propGizmoMode);
  const activeCharacterId = useStudioStore((s) => s.activeCharacterId);
  const characters = useStudioStore((s) => s.characters);

  const setActiveCharacter = useStudioStore((s) => s.setActiveCharacter);
  const addPrimitiveProp = useStudioStore((s) => s.addPrimitiveProp);
  const addCustomGlbProp = useStudioStore((s) => s.addCustomGlbProp);
  const selectProp = useStudioStore((s) => s.selectProp);
  const setPropGizmoMode = useStudioStore((s) => s.setPropGizmoMode);
  const updateProp = useStudioStore((s) => s.updateProp);
  const removeProp = useStudioStore((s) => s.removeProp);
  const attachPropToBone = useStudioStore((s) => s.attachPropToBone);
  const parentPropToProp = useStudioStore((s) => s.parentPropToProp);
  const wrapHandAroundProp = useStudioStore((s) => s.wrapHandAroundProp);
  const requestSurfaceSnap = useStudioStore((s) => s.requestSurfaceSnap);

  const activeChar =
    characters.find((c) => c.id === activeCharacterId) ?? characters[0];
  const selectedProp = props.find((p) => p.id === selectedPropId) ?? null;

  const handleGlbUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    addCustomGlbProp(file.name, url);
    e.target.value = '';
  };

  const setDimension = (idx: 0 | 1 | 2, val: number) => {
    if (!selectedProp) return;
    const next: Vec3Tuple = [...selectedProp.dimensions];
    next[idx] = val;
    updateProp(selectedProp.id, { dimensions: next });
    // If held in a hand, dynamically re-wrap fingers to the new diameter!
    if (
      selectedProp.attachedBone === 'rightHand' ||
      selectedProp.attachedBone === 'leftHand'
    ) {
      wrapHandAroundProp(selectedProp.id);
    }
  };

  const setOffsetAxis = (idx: 0 | 1 | 2, val: number) => {
    if (!selectedProp) return;
    const next: Vec3Tuple = [...selectedProp.position];
    next[idx] = val;
    updateProp(selectedProp.id, { position: next });
  };

  const setRotationAxis = (idx: 0 | 1 | 2, val: number) => {
    if (!selectedProp) return;
    const next: Vec3Tuple = [...selectedProp.rotation];
    next[idx] = val;
    updateProp(selectedProp.id, { rotation: next });
  };

  const isAttachedToHand =
    selectedProp?.attachedBone === 'rightHand' ||
    selectedProp?.attachedBone === 'leftHand';

  const isParented =
    Boolean(selectedProp?.parentPropId) ||
    (selectedProp && selectedProp.attachedBone !== 'none');

  const otherProps = selectedProp
    ? props.filter((p) => p.id !== selectedProp.id)
    : [];

  return (
    <div className="space-y-3.5">
      {/* Spawn Studio Primitives */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
          Spawn Studio Props
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRIMITIVE_CATALOG.map((item) => (
            <button
              key={item.kind}
              onClick={() => addPrimitiveProp(item.kind)}
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-white/[0.04] hover:bg-indigo-500/20 border border-white/10 hover:border-indigo-400/40 text-xs font-medium text-zinc-200 transition"
            >
              <Box className="w-3.5 h-3.5 text-indigo-400" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => glbInputRef.current?.click()}
          className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition"
        >
          <Upload className="w-3.5 h-3.5 text-indigo-400" />
          <span>Import Custom .GLB Prop</span>
        </button>
        <input
          ref={glbInputRef}
          type="file"
          accept=".glb,.gltf"
          className="hidden"
          onChange={handleGlbUpload}
        />
      </div>

      {/* Surface Interaction Snapping */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => requestSurfaceSnap(activeChar.id, 'feet')}
          className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-emerald-200 text-[11px] font-semibold transition"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          <span>Snap Feet to Surface</span>
        </button>
        <button
          onClick={() => requestSurfaceSnap(activeChar.id, 'hips')}
          className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/35 text-purple-200 text-[11px] font-semibold transition"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          <span>Snap Hips to Surface</span>
        </button>
      </div>

      {/* Scene Props List */}
      {props.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Scene Props ({props.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {props.map((p) => {
              const active = p.id === selectedPropId;
              return (
                <div
                  key={p.id}
                  onClick={() => selectProp(active ? null : p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      selectProp(active ? null : p.id);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer transition ${
                    active
                      ? 'bg-indigo-500/25 border-indigo-400/50 text-indigo-100'
                      : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  <span className="font-medium">{p.name}</span>
                  {(p.attachedBone !== 'none' || p.parentPropId) && (
                    <Link2 className="w-3 h-3 text-sky-400" />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeProp(p.id);
                    }}
                    className="p-0.5 text-zinc-500 hover:text-rose-400"
                    title="Delete prop"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Prop Inspector */}
      {selectedProp ? (
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-3">
          {/* Header & Gizmo Switcher */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-100 truncate">
              {selectedProp.name}
            </span>
            <div className="flex rounded-lg bg-black/40 p-0.5 border border-white/10">
              <button
                onClick={() => setPropGizmoMode('translate')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition ${
                  propGizmoMode === 'translate'
                    ? 'bg-indigo-500 text-white'
                    : 'text-zinc-400'
                }`}
              >
                <Move className="w-3 h-3" />
                <span>3D Move</span>
              </button>
              <button
                onClick={() => setPropGizmoMode('rotate')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition ${
                  propGizmoMode === 'rotate'
                    ? 'bg-indigo-500 text-white'
                    : 'text-zinc-400'
                }`}
              >
                <RotateCw className="w-3 h-3" />
                <span>3D Rotate</span>
              </button>
            </div>
          </div>

          {/* 1. Snap & Parent to Mannequin Body Part */}
          <div className="space-y-1.5 pt-1 border-t border-white/8">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-300 font-medium flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5 text-sky-400" />
                Snap &amp; Parent to Mannequin
              </span>
              {characters.length > 1 && (
                <div className="flex rounded bg-black/40 p-0.5 border border-white/10">
                  {characters.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCharacter(c.id)}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-medium ${
                        c.id === activeChar.id
                          ? 'bg-indigo-500 text-white'
                          : 'text-zinc-400'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1">
              {ATTACH_TARGETS.map((t) => {
                const active =
                  !selectedProp.parentPropId &&
                  selectedProp.attachedBone === t.id &&
                  (t.id === 'none' ||
                    selectedProp.attachedCharacterId === activeChar.id);
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      attachPropToBone(
                        selectedProp.id,
                        t.id === 'none' ? null : activeChar.id,
                        t.id,
                        true
                      )
                    }
                    className={`py-1.5 px-1.5 rounded-lg border text-[10px] font-medium transition truncate ${
                      active
                        ? 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Parent / Stack onto Another Prop (Object-to-Object Parenting) */}
          {otherProps.length > 0 && (
            <div className="space-y-1.5 pt-1.5 border-t border-white/8">
              <div className="flex items-center gap-1 text-[11px] text-zinc-300 font-medium">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Parent / Stack onto Another Object</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {otherProps.map((op) => {
                  const isParent = selectedProp.parentPropId === op.id;
                  return (
                    <button
                      key={op.id}
                      onClick={() =>
                        parentPropToProp(
                          selectedProp.id,
                          isParent ? null : op.id,
                          true
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg border text-[10px] font-medium transition ${
                        isParent
                          ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                          : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      {isParent ? `On ${op.name} (Detach)` : `Stack on ${op.name}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Adaptive Hand Wrap Tightness (when held in Left or Right Hand) */}
          {isAttachedToHand && (
            <div className="p-2.5 rounded-xl bg-sky-950/25 border border-sky-400/25 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-sky-200 flex items-center gap-1">
                  <Hand className="w-3.5 h-3.5 text-sky-400" />
                  Hand Wrap Around Object
                </span>
                <button
                  onClick={() => wrapHandAroundProp(selectedProp.id)}
                  className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 font-medium transition"
                >
                  Re-Wrap Fingers
                </button>
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-300">
                  <span>Finger Wrap Tightness</span>
                  <span className="font-mono text-sky-300">
                    {Math.round((selectedProp.gripTightness ?? 0.68) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={selectedProp.gripTightness ?? 0.68}
                  onChange={(e) =>
                    wrapHandAroundProp(
                      selectedProp.id,
                      parseFloat(e.target.value)
                    )
                  }
                  className="studio-slider"
                />
              </div>
            </div>
          )}

          {/* 4. Precision In-Hand / Local Offset & Rotation Adjustments */}
          <div className="space-y-2 pt-1.5 border-t border-white/8">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-200">
                {isAttachedToHand
                  ? 'Fine-Tune Position & Angle in Hand'
                  : isParented
                  ? 'Local Offset & Rotation on Parent'
                  : 'Stage Position & Rotation'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() =>
                    setRotationAxis(0, (selectedProp.rotation[0] + 90) % 360)
                  }
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-indigo-300"
                  title="Rotate 90° around X axis"
                >
                  Flip 90°
                </button>
                <button
                  onClick={() => {
                    if (selectedProp.attachedBone !== 'none') {
                      const snap = computeSmartBoneSnapTransform(
                        selectedProp.attachedBone,
                        selectedProp.kind,
                        selectedProp.dimensions
                      );
                      updateProp(selectedProp.id, snap);
                    } else {
                      updateProp(selectedProp.id, {
                        position: [0, 0, 0],
                        rotation: [0, 0, 0],
                      });
                    }
                  }}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-0.5"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset Grip</span>
                </button>
              </div>
            </div>

            {/* Position Offset Sliders (fine range when attached to bone, wide range on stage) */}
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  isAttachedToHand ? 'Slide X' : 'Pos X',
                  isAttachedToHand ? 'Palm Depth Y' : 'Pos Y',
                  isAttachedToHand ? 'Grip Slide Z' : 'Pos Z',
                ] as const
              ).map((label, idx) => {
                const i = idx as 0 | 1 | 2;
                const minVal = isAttachedToHand ? -0.45 : -2.2;
                const maxVal = isAttachedToHand ? 0.45 : 2.2;
                const stepVal = isAttachedToHand ? 0.005 : 0.02;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-[9.5px] text-zinc-400">
                      <span>{label}</span>
                      <span className="font-mono text-sky-300">
                        {selectedProp.position[i].toFixed(2)}m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={minVal}
                      max={maxVal}
                      step={stepVal}
                      value={selectedProp.position[i]}
                      onChange={(e) =>
                        setOffsetAxis(i, parseFloat(e.target.value))
                      }
                      className="studio-slider"
                    />
                  </div>
                );
              })}
            </div>

            {/* Rotation Tilt / Roll / Spin Sliders */}
            <div className="grid grid-cols-3 gap-2">
              {(['Tilt X', 'Roll Y', 'Spin Z'] as const).map((label, idx) => {
                const i = idx as 0 | 1 | 2;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-[9.5px] text-zinc-400">
                      <span>{label}</span>
                      <span className="font-mono text-indigo-300">
                        {Math.round(selectedProp.rotation[i])}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={selectedProp.rotation[i]}
                      onChange={(e) =>
                        setRotationAxis(i, parseFloat(e.target.value))
                      }
                      className="studio-slider"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Dimensions: Width / Height / Depth */}
          <div className="space-y-1.5 pt-1.5 border-t border-white/8">
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Object Dimensions
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {(['Width / Diam', 'Height / Len', 'Depth'] as const).map(
                (label, idx) => {
                  const i = idx as 0 | 1 | 2;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-[9.5px] text-zinc-400">
                        <span>{label}</span>
                        <span className="font-mono text-indigo-300">
                          {selectedProp.dimensions[i].toFixed(2)}m
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.02}
                        max={2.4}
                        step={0.01}
                        value={selectedProp.dimensions[i]}
                        onChange={(e) =>
                          setDimension(i, parseFloat(e.target.value))
                        }
                        className="studio-slider"
                      />
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-xl border border-dashed border-white/10 text-center text-[11px] text-zinc-400">
          Spawn a prop above, then tap it to snap into a hand (with auto finger-wrap), fine-tune its grip offset, or stack onto another object.
        </div>
      )}
    </div>
  );
};
