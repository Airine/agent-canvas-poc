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
  let disconnected = false;
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
  const confirmed = new Map();
  let permissionSelection;
  function observePermissions(message) {
    if (message.type === 'persisted-atom-sync') permissionSelection = message.state?.['permission-selection-by-host-id:local'];
    if (message.type === 'persisted-atom-update' && message.key === 'permission-selection-by-host-id:local') permissionSelection = message.deleted ? undefined : message.value;
  }
  const confirmPermission = policy => new Promise(resolve => {
    const dialog = document.createElement('dialog');
    const text = document.createElement('p');
    text.textContent = policy === 'workspaceWrite'
      ? 'Allow this Codex session to write in this workspace? Network remains sandboxed. Escalations still require approval. This authorization resets when the host stops.'
      : 'Enable Full Access for this Codex session? Commands can access files and network without sandboxing or tool approval. This authorization resets when the host stops.';
    const yes = document.createElement('button'); yes.textContent = 'Allow permission change';
    const no = document.createElement('button'); no.textContent = 'Cancel';
    const done = value => { dialog.close(); dialog.remove(); resolve(value); };
    yes.onclick = () => done(true); no.onclick = () => done(false); dialog.oncancel = () => done(false);
    dialog.style.cssText = 'max-width:420px;padding:24px;border:1px solid #bbb;border-radius:14px;color:#222;background:white';
    dialog.append(text,no,yes); document.body.append(dialog); dialog.showModal();
  });
  const emit = message => window.postMessage(message, location.origin);
  const ensureConnected = () => {
    if (stopped || disconnected) throw new Error('Event connection unavailable; action was not submitted. Wait for reconnection or refresh.');
  };
  const rejectMessage = (message, detail, status = 503) => {
    if (message.type === 'mcp-request') {
      emit({type:'mcp-response',hostId:message.hostId || 'local',message:{id:message.request.id,error:{code:-32000,message:detail}}});
    } else if (message.type === 'fetch') {
      emit({type:'fetch-response',requestId:message.requestId,responseType:'error',status,error:detail});
    }
    showError(detail);
  };
  async function pickFiles(message) {
    const options = JSON.parse(message.body || '{}');
    if (options.kind === 'directory') throw new Error('Directory attachments are not supported');
    const files = await new Promise(resolve => {
      const picker = document.createElement('input'); picker.type = 'file'; picker.multiple = options.allowMultiple !== false;
      picker.accept = options.imagesOnly ? '.png,.jpg,.jpeg,.webp' : '.txt,.md,.json,.csv,.ts,.js,.py,.png,.jpg,.jpeg,.webp'; picker.hidden = true;
      const done = value => { picker.remove(); resolve(value); };
      picker.onchange = () => done(Array.from(picker.files || [])); picker.oncancel = () => done([]);
      document.body.append(picker); picker.click();
    });
    let result = {files:[]};
    if (files.length) {
      if (files.length > 4 || files.some(f => f.size > 2 * 1024 * 1024)) throw new Error('At most 4 files, 2 MiB each');
      const data = await Promise.all(files.map(async file => {
        let raw = ''; for (const b of new Uint8Array(await file.arrayBuffer())) raw += String.fromCharCode(b);
        return {name:file.name,mimeType:file.type,data:btoa(raw)};
      }));
      ensureConnected();
      const response = await fetch(base + '/attachments', {method:'POST',headers,body:JSON.stringify({files:data})});
      result = await response.json(); if (!response.ok) throw new Error(result.error || 'Upload failed');
    }
    emit({type:'fetch-response',requestId:message.requestId,responseType:'success',status:200,headers:{},bodyJsonString:JSON.stringify(result)});
  }
  async function dispatch(message) {
    ensureConnected();
    observePermissions(message);
    if (message.type === 'fetch' && message.url === 'vscode://codex/pick-files') {
      try { await pickFiles(message); }
      catch (error) { emit({type:'fetch-response',requestId:message.requestId,responseType:'error',status:400,error:error.message}); showError(error.message); }
      return {ok:true};
    }
    const req = message.type === 'mcp-request' ? message.request : null;
    if (req && ['thread/start','thread/resume','turn/start'].includes(req.method)) {
      const p = req.params || {}, owner = p.threadId || '__new__';
      const selectedPolicy = permissionSelection == null ? 'readOnly' : permissionSelection.kind === 'agent-mode'
        ? ({'read-only':'readOnly',auto:'workspaceWrite','full-access':'dangerFullAccess'})[permissionSelection.agentMode] : undefined;
      const policy = p.sandboxPolicy?.type || (p.sandbox ? ({'read-only':'readOnly','workspace-write':'workspaceWrite','danger-full-access':'dangerFullAccess'})[p.sandbox] : selectedPolicy);
      if (!['readOnly','workspaceWrite','dangerFullAccess'].includes(policy)) {
        emit({type:'mcp-response',hostId:'local',message:{id:req.id,error:{code:-32000,message:'This permission profile is not connected. Choose a supported mode.'}}});
        return {ok:true};
      }
      if (policy === 'readOnly') confirmed.delete(owner);
      else if (confirmed.get(owner) !== policy) {
        if (!await confirmPermission(policy)) {
          emit({type:'mcp-response',hostId:'local',message:{id:req.id,error:{code:-32000,message:'Permission change cancelled; nothing was submitted.'}}});
          return {ok:true};
        }
        ensureConnected();
        const result = await fetch(base + '/bridge', {method:'POST',headers,body:JSON.stringify({type:'canvas-confirm-permissions',threadId:owner,policy})});
        if (!result.ok) return result;
        confirmed.set(owner, policy);
      }
    }
    ensureConnected();
    return fetch(base + '/bridge', {method:'POST',headers,body:JSON.stringify(message)});
  }
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
      outbound = outbound.then(() => dispatch(message))
        .then(async response => {
          if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            if (response.status === 403) { stopped = true; disconnected = true; }
            rejectMessage(message, response.status === 403 ? 'This card connection expired or another view became active. Refresh to reconnect.'
              : response.status >= 500 ? `Host unavailable (${response.status}); outcome is unknown. Check history before retrying.`
              : `Host rejected action (${response.status}): ${detail.error || 'Unsupported or unavailable action'}`, response.status);
          }
        }).catch(error => rejectMessage(message, 'Host unavailable: ' + error.message + ' If submission started, its outcome is unknown; check history before retrying.'));
    },
  });
  async function poll() {
    let failures = 0;
    while (!stopped) {
      try {
        const response = await fetch(base + '/events?after=' + cursor, {headers});
        if (response.status === 403) stopped = true;
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const batch = await response.json();
        for (const message of batch.messages) { observePermissions(message); window.postMessage(message, location.origin); }
        cursor = batch.cursor;
        if (disconnected) document.getElementById('canvas-host-error')?.remove();
        disconnected = false;
        failures = 0;
      } catch (error) {
        console.error('Probe event transport failed', error.message);
        disconnected = true;
        showError(stopped ? 'This card connection expired. Refresh to reconnect.' : 'Host disconnected. Reconnecting; new actions are blocked.');
        // Retry only the read-only event stream, never an outbound action.
        if (!stopped) await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** failures++, 10000)));
      }
    }
  }
  poll();
})();
