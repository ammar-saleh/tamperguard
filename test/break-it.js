const cases = [
  ['Edit text', true, el => { el.querySelector('strong').textContent = '$1.00'; }],
  ['Change attribute', true, el => { el.title = 'changed'; }],
  ['Inject a node', true, el => el.append(document.createElement('span'))],
  ['Remove a child', true, el => el.querySelector('strong').remove()],
  ['Replace the protected root', true, el => el.replaceWith(el.cloneNode(true))],
  ['Remove the protected root', true, el => el.remove()],
  ['Change ancestor style', true, el => { el.parentElement.style.color = 'red'; }],
  ['Spoof extension markup', true, el => { const n = document.createElement('div'); n.dataset.gramm = ''; n.textContent = 'Fake'; el.append(n); }],
  ['Change form value without an event', true, el => { el.querySelector('input').value = 'changed'; }],
  ['Change open shadow content', true, el => { el.querySelector('.host').shadowRoot.textContent = 'changed'; }],
  ['Change significant whitespace', true, el => { el.querySelector('pre').textContent = 'A       B'; }],
  ['Attempt to overwrite monitor state', true, (el, g) => { Reflect.set(g, '_active', false); el.title = 'changed'; }],
  ['Approved synchronous update', false, (el, g) => g.update(() => { el.title = 'approved'; })],
  ['Explicitly ignored attribute', false, el => { el.setAttribute('data-clock', '12:00'); }, { ignoreAttributes: ['data-clock'] }],
  ['Canvas drawing (documented limit)', false, el => el.querySelector('canvas').getContext('2d').fillRect(0, 0, 20, 20)]
];
document.querySelector('#run').addEventListener('click', async event => {
  const button = event.currentTarget, rows = document.querySelector('#rows'), sandbox = document.querySelector('#sandbox');
  button.disabled = true; rows.replaceChildren(); document.querySelector('#summary').textContent = 'Running';
  let passed = 0;
  try {
    for (const [name, expected, attack, options] of cases) {
      sandbox.removeAttribute('style');
      sandbox.innerHTML = '<div id="subject"><strong>$1,299.00</strong><input value="original"><pre>A B</pre><span class="host"></span><canvas></canvas></div>';
      const el = sandbox.firstElementChild; el.querySelector('.host').attachShadow({ mode: 'open' }).textContent = 'original';
      let detected = false, error = null;
      const guard = new TamperGuard({ selector: '#subject', interval: 20, mode: 'silent', ...options, onTamper: () => { detected = true; } }).start();
      try { attack(el, guard); await new Promise(resolve => setTimeout(resolve, 100)); }
      catch (e) { error = e.message; }
      finally { guard.destroy(); }
      const pass = !error && detected === expected; if (pass) passed++;
      const row = document.createElement('tr');
      for (const text of [name, expected ? 'Detect' : 'Quiet', error || (pass ? 'Pass' : 'Fail')]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      row.lastChild.className = pass ? 'pass' : 'fail'; rows.append(row);
    }
  } finally {
    sandbox.replaceChildren(); button.disabled = false;
    document.querySelector('#summary').textContent = `${passed}/${cases.length} passed`;
  }
});
