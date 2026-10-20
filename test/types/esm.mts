import TamperGuard, { TamperGuard as Named, type TamperGuardOptions, type TamperViolation } from 'tamperguard';
const options: TamperGuardOptions = { mode: 'report', ignoreAttributes: ['data-test'] as const };
const guard: Named = new TamperGuard(options);
const result: number = guard.update(() => 42);
guard.options.onTamper?.({ type: 'content', reason: 'snapshot-changed', targetId: 1, selector: '[data-guard]', at: 1, origin: 'https://example.test' } satisfies TamperViolation);
window.addEventListener('tamperguard:violation', event => { const type: string = event.detail.type; });
// @ts-expect-error invalid mode
new TamperGuard({ mode: 'prevent' });
// @ts-expect-error async transactions are not supported
guard.update(async () => 42);
// @ts-expect-error options are readonly
guard.options.interval = 10;

const { monitor, controller } = TamperGuard.protect({ watchVisibility: true });
controller.update(() => 42);
controller.seal();
monitor.check();
// @ts-expect-error monitor has no stop capability
monitor.stop();
// @ts-expect-error protect is local-only
TamperGuard.protect({ reportUrl: '/collect' });
