import { app, Menu } from 'electron';

import { isMacOS } from '../../shared/utils';
import { revealLogFile } from '../logger';
import { checkForUpdates } from '../updater';
import {
  initAndShowMainWindow,
  reloadView,
  showDevTools,
  showMainWindow,
} from '../windows-manager';
import { applicationMenuSubjects } from './subject';

// Unique id for menuitems
const MENUITEM_NEW_PAGE = 'affine:new-page';

export function createApplicationMenu() {
  const isMac = isMacOS();

  const template = [
    // { role: 'appMenu' }
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: `About ${app.getName()}`,
                click: async () => {
                  await showMainWindow();
                  applicationMenuSubjects.openInSettingModal$.next({
                    activeTab: 'about',
                  });
                },
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        {
          id: MENUITEM_NEW_PAGE,
          label: 'New Doc',
          accelerator: isMac ? 'Cmd+N' : 'Ctrl+N',
          click: async () => {
            await initAndShowMainWindow();
            applicationMenuSubjects.newPageAction$.next('default');
          },
        },
      ],
    },
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              {
                label: 'Speech',
                submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
              },
            ]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
      ],
    },
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CommandOrControl+R',
          click() {
            reloadView().catch(console.error);
          },
        },
        {
          label: 'Open devtools',
          accelerator: isMac ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
          click: () => {
            showDevTools();
          },
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        ...(!isMacOS()
          ? [{ role: 'zoomIn', accelerator: 'Ctrl+=', visible: false }]
          : []),
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            // oxlint-disable-next-line no-var-requires
            const { shell } = require('electron');
            await shell.openExternal('https://affine.pro/');
          },
        },
        {
          label: 'Open log file',
          click: async () => {
            await revealLogFile();
          },
        },
        {
          label: 'Check for Updates',
          click: async () => {
            await initAndShowMainWindow();
            await checkForUpdates();
          },
        },
        {
          label: 'Documentation',
          click: async () => {
            // oxlint-disable-next-line no-var-requires
            const { shell } = require('electron');
            await shell.openExternal(
              'https://docs.affine.pro/docs/hello-bonjour-aloha-你好'
            );
          },
        },
      ],
    },
  ];

  // @ts-expect-error: The snippet is copied from Electron official docs.
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  return menu;
}
