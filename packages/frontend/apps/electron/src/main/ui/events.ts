import type { MainEventRegister } from '../type';
import { uiSubjects } from './subject';

/**
 * Events triggered by application menu
 */
export const uiEvents = {
  onMaximized: (fn: (maximized: boolean) => void) => {
    const sub = uiSubjects.onMaximized$.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onFullScreen: (fn: (fullScreen: boolean) => void) => {
    const sub = uiSubjects.onFullScreen$.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onAuthenticationRequest: (fn: (state: any) => void) => {
    const sub = uiSubjects.authenticationRequest$.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
