import { useEffect } from 'react';

import { apis } from '@affine/electron-api';
import { StoryLayout } from '@affine/core/components/story-layout/story-layout';

export function App() {
  useEffect(() => {
    apis?.ui?.pingAppLayoutReady?.().catch(console.error);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  return <StoryLayout />;
}
