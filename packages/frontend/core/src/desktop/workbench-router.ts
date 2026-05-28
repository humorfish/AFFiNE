import type { RouteObject } from 'react-router-dom';

export const workbenchRoutes = [
  // Story routes
  {
    path: '/chapters',
    lazy: () =>
      import('./pages/workspace/story/chapters').then(m => ({
        Component: m.ChaptersPage,
      })),
  },
  {
    path: '/chapters/:index',
    lazy: () =>
      import('./pages/workspace/story/chapter-editor').then(m => ({
        Component: m.ChapterEditorPage,
      })),
  },
  {
    path: '/story/settings',
    lazy: () =>
      import('./pages/workspace/story/story-settings').then(m => ({
        Component: m.StorySettingsPage,
      })),
  },
  // Existing routes (kept for compatibility)
  {
    path: '/chat',
    lazy: () => import('./pages/workspace/chat/index'),
  },
  {
    path: '/all',
    lazy: () => import('./pages/workspace/all-page/all-page'),
  },
  {
    path: '/collection',
    lazy: () => import('./pages/workspace/all-collection'),
  },
  {
    path: '/collection/:collectionId',
    lazy: () => import('./pages/workspace/collection/index'),
  },
  {
    path: '/tag',
    lazy: () => import('./pages/workspace/all-tag'),
  },
  {
    path: '/tag/:tagId',
    lazy: () => import('./pages/workspace/tag'),
  },
  {
    path: '/trash',
    lazy: () => import('./pages/workspace/trash-page'),
  },
  {
    path: '/:pageId',
    lazy: () => import('./pages/workspace/detail-page/detail-page'),
  },
  {
    path: '/:pageId/attachments/:attachmentId',
    lazy: () => import('./pages/workspace/attachment/index'),
  },
  {
    path: '/journals',
    lazy: () => import('./pages/workspace/journals'),
  },
  {
    path: '/settings',
    lazy: () => import('./pages/workspace/settings'),
  },
  {
    path: '*',
    lazy: () => import('./pages/404'),
  },
] satisfies RouteObject[];
