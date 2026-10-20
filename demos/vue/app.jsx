import { createApp, h, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import TamperGuard from '../../dist/tamperguard.mjs';

const app = createApp({
  setup() {
    const count = ref(0), price = ref('$1,299.00'), violations = ref(0);
    let guard, monitor, approving = false, disposed = false;
    onMounted(async () => {
      // app.mount adds container attributes after mounted hooks finish.
      await nextTick();
      if (disposed) return;
      const protection = TamperGuard.protect({ selector: '#protected', onTamper: () => { violations.value++; } });
      guard = protection.controller; monitor = protection.monitor;
      window.demoMonitor = monitor;
    });
    onUnmounted(() => { disposed = true; guard?.destroy(); });
    // Accept only this application's requested price commit, at Vue's post-flush boundary.
    watch(price, () => { if (approving) { guard.rebaseline(); approving = false; } }, { flush: 'post' });
    function approve() { monitor.check(); if (monitor.getStatus().status === 'tampered') return; approving = true; price.value = price.value === '$999.00' ? '$1,299.00' : '$999.00'; }
    return () => h('main', [
      h('a', { href: '../index.html' }, 'All demos'), h('p', { class: 'eyebrow' }, 'Vue · lifecycle cleanup'), h('h1', 'Accept intentional commits.'),
      h('p', 'The approved price update rebaselines after Vue commits. Unrelated counter updates do not accept changes inside the protected region.'),
      h('section', { id: 'protected', 'data-guard': '', class: 'card' }, [h('span', { class: 'badge' }, 'Example price'), h('div', { class: 'price' }, price.value)]),
      h('section', { class: 'card' }, [h('p', ['Counter: ', h('strong', { id: 'count' }, String(count.value))]),
        h('p', ['Violations: ', h('strong', { id: 'violations' }, String(violations.value))]),
        h('div', { class: 'actions' }, [h('button', { id: 'increment', onClick: () => count.value++ }, 'Increment'),
          h('button', { id: 'approved', disabled: violations.value > 0, onClick: approve }, 'Approved price update'),
          h('button', { id: 'tamper', onClick: () => { document.querySelector('.price').textContent = '$1.00'; } }, 'Tamper with DOM')])]),
      h('p', { class: 'note' }, 'Rebaselining is a trust decision. Do not rebaseline indiscriminately on every render, and do not use v-pre as an immutability guarantee.')
    ]);
  }
});
app.mount('#app'); window.unmountDemo = () => app.unmount();
