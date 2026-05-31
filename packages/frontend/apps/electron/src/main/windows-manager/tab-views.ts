import { BrowserWindow, type WebContents } from 'electron';

import { isMacOS } from '../../shared/utils';
import { getMainWindow } from './main-window';

export async function handleWebContentsResize(webContents?: WebContents) {
  if (isMacOS()) {
    const window = await getMainWindow();
    const factor = webContents?.getZoomFactor() || 1;
    window?.setWindowButtonPosition({ x: 14 * factor, y: 14 * factor - 2 });
  }
}

export const showDevTools = () => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) {
    focusedWindow.webContents.openDevTools();
  }
};

export const reloadView = async () => {
  const window = await getMainWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.reload();
  }
};
