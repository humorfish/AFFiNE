import { Framework, FrameworkRoot, LiveData } from '@toeverything/infra';
import React from 'react';

import { ServerService } from '@affine/core/modules/cloud';
import {
  EditorSettingService,
} from '@affine/core/modules/editor-setting';
import { ExplorerIconService } from '@affine/core/modules/explorer-icon/services/explorer-icon';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { JournalService } from '@affine/core/modules/journal';
import { AppThemeService } from '@affine/core/modules/theme';
import { WorkspaceService } from '@affine/core/modules/workspace';

const defaultSettings = {
  displayBiDirectionalLink: false,
  displayDocInfo: false,
  fontFamily: 'Sans',
  customFontFamily: '',
  fullWidthLayout: false,
  enableMiddleClickPaste: false,
};

const defaultFlags: Record<string, boolean> = {
  enable_ai: true,
  enable_editor_rtl: false,
  enable_advanced_block_visibility: false,
  enable_turbo_renderer: false,
  enable_pdf_embed_preview: false,
  enable_database_attachment_note: false,
  enable_edgeless_text: true,
};

const settingsLiveData = new LiveData(defaultSettings);
const serverConfigLiveData = new LiveData({ features: [] as string[], copilot: true });

// Flags must match the Flag interface: { $: LiveData<boolean>, value, set }
const flagsMap: Record<string, { $: LiveData<boolean>; value: boolean; set: (v: boolean) => void }> = {};
for (const [k, v] of Object.entries(defaultFlags)) {
  const ld = new LiveData(v);
  flagsMap[k] = { $: ld, value: v, set: () => {} };
}

/**
 * Creates a stub that behaves like a LiveData (for use with useLiveData)
 * while also being callable (for methods that return LiveData).
 *
 * Binds real Observable/LiveData methods so .map(), .pipe(), etc. work
 * when code treats the stub as an RxJS Observable.
 */
function createLiveDataStub(): any {
  // Use createServiceStub() as the LiveData value so that .getValue() returns
  // a proxy that handles $-suffixed properties (e.g., doc.properties$)
  const stubValue = createServiceStub();
  const ld = new LiveData(stubValue);
  const fn = function() { return fn; } as any;
  // Bind only methods that actually exist on LiveData
  fn.map = ld.map.bind(ld);
  fn.selector = ld.selector.bind(ld);
  fn.pipe = ld.pipe.bind(ld);
  fn.subscribe = ld.subscribe.bind(ld);
  fn.getValue = ld.getValue.bind(ld);
  fn.next = ld.next.bind(ld);
  fn.reactGetSnapshot = ld.reactGetSnapshot.bind(ld);
  fn.reactSubscribe = ld.reactSubscribe.bind(ld);
  fn.$ = fn;
  fn.value = stubValue;
  return fn;
}

/**
 * Creates a service stub for missing DI services.
 *
 * - Properties ending with `$` return a LiveData(null)-compatible object
 * - Other properties return nested stubs (for chaining)
 * - Primitive conversion returns empty string / null (for DOM attribute safety)
 */
function createServiceStub(): any {
  const cache = new Map<string, any>();

  return new Proxy(function() { return null; } as any, {
    get(_target, prop) {
      if (typeof prop === 'symbol') {
        if (prop === Symbol.toPrimitive) return () => '';
        return undefined;
      }
      if (prop === 'toString') return () => '';
      if (prop === 'valueOf') return () => null;
      if (prop === '$$typeof') return undefined;
      if (prop === 'constructor') return undefined;

      if (!cache.has(prop)) {
        if (typeof prop === 'string' && prop.endsWith('$')) {
          cache.set(prop, createLiveDataStub());
        } else {
          cache.set(prop, createServiceStub());
        }
      }
      return cache.get(prop);
    },
    set() { return true; },
    apply() { return null; },
  });
}

const framework = Framework.EMPTY;

framework.addValue(WorkspaceService, {
  workspace: {
    id: 'story-local',
    flavour: 'local',
    engine: { doc: { waitForDocLoaded: () => Promise.resolve() } },
  },
  dispose() {},
} as any);

framework.addValue(EditorSettingService, {
  editorSetting: {
    settings$: settingsLiveData,
    selector(fn: (s: any) => any) {
      return new LiveData(fn(settingsLiveData.value));
    },
    get(key: string) { return (settingsLiveData.value as any)[key]; },
    set() {},
  },
} as any);

framework.addValue(FeatureFlagService, {
  flags: new Proxy(flagsMap, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      const ld = new LiveData(false);
      return { $: ld, value: false, set: () => {} };
    },
  }),
} as any);

framework.addValue(ServerService, {
  server: {
    baseUrl: 'http://localhost',
    config$: serverConfigLiveData,
    features$: new LiveData({ copilot: true }),
  },
} as any);

framework.addValue(JournalService, {
  journalDate$: () => new LiveData(null as string | null),
} as any);

// AppThemeService — theme$ must be a real LiveData (extends Observable) for .map() to work
const appThemeLiveData = new LiveData('dark');
framework.addValue(AppThemeService, {
  appTheme: {
    theme$: appThemeLiveData,
  },
} as any);

// ExplorerIconService — return null so DocIconPicker treats docs as having no icon
const nullIconLiveData = new LiveData(null);
framework.addValue(ExplorerIconService, {
  icon$: () => nullIconLiveData,
  setIcon: () => {},
} as any);

const storyFrameworkProvider = framework.provider();

// Wrap the provider with a Proxy that catches ComponentNotFoundError
// and returns createServiceStub() for any missing service
const fallbackProvider = new Proxy(storyFrameworkProvider, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return function(this: any, ...args: any[]) {
        try {
          return value.apply(target, args);
        } catch (err: any) {
          if (err?.name === 'ComponentNotFoundError' || err?.constructor?.name === 'ComponentNotFoundError') {
            return createServiceStub();
          }
          throw err;
        }
      };
    }
    return value;
  },
});

export const StoryFrameworkRoot = ({ children }: { children: React.ReactNode }) => (
  <FrameworkRoot framework={fallbackProvider as any}>
    {children}
  </FrameworkRoot>
);
