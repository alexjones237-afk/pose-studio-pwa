import React from 'react';
import {
  Users,
  Sparkles,
  Crosshair,
  Box,
  Sliders,
  Waves,
  Sun,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';
import { ActiveTab, DrawerHeight } from '../../types/pose';
import { ModelsTab } from './tabs/ModelsTab';
import { PosesTab } from './tabs/PosesTab';
import { PoseIKTab } from './tabs/PoseIKTab';
import { PropsTab } from './tabs/PropsTab';
import { BodyTab } from './tabs/BodyTab';
import { PhysicsTab } from './tabs/PhysicsTab';
import { LightCamTab } from './tabs/LightCamTab';

const TABS: Array<{ id: ActiveTab; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'models', label: 'Models', icon: Users },
  { id: 'poses', label: 'Poses', icon: Sparkles },
  { id: 'pose-ik', label: 'Pose/IK', icon: Crosshair },
  { id: 'props', label: 'Props', icon: Box },
  { id: 'body', label: 'Body', icon: Sliders },
  { id: 'physics', label: 'Physics', icon: Waves },
  { id: 'light-cam', label: 'Light', icon: Sun },
];

export const BottomSheet: React.FC = () => {
  const activeTab = useStudioStore((s) => s.activeTab);
  const drawerHeight = useStudioStore((s) => s.drawerHeight);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const setDrawerHeight = useStudioStore((s) => s.setDrawerHeight);

  const cycleHeight = () => {
    const next: Record<DrawerHeight, DrawerHeight> = {
      collapsed: 'half',
      half: 'expanded',
      expanded: 'collapsed',
    };
    setDrawerHeight(next[drawerHeight]);
  };

  const toggleCollapse = () => {
    setDrawerHeight(drawerHeight === 'collapsed' ? 'half' : 'collapsed');
  };

  const contentHeightClass =
    drawerHeight === 'half'
      ? 'max-h-[38vh] sm:max-h-[330px] opacity-100'
      : 'max-h-[68vh] sm:max-h-[520px] opacity-100';

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none flex justify-center px-0 sm:px-4 sm:pb-3">
      <section className="pointer-events-auto w-full max-w-xl bg-[#16161d]/92 backdrop-blur-xl border-t sm:border border-white/10 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200">
        {/* Drag / Height Toggle Handle */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <button
            onClick={toggleCollapse}
            className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200 flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-white/5"
          >
            {drawerHeight === 'collapsed' ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Open Panel</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide</span>
              </>
            )}
          </button>

          <button
            onClick={cycleHeight}
            aria-label="Resize panel"
            className="w-12 h-1.5 rounded-full bg-white/20 hover:bg-indigo-400/70 transition-colors"
          />

          <button
            onClick={() =>
              setDrawerHeight(drawerHeight === 'expanded' ? 'half' : 'expanded')
            }
            className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded-md hover:bg-white/5"
          >
            {drawerHeight === 'expanded' ? 'Compact' : 'Expand'}
          </button>
        </div>

        {/* 7-Tab Bar */}
        <nav className="grid grid-cols-7 gap-0.5 px-1.5 pb-1.5 border-b border-white/8">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id && drawerHeight !== 'collapsed';
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (activeTab === tab.id && drawerHeight !== 'collapsed') {
                    setDrawerHeight('collapsed');
                  } else {
                    setActiveTab(tab.id);
                  }
                }}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="text-[9.5px] font-medium leading-none tracking-tight">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Scrollable Tab Body */}
        {drawerHeight !== 'collapsed' && (
          <div
            className={`overflow-y-auto studio-scroll transition-all duration-200 ease-out ${contentHeightClass}`}
          >
            <div className="p-3.5 pb-5">
              {activeTab === 'models' && <ModelsTab />}
              {activeTab === 'poses' && <PosesTab />}
              {activeTab === 'pose-ik' && <PoseIKTab />}
              {activeTab === 'props' && <PropsTab />}
              {activeTab === 'body' && <BodyTab />}
              {activeTab === 'physics' && <PhysicsTab />}
              {activeTab === 'light-cam' && <LightCamTab />}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
