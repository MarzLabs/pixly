// Shared click-guard helper for hover-only tools.
//
// Hover-only inspection tools (color picker, typography, spacing, magnifier,
// etc.) do not own user click semantics, but a click on the host page while
// they are active typically triggers navigation (link follow, button submit,
// form submission). That defeats the inspection workflow because the page
// changes mid-measurement.
//
// This helper returns true when the tool should intercept the click and call
// `event.preventDefault()` to suppress the host page's default action. It
// deliberately does NOT call `stopPropagation()` so other Pixly tools
// listening on `document` (e.g. inspector multi-selection with Shift/Cmd)
// keep working in capture phase.
//
// Modifier guard: any click that carries Shift / Ctrl / Meta / Alt is treated
// as an intentional power-user interaction (multi-select, open-in-new-tab,
// etc.) and is allowed to pass through untouched.
//
// The function is pure and synchronous so it can be unit-tested without DOM
// instrumentation.

export interface ClickGuardEvent {
    readonly button: number;
    readonly shiftKey: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly altKey: boolean;
}

const PRIMARY_MOUSE_BUTTON = 0;

export function shouldHandleClick(event: ClickGuardEvent): boolean {
    if (event.button !== PRIMARY_MOUSE_BUTTON) {
        return false;
    }

    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return false;
    }

    return true;
}
