# Flashborn 1.12.2

Fixes Flash disappearing when opening the three-dot menu and remaining blank after dismissal. The live movie was covered by the browser frame after Windows activated the modern process; it had not stopped playing. The stacking repair now handles menu and address-bar activation as well as native Flash activation, by positioning the browser frame behind its running movie.

The fix preserves movie state, focus and mouse capture, without hiding or reloading the player. Flash remains in the normal Windows stack and retains its separate input queue. Preparing or retiring tab surfaces do not perform this repair, and another foreground application is left alone.

The installer configuration, Adobe player, website colors and library/About improvements from 1.12.1 are unchanged.
