// @ts-nocheck
// TODO(story): cloud module stub - all cloud functionality removed
/* eslint-disable */
// This module provides type stubs so the rest of the codebase compiles.
// All services are no-op stubs. They use `any` to satisfy downstream type checks.
import {
  type Framework,
  type FrameworkProvider,
  Service,
  Entity,
  LiveData,
} from '@toeverything/infra';

// ---- Types ----
export interface AuthAccountInfo {
  id: string;
  label: string;
  email?: string;
  info?: AccountProfile | null;
  avatar?: string | null;
}

export interface AccountProfile {
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface AuthSessionInfo {
  account: AuthAccountInfo;
}

export interface AuthSessionUnauthenticated {
  status: 'unauthenticated';
}

export interface AuthSessionAuthenticated {
  status: 'authenticated';
  session: AuthSessionInfo;
}

export type AuthSessionStatus =
  | AuthSessionUnauthenticated
  | AuthSessionAuthenticated
  | { status: 'loading' }
  | { status: 'error'; message: string };

export interface ServerConfig {
  name?: string;
  version?: string;
  features?: string[];
  oauthProviders?: string[];
  type?: string;
  serverName?: string;
  credentialsRequirement?: {
    password?: { minLength: number; maxLength: number };
  };
  [key: string]: unknown;
}

export interface ServerMetadata {
  id: string;
  baseUrl: string;
}

export interface Invoice {
  id: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface PublicUserInfo {
  name: string;
  avatarUrl: string | null;
  email: string;
}

export interface UserSettings {
  [key: string]: unknown;
}

export interface RealtimeLiveQueryEventResult {
  data: unknown;
}

export interface RealtimeLiveQueryOptions {
  query: string;
  variables?: Record<string, unknown>;
}

// ---- Scopes ----
export class ServerScope {
  server: Server;
  framework: FrameworkProvider;
  constructor(opts: { server: Server }) {
    this.server = opts.server;
    this.framework = opts.server.framework;
  }
  get(service: any): any {
    return {} as any;
  }
}

// ---- Entities ----
export class Server extends Entity<{ serverMetadata: ServerMetadata }> {
  readonly id = this.props.serverMetadata.id;
  readonly baseUrl = this.props.serverMetadata.baseUrl;
  readonly serverMetadata = this.props.serverMetadata;
  readonly config$ = new LiveData<ServerConfig | null>({});
  readonly features$ = new LiveData<Record<string, boolean>>({});
  readonly scope: ServerScope;
  readonly serverConfigStore = {
    config$: new LiveData<ServerConfig | null>(null),
  };
  readonly credentialsRequirement$ = new LiveData<any>(null);

  constructor(_store: unknown) {
    super();
    this.scope = new ServerScope({ server: this });
  }

  gql(..._args: any[]): Promise<any> {
    return Promise.resolve(null);
  }

  waitForConfigRevalidation(_signal?: AbortSignal): Promise<void> {
    return Promise.resolve();
  }
}

// ---- Services ----
export class AuthService extends Service {
  session: any = {
    account$: new LiveData<AuthAccountInfo | null>(null),
    status$: new LiveData<AuthSessionStatus>({ status: 'unauthenticated' }),
    session$: new LiveData<any>(null),
    isRevalidating$: new LiveData<boolean>(false),
    revalidate: () => {},
  };

  signIn(..._args: unknown[]): Promise<void> {
    return Promise.resolve();
  }
  signInMagicLink(..._args: unknown[]): Promise<void> {
    return Promise.resolve();
  }
  signOut(): Promise<void> {
    return Promise.resolve();
  }
  revokeUserAccessToken(): Promise<void> {
    return Promise.resolve();
  }
  sendEmailMagicLink(..._args: unknown[]): Promise<void> {
    return Promise.resolve();
  }
  signInPassword(..._args: unknown[]): Promise<void> {
    return Promise.resolve();
  }
  checkUserByEmail(..._args: unknown[]): Promise<any> {
    return Promise.resolve(null);
  }
  deleteAccount(): Promise<void> {
    return Promise.resolve();
  }
  uploadAvatar(..._args: unknown[]): Promise<void> {
    return Promise.resolve();
  }
  removeAvatar(): Promise<void> {
    return Promise.resolve();
  }
  updateLabel(..._args: unknown[]): Promise<void> {
    return Promise.resolve();
  }
  revalidate(): void {}
}

export class ServerService extends Service {
  server: Server | null = null;
}

export class ServersService extends Service {
  servers$ = new LiveData<Server[]>([]);
  serverByBaseUrl$(_url: string): LiveData<Server | null> {
    return new LiveData<Server | null>(null);
  }
  server$(_flavour: string): LiveData<Server | null> {
    return new LiveData<Server | null>(null);
  }
  addOrGetServerByBaseUrl(_url: string): Server {
    return null as unknown as Server;
  }
  getServerByBaseUrl(_url: string): Server | null {
    return null;
  }
  removeServer(_id: string): void {}
}

export class GraphQLService extends Service {
  gql(..._args: any[]): Promise<any> {
    return Promise.resolve(null);
  }
}

export class FetchService extends Service {
  fetch(..._args: any[]): Promise<any> {
    return Promise.resolve(null);
  }
}

export class SubscriptionService extends Service {
  subscription: any = {};
  prices: any = {};
  createCheckoutSession(..._args: unknown[]): Promise<string> {
    return Promise.resolve('');
  }
}

export class CaptchaService extends Service {
  needCaptcha$ = new LiveData<boolean>(false);
  isLoading$ = new LiveData<boolean>(false);
  verifyToken$ = new LiveData<string | null>(null);
  challenge$ = new LiveData<string | null>(null);
  revalidate(): void {}
}

export class DefaultServerService extends Service {
  readonly server: Server;
  readonly server$ = new LiveData<Server | null>(null);

  constructor() {
    super();
    this.server = new Server({
      serverMetadata: { id: 'local', baseUrl: 'http://localhost' },
    });
    this.server$.next(this.server);
  }
}

export class DocCreatedByUpdatedBySyncService extends Service {}
export class EventSourceService extends Service {
  eventSource: any = null;
  start(): void {}
  stop(): void {}
  override dispose(): void {
    super.dispose();
  }
}
export class InvitationService extends Service {
  getInviteInfo(..._args: unknown[]): Promise<any> {
    return Promise.resolve(null);
  }
  acceptInvite(..._args: unknown[]): Promise<void> {
    return Promise.resolve();
  }
}
export class InvoicesService extends Service {
  invoices: any = {};
}
export class PublicUserService extends Service {
  publicUser$ = new LiveData<PublicUserInfo | null>(null);
  isLoading$ = new LiveData<boolean>(false);
  error$: any = new LiveData(null);
  revalidate(): void {}
  getUserById(_id: string): Promise<PublicUserInfo | null> {
    return Promise.resolve(null);
  }
}
export class RealtimeService extends Service {
  start(): void {}
  stop(): void {}
  override dispose(): void {
    super.dispose();
  }
}
export class SelfhostGenerateLicenseService extends Service {}
export class SelfhostLicenseService extends Service {}
export class UserCopilotQuotaService extends Service {
  copilotQuota: any = {};
}
export class UserFeatureService extends Service {
  userFeature: any = {};
}
export class UserQuotaService extends Service {
  quota: any = {};
}
export class UserSettingsService extends Service {}
export class WorkspaceInvoicesService extends Service {
  invoices: any = {};
}
export class WorkspaceServerService extends Service {
  server: Server | null = null;
}
export class WorkspaceSubscriptionService extends Service {
  subscription: any = {};
}
export class AccessTokenService extends Service {}

// ---- Providers ----
export class AuthProvider {}
export class ValidatorProvider {}

// ---- Events ----
export class AccountChanged {}
export class AccountLoggedIn {}
export class AccountLoggedOut {}

// ---- Live Query ----
export class RealtimeLiveQuery {
  constructor(_opts: RealtimeLiveQueryOptions) {}
}

// ---- Stub function ----
export function configureCloudModule(framework: Framework): void {
  // TODO(story): cloud module disabled - register stubs so DI resolves
  framework
    .service(ServersService)
    .service(DefaultServerService)
    .service(AuthService)
    .service(ServerService)
    .service(GraphQLService)
    .service(FetchService)
    .service(CaptchaService)
    .service(SubscriptionService)
    .service(PublicUserService)
    .service(WorkspaceServerService)
    .service(InvitationService)
    .service(InvoicesService)
    .service(RealtimeService)
    .service(EventSourceService)
    .service(AccessTokenService);
}
