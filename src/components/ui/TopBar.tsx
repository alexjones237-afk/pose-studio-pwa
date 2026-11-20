import React, { useState } from 'react';
import {
  Camera,
  Undo2,
  Redo2,
  X,
  Check,
  Sparkles,
  Download,
  Rotate3d,
} from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';
import { JOINT_LABELS } from '../../types/pose';

export const TopBar: React.FC = () => {
  const characters = useStudioStore((s) => s.characters);
  const activeCharacterId = useStudioStore((s) => s.activeCharacterId);
  const setActiveCharacter = useStudioStore((s) => s.setActiveCharacter);
  const selectedBone = useStudioStore((s) => s.selectedBone);
  const selectedIKHandle = useStudioStore((s) => s.selectedIKHandle);
  const selectedPropId = useStudioStore((s) => s.selectedPropId);
  const wholeModelGizmoMode = useStudioStore((s) => s.wholeModelGizmoMode);
  const props = useStudioStore((s) => s.props);
  const selectBone = useStudioStore((s) => s.selectBone);
  const selectIKHandle = useStudioStore((s) => s.selectIKHandle);
  const selectProp = useStudioStore((s) => s.selectProp);
  const setWholeModelGizmoMode = useStudioStore((s) => s.setWholeModelGizmoMode);

  const historyIndex = useStudioStore((s) => s.historyIndex);
  const historyLen = useStudioStore((s) => s.history.length);
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);

  const requestExportPng = useStudioStore((s) => s.requestExportPng);
  const isExporting = useStudioStore((s) => s.isExporting);
  const toastMessage = useStudioStore((s) => s.toastMessage);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [transparentBg, setTransparentBg] = useState(true);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLen - 1;

  const selectedProp = selectedPropId
    ? props.find((p) => p.id === selectedPropId)
    : null;

  const selectionLabel =
    wholeModelGizmoMode !== 'none'
      ? `Whole Model: ${wholeModelGizmoMode === 'rotate' ? 'Rotate' : 'Move'}`
      : selectedBone
      ? `Joint: ${JOINT_LABELS[selectedBone]}`
      : selectedIKHandle
      ? `IK: ${selectedIKHandle.replace(/([A-Z])/g, ' $1')}`
      : selectedProp
      ? `Prop: ${selectedProp.name}`
      : null;

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-30 pointer-events-none px-3 pt-3 sm:px-4">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-2">
          {/* Left: Brand & Character Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#18181f]/85 backdrop-blur-md border border-white/10 shadow-lg">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-semibold tracking-wide text-zinc-100">
                PoseLab<span className="text-indigo-400 ml-0.5">3D</span>
              </span>
            </div>

            {characters.length > 1 && (
              <div className="flex items-center p-0.5 rounded-xl bg-[#18181f]/85 backdrop-blur-md border border-white/10 shadow-lg">
                {characters.map((c) => {
                  const active = c.id === activeCharacterId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveCharacter(c.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        active
                          ? 'bg-indigo-500 text-white shadow'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}

            {selectionLabel && (
              <button
                onClick={() => {
                  selectBone(null);
                  selectIKHandle(null);
                  selectProp(null);
                  setWholeModelGizmoMode('none');
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-400/40 backdrop-blur-md text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/30 transition"
                title="Clear selection"
              >
                <span className="capitalize">{selectionLabel}</span>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Right: Rotate Model + Undo/Redo + Export PNG */}
          <div className="flex items-center gap-1.5 pointer-events-auto relative">
            <button
              onClick={() =>
                setWholeModelGizmoMode(
                  wholeModelGizmoMode === 'rotate' ? 'none' : 'rotate'
                )
              }
              className={`flex items-center gap-1 px-2.5 py-2 rounded-xl border text-xs font-medium backdrop-blur-md shadow-lg transition ${
                wholeModelGizmoMode !== 'none'
                  ? 'bg-sky-500/25 border-sky-400/60 text-sky-200'
                  : 'bg-[#18181f]/85 border-white/10 text-zinc-200 hover:bg-white/10'
              }`}
              title="Rotate whole model in 3D world space"
            >
              <Rotate3d className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">Rotate Model</span>
            </button>
            <div className="flex items-center rounded-xl bg-[#18181f]/85 backdrop-blur-md border border-white/10 shadow-lg overflow-hidden">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-2 text-zinc-200 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition"
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-white/10" />
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-2 text-zinc-200 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition"
                aria-label="Redo"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-indigo-950/50 transition disabled:opacity-60"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Export PNG</span>
            </button>

            {exportMenuOpen && (
              <div className="absolute right-0 top-12 w-60 rounded-2xl bg-[#1a1a23]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100">
                    High-Res Reference Export
                  </span>
                  <button
                    onClick={() => setExportMenuOpen(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-zinc-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Hides gizmos, joint dots, IK handles, and grid automatically for Clip Studio Paint.
                </p>

                <button
                  onClick={() => setTransparentBg((v) => !v)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition"
                >
                  <span className="text-zinc-200">Transparent Background</span>
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      transparentBg
                        ? 'bg-indigo-500 border-indigo-400 text-white'
                        : 'border-zinc-500 text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3" />
                  </span>
                </button>

                <button
                  onClick={() => {
                    setExportMenuOpen(false);
                    requestExportPng(transparentBg);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold shadow transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save PNG Screenshot</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="px-3.5 py-1.5 rounded-full bg-zinc-900/95 border border-indigo-400/30 text-xs font-medium text-indigo-100 shadow-xl backdrop-blur-md">
            {toastMessage}
          </div>
        </div>
      )}
    </>
  );
};
