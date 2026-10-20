# Framework integration

Use `protect()` with a module-private controller; share only the read-only monitor. Do not seal components that require updates or cleanup. Protect stable content first. Framework state and DOM are not automatically equivalent; a normal commit can look like external modification. Rebaseline only when accepting a specific intended commit. None of these APIs authenticates the caller.

## React

Create the guard in a client-side layout effect and destroy it in cleanup. Instantiate inside the effect so development Strict Mode can run setup/cleanup/setup without restarting a destroyed instance.

```jsx
const guardRef = useRef(null);
useLayoutEffect(() => {
  const { controller: guard } = TamperGuard.protect({ selector: '#protected-price' });
  guardRef.current = guard;
  return () => {
    guard.destroy();
    guardRef.current = null;
  };
}, []);
```

For an infrequent approved synchronous change, the example explicitly commits React inside `update()`:

```jsx
import { flushSync } from 'react-dom';

guardRef.current.update(() => {
  flushSync(() => setPrice(nextPrice));
});
```

Do not assume `setState()` has committed when it returns. `flushSync` is an integration escape hatch, not a recommendation for every update. For concurrent or transition-based UIs, guard static subregions or accept a known committed version from a layout effect keyed to that version. Avoid a broad effect that rebaselines on every render; it can accept unrelated tampering.

React's [layout-effect](https://react.dev/reference/react/useLayoutEffect) and [Strict Mode](https://react.dev/reference/react/StrictMode) documentation explains the relevant lifecycle. The local demo deliberately uses a development build so the cleanup cycle is exercised. It makes no CDN requests.

## Vue

Vue batches DOM updates. Start after the initial mount is fully complete: `app.mount()` adds container attributes after mounted hooks, so the demo waits for `nextTick()` before taking its ancestor baseline. Cancel that deferred setup if the component unmounts first.

For an approved reactive change, check pending mutations first, set a narrowly scoped acceptance flag, then rebaseline in a `flush: 'post'` watcher for the changed value. The local demo accepts only requested price commits. Its counter and violation display never trigger rebaselining.

```js
// guard is the private controller; monitor is the factory monitor.
watch(price, () => {
  if (approvingPrice) {
    guard.rebaseline();
    approvingPrice = false;
  }
}, { flush: 'post' });

function approvePrice(next) {
  monitor.check();
  if (monitor.getStatus().status === 'tampered' || next === price.value) return;
  approvingPrice = true;
  price.value = next;
}
onUnmounted(() => guard?.destroy());
```

If `next` equals the current value, do not leave a stale approval flag waiting for a future change. The executable demo toggles values to ensure an actual commit. `v-pre` skips compilation; it is not a general immutable-DOM guarantee.

See Vue's [update timing](https://vuejs.org/api/general.html#nexttick) and [lifecycle documentation](https://vuejs.org/guide/essentials/lifecycle.html).

## SSR, hydration, routing and asynchronous work

ESM/CommonJS imports and construction are safe without `window`. Start only on the client after the guarded DOM and ancestor attributes have stabilized, and after error-monitoring, analytics or session-replay SDKs have initialized: many of them wrap `addEventListener`, timers or input setters, which the default environment audit reports. If such an SDK loads lazily, either start the guard after it or set `watchEnvironment: false`. Hydration may replace or annotate elements. Routing should destroy the old guard and establish a deliberately chosen baseline on the new screen.

`update()` accepts synchronous work only. Do not use `await` inside it, hold a monitoring pause across a network request, or rebaseline after arbitrary background activity. Fetch/validate data first, then accept the specific DOM commit. Other code running during that commit can still change the page; the library cannot cryptographically distinguish it.
