import React, { useRef, useState } from 'react';
import { Save, Trash2, Download, Upload } from 'lucide-react';
import { useStudioStore } from '../../../store/useStudioStore';
import { PoseCategory } from '../../../types/pose';

const CATEGORIES: Array<'All' | PoseCategory> = [
  'All',
  'Standing',
  'Action',
  'Seated',
  'Ground / All-Fours',
  'Custom',
];

export const PosesTab: React.FC = () => {
  const sceneFileRef = useRef<HTMLInputElement>(null);
  const [selectedCat, setSelectedCat] = useState<'All' | PoseCategory>('All');
  const [newPoseName, setNewPoseName] = useState('');

  const starterPoses = useStudioStore((s) => s.starterPoses);
  const customPoses = useStudioStore((s) => s.customPoses);
  const characters = useStudioStore((s) => s.characters);
  const activeCharacterId = useStudioStore((s) => s.activeCharacterId);
  const applyPose = useStudioStore((s) => s.applyPose);
  const saveCustomPose = useStudioStore((s) => s.saveCustomPose);
  const deleteCustomPose = useStudioStore((s) => s.deleteCustomPose);
  const buildSceneExport = useStudioStore((s) => s.buildSceneExport);
  const importSceneData = useStudioStore((s) => s.importSceneData);
  const showToast = useStudioStore((s) => s.showToast);

  const activeChar =
    characters.find((c) => c.id === activeCharacterId) ?? characters[0];

  const allPoses = [...customPoses, ...starterPoses];
  const filteredPoses =
    selectedCat === 'All'
      ? allPoses
      : allPoses.filter((p) => p.category === selectedCat);

  const handleSavePose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPoseName.trim()) return;
    saveCustomPose(newPoseName);
    setNewPoseName('');
    setSelectedCat('Custom');
  };

  const handleExportScene = () => {
    const data = buildSceneExport();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poselab-scene-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported scene .json');
  };

  const handleImportScene = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        importSceneData(parsed);
      } catch {
        showToast('Could not parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3.5">
      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 studio-scroll">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCat(cat)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
              selectedCat === cat
                ? 'bg-indigo-500 text-white'
                : 'bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
            }`}
          >
            {cat}
            {cat === 'Custom' && customPoses.length > 0
              ? ` (${customPoses.length})`
              : ''}
          </button>
        ))}
      </div>

      {/* Pose Cards Grid */}
      <div className="grid grid-cols-2 gap-2">
        {filteredPoses.length === 0 ? (
          <div className="col-span-2 py-6 text-center text-xs text-zinc-500 rounded-xl border border-dashed border-white/10">
            No poses in this category yet. Save your current pose below!
          </div>
        ) : (
          filteredPoses.map((pose) => {
            const isActive = activeChar.activePoseId === pose.id;
            return (
              <div
                key={pose.id}
                onClick={() => applyPose(activeChar.id, pose.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    applyPose(activeChar.id, pose.id);
                  }
                }}
                className={`group relative text-left p-2.5 rounded-xl border cursor-pointer transition ${
                  isActive
                    ? 'bg-indigo-500/20 border-indigo-400/50 shadow-sm'
                    : 'bg-white/[0.03] border-white/8 hover:bg-white/[0.07]'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-semibold text-zinc-100 leading-tight">
                    {pose.name}
                  </span>
                  {pose.isCustom && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCustomPose(pose.id);
                      }}
                      className="p-1 -m-1 rounded text-zinc-500 hover:text-rose-400"
                      title="Delete custom pose"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-indigo-300/80 mt-0.5">
                  {pose.category}
                </div>
                {pose.description && (
                  <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2 leading-snug">
                    {pose.description}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Save Current Pose + Export/Import Scene JSON */}
      <div className="pt-2 border-t border-white/10 space-y-2.5">
        <form onSubmit={handleSavePose} className="flex gap-1.5">
          <input
            type="text"
            value={newPoseName}
            onChange={(e) => setNewPoseName(e.target.value)}
            placeholder="Name current pose to save..."
            className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-400"
          />
          <button
            type="submit"
            disabled={!newPoseName.trim()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white text-xs font-semibold transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        </form>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleExportScene}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 transition"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export Scene .JSON</span>
          </button>
          <button
            onClick={() => sceneFileRef.current?.click()}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 transition"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>Import Scene .JSON</span>
          </button>
          <input
            ref={sceneFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportScene}
          />
        </div>
      </div>
    </div>
  );
};
