export type TamperGuardMode = 'lock' | 'report' | 'silent';
export type ViolationType = 'content' | 'structure' | 'targets' | 'style' | 'mutation' | 'environment' | 'visibility' | 'overflow' | 'error';
export interface TamperViolation {
  readonly type: ViolationType;
  readonly reason: string;
  readonly targetId: number | null;
  readonly selector: string;
  readonly origin: string;
  readonly at: number;
}
export interface TamperGuardOptions {
  selector?: string;
  root?: Document | Element | ShadowRoot | null;
  mode?: TamperGuardMode;
  message?: string;
  interval?: number;
  watchStyles?: boolean;
  watchProperties?: boolean;
  watchShadowDOM?: boolean;
  watchAncestors?: boolean;
  watchMutations?: boolean;
  watchVisibility?: boolean;
  watchEnvironment?: boolean;
  guardWholeDocument?: boolean;
  reportUrl?: string | null;
  onTamper?: ((detail: TamperViolation) => unknown) | null;
  maxReportsPerMinute?: number;
  ignoreSelectors?: readonly string[];
  ignoreAttributes?: readonly string[];
  ignoreAttributePrefixes?: readonly string[];
}
export interface TamperGuardStatus {
  status: 'idle' | 'watching' | 'tampered' | 'stopped' | 'locked' | 'destroyed';
  active: boolean;
  sealed: boolean;
  observers: number;
  timers: number;
  targets: number;
  checks: number;
  snapshots: number;
  violations: number;
  reports: number;
  reportsDropped: number;
  reportErrors: number;
  callbackErrors: number;
  inaccessibleStylesheets: number;
  /** Times the accessible stylesheets were read (only with `watchStyles`). */
  styleReads: number;
  lastCheckMs: number;
}
export class TamperGuard {
  /** Local-only factory. Keep controller private; share only monitor. */
  static protect(options?: Omit<TamperGuardOptions, 'reportUrl'>): TamperProtection;
  constructor(options?: TamperGuardOptions);
  readonly options: Readonly<Required<TamperGuardOptions>>;
  readonly status: TamperGuardStatus['status'];
  start(): this;
  check(): void;
  rebaseline(): this;
  /** Synchronous mutations only. Async framework commits must use rebaseline. */
  update<T>(fn: () => T extends PromiseLike<unknown> ? never : T): T;
  stop(): this;
  destroy(): void;
  getStatus(): TamperGuardStatus;
  /** Permanently disable lifecycle/acceptance controls until page reload. */
  seal(): this;
  /** Destructive, explicit opt-in. A refresh is required to restore the page. */
  lock(): void;
}
export interface TamperMonitor {
  readonly getStatus: () => TamperGuardStatus;
  readonly check: () => void;
}
export interface TamperController {
  readonly start: () => void;
  readonly stop: () => void;
  readonly destroy: () => void;
  readonly rebaseline: () => void;
  readonly update: <T>(fn: () => T extends PromiseLike<unknown> ? never : T) => T;
  readonly seal: () => void;
  readonly lock: () => void;
}
export interface TamperProtection {
  readonly monitor: Readonly<TamperMonitor>;
  readonly controller: Readonly<TamperController>;
}
export default TamperGuard;

declare global {
  interface WindowEventMap {
    'tamperguard:ready': CustomEvent<{ targets: number }>;
    'tamperguard:violation': CustomEvent<TamperViolation>;
    'tamperguard:lock': CustomEvent<{ message: string }>;
  }
}
