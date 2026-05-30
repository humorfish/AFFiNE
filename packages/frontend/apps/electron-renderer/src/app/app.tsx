import { StoryLayout } from '@affine/core/components/story-layout/story-layout';
import { apis } from '@affine/electron-api';
import { useEffect } from 'react';

export function App() {
  useEffect(() => {
    apis?.ui?.pingAppLayoutReady?.().catch(console.error);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
  }, []);

  return <StoryLayout />;
}
