import React, { useEffect } from 'react';
import { StudioCanvas } from './components/viewport/StudioCanvas';
import { TopBar } from './components/ui/TopBar';
import { FloatingContextBar } from './components/ui/FloatingContextBar';
import { BottomSheet } from './components/ui/BottomSheet';
import { useStudioStore } from './store/useStudioStore';

export const App: React.FC = () => {
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);

  // Keyboard shortcuts for desktop/tablet users (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#121216]">
      <StudioCanvas />
      <TopBar />
      <FloatingContextBar />
      <BottomSheet />
    </main>
  );
};

export default App;
