# Website QA — 2026-09-06

## Implemented fixes

- Pause the hero WebGL simulation when offscreen or the tab is hidden; resume without accumulated catch-up work.
- Dispose GPU resources, animation frames, observers, and pointer listeners on unmount.
- Resize the canvas only when its size changes and cap rendering pixel density to reduce GPU load.
- Coalesce header theme measurements into animation frames instead of measuring every idle ticker frame.
- Debounce event-section ScrollTrigger refreshes and remove per-image refreshes.
- Restore Lenis and the hero timeline when returning from admin or Join; remove stale query routing on navigation.
- Enable vertical touch scrolling over the hero and include Lenis base styles.
- Scope admin dark-mode variables to the admin layout; cancel analytics counter animation on unmount.
- Treat a successful empty events response as empty rather than restoring cached/demo records.

The existing hero zoom, opaque image, blue overlay, and fixed corner header design were preserved.

## Verification

- Production build passed (`npm run build`).
- Lint exits successfully with 10 existing warnings (unused variables, hook dependencies, and Fast Refresh exports).
- `git diff --check` passed.
- Browser checks covered hero zoom, event gallery, navigation menu, Escape, Join return, and return from admin.
- At a 390 × 844 mobile viewport: hero and zoom render, vertical scrolling works, no document horizontal overflow, and three animation pin wrappers are restored after returning from Join.
- A temporary WebGL draw-call measurement recorded zero hero draw calls while offscreen (versus active drawing onscreen). This confirms eliminated offscreen work, not a guarantee of frame rate on every device.
- Latest localhost browser log check returned no errors or warnings.
- Admin checks covered login, Team loading/search, Events loading and opening/canceling the editor, Members queue, and navigation to the other dashboard panels.
- No existing admin records were created, edited, accepted, refused, or deleted. Save/delete workflows were not end-to-end tested against the live database.

## Remaining concerns

1. **Production security blocker:** admin access is checked with client-side passcodes/sessionStorage, not server authentication. The local registration SQL migration also contains unrestricted policies and privileged functions without authorization checks. Live database policy configuration was not verified or changed. Real authenticated admin identities and restricted database policies are needed before production use.
2. The current Join/Registration component is a navigation/gallery page, not a working application form. Several admin panels contain demo content or unfinished actions.
3. Content issues include a malformed DAR TIFL event URL and an invalid February date; several social/partner destinations are placeholders. Correct values need confirmation rather than guessing.
4. Event date/status normalization and existing hook dependency lint warnings deserve a separate follow-up. A physical mobile device and sustained production-build scrolling trace would provide stronger performance validation than the local browser checks.
