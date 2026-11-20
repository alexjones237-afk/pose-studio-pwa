import React from 'react';
import {
  Rotate3d,
  Move,
  Crosshair,
  Hand,
  RotateCcw,
  FlipHorizontal2,
  RotateCw,
  ArrowDownToLine,
} from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';
import { JOINT_LABELS } from '../../types/pose';

/**
 * Floating on-canvas quick context bar giving 1-tap access to:
 * - Whole Model Rotate / Move vs Joint Posing / IK Handles
 * - Context actions when a Prop is selected (Snap to R.Hand + Auto-Wrap, L.Hand, Move/Rotate gizmo)
 * - Context actions when a Joint is selected (Zero Joint, Mirror Pose)
 */
export const FloatingContextBar: React.FC = () => {
  const activeCharacterId = useStudioStore((s) => s.activeCharacterId);
  const selectedBone = useStudioStore((s) => s.selectedBone);
  const selectedPropId = useStudioStore((s) => s.selectedPropId);
  const props = useStudioStore((s) => s.props);
  const propGizmoMode = useStudioStore((s) => s.propGizmoMode);
  const wholeModelGizmoMode = useStudioStore((s) => s.wholeModelGizmoMode);
  const showJointMarkers = useStudioStore((s) => s.showJointMarkers);
  const showIKHandles = useStudioStore((s) => s.showIKHandles);
  const isExporting = useStudioStore((s) => s.isExporting);

  const setWholeModelGizmoMode = useStudioStore((s) => s.setWholeModelGizmoMode);
  const setShowJointMarkers = useStudioStore((s) => s.setShowJointMarkers);
  const setShowIKHandles = useStudioStore((s) => s.setShowIKHandles);
  const setPropGizmoMode = useStudioStore((s) => s.setPropGizmoMode);
  const attachPropToBone = useStudioStore((s) => s.attachPropToBone);
  const updateCharacterBones = useStudioStore((s) => s.updateCharacterBones);
  const mirrorActivePose = useStudioStore((s) => s.mirrorActivePose);
  const requestSurfaceSnap = useStudioStore((s) => s.requestSurfaceSnap);
  const pushHistory = useStudioStore((s) => s.pushHistory);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);

  if (isExporting) return null;

  const selectedProp = selectedPropId
    ? props.find((p) => p.id === selectedPropId) ?? null
    : null;

  return (
    <div className="fixed top-14 inset-x-0 z-20 pointer-events-none flex justify-center px-3">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-[#16161d]/85 backdrop-blur-md border border-white/10 shadow-xl">
        {/* Context 1: Selected Prop Quick Actions */}
        {selectedProp ? (
          <>
            <span className="text-[11px] font-semibold text-indigo-300 px-1.5">
              {selectedProp.name}
            </span>
            <button
              onClick={() =>
                setPropGizmoMode(
                  propGizmoMode === 'translate' ? 'rotate' : 'translate'
                )
              }
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium text-zinc-100 transition"
            >
              {propGizmoMode === 'translate' ? (
                <>
                  <RotateCw className="w-3 h-3 text-indigo-300" />
                  <span>Switch to Rotate</span>
                </>
              ) : (
                <>
                  <Move className="w-3 h-3 text-indigo-300" />
                  <span>Switch to Move</span>
                </>
              )}
            </button>

            <button
              onClick={() =>
                attachPropToBone(
                  selectedProp.id,
                  activeCharacterId,
                  'rightHand',
                  true
                )
              }
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition ${
                selectedProp.attachedBone === 'rightHand'
                  ? 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                  : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'
              }`}
            >
              <Hand className="w-3 h-3 text-sky-400" />
              <span>Snap R.Hand</span>
            </button>

            <button
              onClick={() =>
                attachPropToBone(
                  selectedProp.id,
                  activeCharacterId,
                  'leftHand',
                  true
                )
              }
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition ${
                selectedProp.attachedBone === 'leftHand'
                  ? 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                  : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'
              }`}
            >
              <Hand className="w-3 h-3 text-sky-400" />
              <span>Snap L.Hand</span>
            </button>

            <button
              onClick={() => setActiveTab('props')}
              className="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-[11px] font-medium text-indigo-200 transition"
            >
              Fine-Tune Grip
            </button>
          </>
        ) : selectedBone ? (
          /* Context 2: Selected Joint Quick Actions */
          <>
            <span className="text-[11px] font-semibold text-indigo-300 px-1.5">
              {JOINT_LABELS[selectedBone]}
            </span>
            <button
              onClick={() => {
                updateCharacterBones(activeCharacterId, {
                  [selectedBone]: [0, 0, 0],
                });
                pushHistory();
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-zinc-200 transition"
            >
              <RotateCcw className="w-3 h-3 text-indigo-400" />
              <span>Zero Joint</span>
            </button>
            <button
              onClick={() => mirrorActivePose('swap')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-zinc-200 transition"
            >
              <FlipHorizontal2 className="w-3 h-3 text-indigo-400" />
              <span>Mirror Pose</span>
            </button>
            <button
              onClick={() => setWholeModelGizmoMode('rotate')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-[11px] font-medium text-sky-200 transition"
            >
              <Rotate3d className="w-3 h-3" />
              <span>Whole Model</span>
            </button>
          </>
        ) : (
          /* Context 3: Default Stage Mode Switcher */
          <>
            <button
              onClick={() => {
                setWholeModelGizmoMode('none');
                setShowJointMarkers(!showJointMarkers);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium transition ${
                wholeModelGizmoMode === 'none' && showJointMarkers
                  ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Crosshair className="w-3 h-3" />
              <span>Joints</span>
            </button>

            <button
              onClick={() => {
                setWholeModelGizmoMode('none');
                setShowIKHandles(!showIKHandles);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium transition ${
                wholeModelGizmoMode === 'none' && showIKHandles
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Move className="w-3 h-3" />
              <span>IK Drag</span>
            </button>

            <button
              onClick={() =>
                setWholeModelGizmoMode(
                  wholeModelGizmoMode === 'rotate' ? 'none' : 'rotate'
                )
              }
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium transition ${
                wholeModelGizmoMode === 'rotate'
                  ? 'bg-sky-500 text-white shadow'
                  : 'text-zinc-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Rotate3d className="w-3 h-3" />
              <span>Rotate Model</span>
            </button>

            <button
              onClick={() =>
                setWholeModelGizmoMode(
                  wholeModelGizmoMode === 'translate' ? 'none' : 'translate'
                )
              }
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium transition ${
                wholeModelGizmoMode === 'translate'
                  ? 'bg-sky-500 text-white shadow'
                  : 'text-zinc-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Move className="w-3 h-3" />
              <span>Move Model</span>
            </button>

            {props.length > 0 && (
              <button
                onClick={() => requestSurfaceSnap(activeCharacterId, 'hips')}
                className="flex items-center gap-1 px-2 py-1 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/35 text-[11px] font-medium text-purple-200 transition"
                title="Snap Hips onto Chair/Couch/Prop surface"
              >
                <ArrowDownToLine className="w-3 h-3" />
                <span>Sit on Surface</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
