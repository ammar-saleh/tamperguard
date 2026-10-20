import TamperGuard = require('tamperguard');
import { TamperGuard as Named, type TamperGuardOptions } from 'tamperguard';
const options: TamperGuardOptions = { mode: 'report' };
const guard = new TamperGuard(options);
const other = new Named();
const config: TamperGuard.TamperGuardOptions = { interval: 0 };
guard.rebaseline().stop(); other.destroy();
