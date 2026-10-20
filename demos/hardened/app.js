import TamperGuard from '../../dist/tamperguard.mjs';

const { monitor, controller } = TamperGuard.protect({ mode: 'lock', interval: 250, watchVisibility: true });
controller.seal();
Object.defineProperty(window, 'tamperMonitor', { value: monitor, configurable: false, writable: false });
document.querySelector('#result').textContent = 'Active and sealed. No telemetry.';
document.querySelector('#edit').addEventListener('click', () => { document.querySelector('.price').textContent = '$1.00'; });
document.querySelector('#restore').addEventListener('click', () => {
  const text = document.querySelector('.price').firstChild, original = text.data;
  text.data = '$1.00'; text.data = original;
});
document.querySelector('#cover').addEventListener('click', () => {
  const rect = document.querySelector('#protected').getBoundingClientRect(), overlay = document.createElement('div');
  overlay.textContent = 'Fake replacement price';
  overlay.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background:white;color:black;z-index:99999`;
  document.body.append(overlay);
});
document.querySelector('#disable').addEventListener('click', () => {
  const changed = Reflect.set(monitor, '_active', false);
  document.querySelector('#result').textContent = `State write ${changed ? 'accepted' : 'rejected'}; stop method: ${typeof monitor.stop}; active: ${monitor.getStatus().active}.`;
});
