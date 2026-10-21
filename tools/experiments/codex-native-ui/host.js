// This is a host adapter, not a replacement for any vendor UI component.
(() => {
  // Do not let background renderer autofocus divert typing in another card.
  if (typeof HTMLElement !== 'undefined') {
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function(options) {
      if (window.parent !== window) {
        try {
          const active = window.parent.document.activeElement;
          if (active?.tagName === 'IFRAME' && active !== window.frameElement) return;
        } catch { /* The standalone probe may have a cross-origin parent. */ }
      }
      focus.call(this, options);
    };
  }
  // VS Code normally injects these theme variables into its Webview document.
  const style = document.createElement('style');
  style.textContent = `:root {
    --vscode-font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    --vscode-font-size: 13px; --vscode-font-weight: 400;
    --vscode-editor-font-family: monospace; --vscode-editor-font-size: 12px;
    --vscode-editor-font-weight: 400; --vscode-foreground: #202124;
    --vscode-descriptionForeground: #777; --vscode-editor-background: #fff;
    --vscode-editor-foreground: #202124; --vscode-sideBar-background: #fff;
    --vscode-button-background: #202124; --vscode-button-foreground: #fff;
    --vscode-button-secondaryBackground: #f1f1f1; --vscode-button-secondaryForeground: #202124;
    --vscode-input-background: #f5f5f5; --vscode-input-foreground: #202124;
    --vscode-input-border: #ddd; --vscode-focusBorder: #888;
    --vscode-menu-background: #fff; --vscode-menu-foreground: #202124;
    --vscode-textLink-foreground: #1558b0; --vscode-textLink-activeForeground: #1558b0;
    --vscode-textCodeBlock-background: #f5f5f5;
    --color-surface-primary: #fff; --color-surface-secondary: #fafafa;
    --color-surface-tertiary: #fff;
  }`;
  document.head.append(style);
  const token = __PROBE_TOKEN__;
  const base = typeof __PROBE_BASE__ === 'undefined' ? '' : __PROBE_BASE__;
  const headers = {'Content-Type': 'application/json', 'X-Probe-Token': token};
  let state;
  let cursor = __PROBE_CURSOR__;
  let stopped = false;
  let outbound = Promise.resolve();
  const showError = text => {
    let banner = document.getElementById('canvas-host-error');
    if (!banner) {
      banner = document.createElement('div'); banner.id = 'canvas-host-error';
      banner.setAttribute('role', 'alert');
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px;background:#fff1d6;color:#662f00;font:12px system-ui';
      document.body.append(banner);
    }
    banner.textContent = text;
  };
  window.addEventListener('pagehide', () => { stopped = true; });
  window.acquireVsCodeApi = () => ({
    getState: () => state,
    setState: value => (state = value),
    postMessage: value => {
      // The extension schedules prewarming specially. This probe sends the
      // exact thread/start RPC normally; retained/preemptive scheduling is absent.
      const message = value.type === 'thread-prewarm-start'
        ? {...value, type: 'mcp-request', probeOriginalType: value.type} : value;
      // VS Code postMessage is ordered. Concurrent HTTP requests are not:
      // a capability pull arriving before its push leaves bootstrap unresolved.
      outbound = outbound.then(() => fetch(base + '/bridge', {method: 'POST', headers, body: JSON.stringify(message)}))
        .then(async response => {
          if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            showError(response.status === 403 ? 'This card connection expired or another view became active. Refresh to reconnect.'
              : `Host rejected action (${response.status}): ${detail.error || 'Unsupported or unavailable action'}`);
          }
        }).catch(error => showError('Host unavailable: ' + error.message));
    },
  });
  async function poll() {
    while (!stopped) {
      try {
        const response = await fetch(base + '/events?after=' + cursor, {headers});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const batch = await response.json();
        for (const message of batch.messages) window.postMessage(message, location.origin);
        cursor = batch.cursor;
      } catch (error) {
        console.error('Probe event transport failed', error.message);
        showError('Host disconnected or this card was opened in another view. Refresh to reconnect.');
        stopped = true;
      }
    }
  }
  poll();
})();
