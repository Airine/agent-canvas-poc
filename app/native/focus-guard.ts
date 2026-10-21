/** An inactive embedded agent must not steal typing from a neighbouring card. */
export function guardCardFocus() {
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function(options) {
    if (window.parent !== window) {
      try {
        const active = window.parent.document.activeElement;
        if (active?.tagName === 'IFRAME' && active !== window.frameElement) return;
      } catch { /* Standalone/cross-origin hosts keep the browser default. */ }
    }
    focus.call(this, options);
  };
}
