// Type definitions for TamperGuard v0.1

export type TamperGuardMode = 'lock' | 'report' | 'silent';

export interface TamperViolation {
  /** What changed. */
  type: 'content' | 'style';
  /** The selector being guarded. */
  selector: string;
  /** The page URL at the time of detection. */
  url: string;
  /** Timestamp (ms) from a pristine Date.now. */
  at: number;
}

export interface TamperGuardOptions {
  /** CSS selector for the regions to protect. Default: '[data-guard]'. */
  selector?: string;
  /** Reaction on tamper. Default: 'lock'. */
  mode?: TamperGuardMode;
  /** Message shown on the lock wall. */
  message?: string;
  /** Periodic integrity-sweep interval in ms. 0 disables. Default: 1000. */
  interval?: number;
  /** Also hash same-origin stylesheet rules (catches CSS edits). Default: false. */
  watchStyles?: boolean;
  /** If no element matches `selector`, guard <body> instead. Default: false. */
  guardWholeDocument?: boolean;
  /** Optional endpoint; violations are POSTed/beaconed here. */
  reportUrl?: string | null;
  /** Called with the violation. Return a truthy value to suppress the built-in reaction. */
  onTamper?: ((detail: TamperViolation) => unknown) | null;
  /** Descendant selectors to strip before hashing (benign extensions). */
  ignoreSelectors?: string[];
  /** Attribute names to strip before hashing. */
  ignoreAttributes?: string[];
  /** Attribute name prefixes to strip before hashing. */
  ignoreAttributePrefixes?: string[];
}

export interface TamperGuardStatus {
  status: 'idle' | 'watching' | 'tampered' | 'stopped';
  targets: number;
}

export class TamperGuard {
  constructor(options?: TamperGuardOptions);
  options: Required<TamperGuardOptions>;
  status: TamperGuardStatus['status'];
  /** Snapshot the targets and begin watching. */
  start(): this;
  /** Run an integrity check now. */
  check(): void;
  /** Accept the current DOM as the new baseline (after a change you made). */
  rebaseline(): this;
  /** Stop watching (does not remove a lock wall). */
  stop(): this;
  /** Current status and target count. */
  getStatus(): TamperGuardStatus;
  /** Wipe the page and draw the self-healing lock wall. */
  lock(): void;
}

export default TamperGuard;

declare global {
  interface WindowEventMap {
    'tamperguard:ready': CustomEvent<{ targets: number }>;
    'tamperguard:violation': CustomEvent<TamperViolation>;
    'tamperguard:lock': CustomEvent<{ message: string }>;
  }
}
