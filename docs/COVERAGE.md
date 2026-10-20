# Coverage matrix

The baseline is captured by `start()`, `rebaseline()`, or a successful `update()`. Mutation observation is asynchronous. A full `check()` is synchronous. An interval is a scheduling request, not a detection deadline: background tabs, suspended pages, and busy main threads can delay it.

| Scenario | Coverage | Conditions / limitations |
| --- | --- | --- |
| Text, attribute, inline-style, child changes | Observed | Inside a selected target, including significant whitespace and comments. |
| Protected root removed or replaced | Observed | Tracks element identity and placement; replacement with identical HTML is still a target-set change. |
| Target moved between ancestors | Observed | Ancestor identities are tracked even when `watchAncestors` is false. |
| Target order changes | Observed | Order of selected outermost targets is tracked. Moving one target relative to unrelated siblings is not a guaranteed placement signal. |
| New matching elements / selector attributes removed | Observed | Emits `targets`; new content is not implicitly accepted. Restore original targets or explicitly rebaseline. |
| Ancestor style/class/hidden/inert changes | Observed by default | Other ancestor attributes also count. This can flag benign themes or language changes. |
| Input value/checked/indeterminate | Events or full check | Programmatic changes without an event require the sweep/manual check. Normal user edits are still changes. |
| Textarea value, option selection, select state | Events or full check | Disable `watchProperties` to opt out of live-state inspection. |
| Open shadow root contents | Observed once discovered | Traversed inside guarded targets. A newly attached root is found by a full sweep/manual check. Selectors do not automatically pierce shadow boundaries. |
| Closed shadow root | Explicit reference only | Pass a known root to `root`; there is no discovery of inaccessible roots. |
| Same-origin iframe | Explicit document only | Create a separate guard using `iframe.contentDocument`. Navigation destroys its browsing context; attach a new guard after navigation. Outer frame presence/attributes require guarding its containing region. |
| Cross-origin iframe | Not inspected | Same-origin policy remains in force. |
| Template content | Full check | Template changes are not guaranteed to deliver a document observer record. |
| Stylesheet insertion/removal | Optional | `watchStyles`; styles affect the entire document, so this may report changes unrelated to a target. |
| CSSOM rule changes, disabled/media state | Optional full check | `watchStyles` and a nonzero interval or manual `check()`. |
| Adopted stylesheets | Optional full check | Document and known guarded shadow roots; stylesheet ordering and identity count. |
| Imported CSS | Optional, readable only | Recursively inspects accessible imported stylesheets. |
| Cross-origin CSS rules | Not readable | Counts inaccessible sheets in status and inspects exposed metadata, not their contents. |
| Canvas/WebGL/video pixels | Not inspected | Drawing can change while DOM attributes stay identical. |
| Fonts/images/media changing at the same URL | Not inspected | No network-resource attestation. |
| Pseudo-element output, animation, viewport/media-query changes | Not directly inspected | Readable stylesheet edits may signal a change; computed pixels/layout are not snapshotted. |
| Overlay injected inside a guarded region | Observed | Unless explicitly excluded. |
| Overlay outside a guarded region / browser UI | Not guaranteed | `watchVisibility` detects some increases in occlusion using five hit-test samples; pointer-transparent overlays and unsampled areas can escape it. It does not prove screenshot authenticity. Whole-document coverage has substantial false-positive and performance costs. |
| Event listeners, expando properties, JS state | Not inspected | Strict mutation history detects same-markup descendant replacement, but does not inspect listeners or arbitrary JS state. |
| Change and restore before delivery | Strict history for observed DOM | `watchMutations` catches recorded text/attribute/structural changes. Restored property/CSSOM changes and unobserved fragments can still be missed. |
| More than 10,000 queued records | Overflow signal | Processing cap prevents unbounded record processing, not native queue memory usage or full snapshot costs. |
| Selected API replacement after startup | Environment signal | Descriptor audit by default; not exhaustive runtime attestation. |
| Public monitor / sealed controller modification | Restricted | Frozen handles and native private fields; sealing rejects lifecycle and acceptance operations. Privileged debugging remains outside the boundary. |
| Changes before baseline | Accepted | Start only after deciding the initial state is trustworthy. |
| Disabled/blocked JS, DevTools overrides, compromised APIs | Not reliable | Browser control defeats the premise of a same-page monitor. |
| Observer disconnected | Sweep backstop | Tested; an unsealed controller can intentionally stop/destroy protection. Sealed controllers reject those operations. |
| Background/resume | Best effort | Timer throttling applies; visible/pageshow events trigger a full check. Real BFCache and device suspension need application/device testing. |
| Strict CSP / Trusted Types | Tested lock construction | No HTML injection sink or dynamic code evaluation in library. Unsupported features are still browser-dependent. |

## False positives and deliberate exclusions

The monitor cannot distinguish a benign translation from malicious text replacement. Check your actual extension, accessibility, theme, autofill, hydration, and localization workflows in report mode. Prefer small, static regions. Exclude specific attributes only after deciding the excluded information is not part of the protected state.

Selectors should be stable markers or IDs. UI-state selectors such as `:hover`, `:focus`, and `:checked` can change membership without a matching DOM attribute mutation. Broad selectors also increase work. Target selection is limited to the explicit root; open shadow descendants are inspected as content but not independently discovered as selected roots.

The automated suite includes expected-undetected tests for canvas drawing, unknown closed roots, outside overlays with visibility sampling off, and transient restored state with strict history off. Additional hardening tests cover those optional modes. These make the boundary executable rather than implying universal protection.
