import { TamperGuard as Base } from './index.js';
declare class TamperGuard extends Base {}
declare namespace TamperGuard {
  export { TamperGuard };
  export type TamperGuardOptions = import('./index.js').TamperGuardOptions;
  export type TamperGuardStatus = import('./index.js').TamperGuardStatus;
  export type TamperViolation = import('./index.js').TamperViolation;
  export type TamperGuardMode = import('./index.js').TamperGuardMode;
  export type ViolationType = import('./index.js').ViolationType;
  export type TamperProtection = import('./index.js').TamperProtection;
  export type TamperMonitor = import('./index.js').TamperMonitor;
  export type TamperController = import('./index.js').TamperController;
}
export = TamperGuard;
