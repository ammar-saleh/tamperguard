// Fault injection installed before guard initialization; production internals stay private.
export async function captureObservers(page) {
  await page.evaluate(() => {
    const Native = window.MutationObserver;
    window.testObservers = [];
    window.MutationObserver = class extends Native {
      constructor(callback) { super(callback); window.testObservers.push(this); }
    };
  });
}
