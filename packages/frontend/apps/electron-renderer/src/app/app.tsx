import { StoryLayout } from '@affine/core/components/story-layout/story-layout';
import { useEffect } from 'react';

export function App() {
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
  }, []);

  return <StoryLayout />;
}
