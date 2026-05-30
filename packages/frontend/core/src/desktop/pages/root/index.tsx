// @ts-nocheck
// TODO(story): cloud removed - RootWrapper simplified for Story
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

export const RootWrapper = () => {
  const [ready, setReady] = useState(true);

  return (
    <>
      <Outlet />
    </>
  );
};
