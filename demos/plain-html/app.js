import TamperGuard from '../../dist/tamperguard.mjs';
let controller;
const region = () => document.querySelector('[data-guard]');
const log = document.querySelector('#events');
function record(text) { const li = document.createElement('li'); li.textContent = text; log.prepend(li); while (log.children.length > 30) log.lastChild.remove(); }
function start() {
  controller?.destroy();
  const protection = TamperGuard.protect({ mode: document.querySelector('#mode').value,
    onTamper: detail => { record(`${detail.type}: ${detail.reason}`); document.querySelector('#legit').disabled = true; } });
  controller = protection.controller; window.demoMonitor = protection.monitor;
  document.querySelector('#legit').disabled = false;
  record(`Baseline captured. ${document.querySelector('#mode').value} mode.`);
}
document.querySelector('#mode').addEventListener('change', start);
document.querySelector('#edit').addEventListener('click', () => { region().querySelector('.price').textContent = '$1.00'; });
document.querySelector('#replace').addEventListener('click', () => {
  const replacement = document.createElement('section'); replacement.className = 'card'; replacement.dataset.guard = '';
  const label = document.createElement('div'); label.className = 'price'; label.textContent = '$0.01'; replacement.append(label); region().replaceWith(replacement);
});
document.querySelector('#overlay').addEventListener('click', () => {
  const node = document.createElement('span'); node.dataset.gramm = ''; node.textContent = 'Injected extension-looking content'; region().append(node);
});
document.querySelector('#legit').addEventListener('click', () => {
  controller.update(() => { region().querySelector('.price').textContent = '$999.00'; }); record('Approved update accepted.');
});
document.querySelector('#refresh').addEventListener('click', () => location.reload());
start();
