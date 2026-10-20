import React, { StrictMode, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import TamperGuard from '../../dist/tamperguard.mjs';

function App() {
  const [count, setCount] = useState(0), [price, setPrice] = useState('$1,299.00');
  const [violations, setViolations] = useState(0), guardRef = useRef(null);
  useLayoutEffect(() => {
    const { monitor, controller } = TamperGuard.protect({ selector: '#protected', onTamper: () => { setViolations(n => n + 1); } });
    guardRef.current = controller;
    window.demoMonitor = monitor;
    return () => { controller.destroy(); guardRef.current = null; };
  }, []);
  function approve() {
    // Explicit synchronous commit; never pass an async callback to update().
    guardRef.current.update(() => { flushSync(() => setPrice('$999.00')); });
  }
  return <main>
    <a href="../index.html">All demos</a><p className="eyebrow">React · Strict Mode</p><h1>Guard an explicit region.</h1>
    <p>The counter can update freely. The approved price change uses a synchronous React commit inside <code>guard.update()</code>.</p>
    <section id="protected" data-guard className="card"><span className="badge">Example price</span><div className="price">{price}</div></section>
    <section className="card"><p>Counter: <strong id="count">{count}</strong></p><p>Violations: <strong id="violations">{violations}</strong></p>
      <div className="actions"><button id="increment" onClick={() => setCount(n => n + 1)}>Increment</button><button id="approved" disabled={violations > 0} onClick={approve}>Approved price update</button>
      <button id="tamper" onClick={() => { document.querySelector('.price').textContent = '$1.00'; }}>Tamper with DOM</button></div></section>
    <p className="note">Report mode preserves the application. Cleanup releases the guard on unmount. Development Strict Mode exercises setup and cleanup twice.</p>
  </main>;
}
const root = createRoot(document.querySelector('#app'));
root.render(<StrictMode><App /></StrictMode>);
window.unmountDemo = () => root.unmount();
