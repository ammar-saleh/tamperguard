import TamperGuard from '../../dist/tamperguard.mjs';

// ?mode=lock erases the page on a change; the default only reports it.
const mode = new URLSearchParams(location.search).get('mode') === 'lock' ? 'lock' : 'report';
const status = document.querySelector('#status'), text = document.querySelector('#status-text');
const log = document.querySelector('#log'), place = document.querySelector('#place');
const time = () => new Date().toLocaleTimeString([], { hour12: false });

const { monitor } = TamperGuard.protect({
  selector: '#summary', mode, watchVisibility: true,
  onTamper(detail) {
    status.classList.add('alert');
    text.textContent = 'This summary was changed outside the app. Reload to see the real total.';
    place.disabled = true;
    const row = document.createElement('li');
    row.textContent = `${time()}  ${detail.type}: ${detail.reason}`;
    log.prepend(row);
    while (log.children.length > 4) log.lastChild.remove();
  }
});
window.demoMonitor = monitor;
place.addEventListener('click', () => { text.textContent = 'This is a demo. No order was placed.'; });
