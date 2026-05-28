export interface LLMProviderConfig {
  id: string;
  provider: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export type LLMProviderPatch = Partial<Omit<LLMProviderConfig, 'id'>>;

const STORAGE_KEY = 'affine-story-llm-keys';

export class APIKeyStore {
  private static getKey(): string {
    return STORAGE_KEY;
  }

  private static load(): LLMProviderConfig[] {
    try {
      const raw = localStorage.getItem(APIKeyStore.getKey());
      if (!raw) return [];
      return JSON.parse(raw) as LLMProviderConfig[];
    } catch {
      return [];
    }
  }

  private static save(configs: LLMProviderConfig[]): void {
    localStorage.setItem(APIKeyStore.getKey(), JSON.stringify(configs));
  }

  static list(): LLMProviderConfig[] {
    return APIKeyStore.load();
  }

  static get(id: string): LLMProviderConfig | undefined {
    return APIKeyStore.load().find(c => c.id === id);
  }

  static add(config: Omit<LLMProviderConfig, 'id'>): LLMProviderConfig {
    const id = crypto.randomUUID();
    const entry: LLMProviderConfig = { ...config, id };
    const configs = APIKeyStore.load();
    configs.push(entry);
    APIKeyStore.save(configs);
    return entry;
  }

  static update(
    id: string,
    patch: LLMProviderPatch
  ): LLMProviderConfig | undefined {
    const configs = APIKeyStore.load();
    const index = configs.findIndex(c => c.id === id);
    if (index === -1) return undefined;

    configs[index] = { ...configs[index], ...patch };
    APIKeyStore.save(configs);
    return configs[index];
  }

  static remove(id: string): boolean {
    const configs = APIKeyStore.load();
    const index = configs.findIndex(c => c.id === id);
    if (index === -1) return false;

    configs.splice(index, 1);
    APIKeyStore.save(configs);
    return true;
  }
}
