async function submitHelp() {
      const desc = document.getElementById('helpdesc').value.trim();
      if (!desc) { document.getElementById('helpdesc').focus(); return; }
      const btn = document.getElementById('sendhelp');
      btn.disabled = true;
      const result = await IPC.sendHelpRequest({ description: desc, priority: selPrio, includeScreenshot: ssInclude });
      btn.disabled = false;
      const fb = document.getElementById('helpsent');
      const admins = result.sent;
      const ssNote = result.hasScreenshot ? ' · Screenshot attached' : '';
      fb.textContent = admins > 0
        ? `Request sent to ${admins} admin${admins > 1 ? 's' : ''}${ssNote}. They'll respond shortly.`
        : result.queued
          ? `No admins are available yet${ssNote}. Your request is queued and will be delivered when one is discovered.`
          : `Request is retrying delivery${ssNote}. A known admin is temporarily unavailable, so OpsLynk will keep trying automatically.`;
      fb.style.display = 'block';
      document.getElementById('helpdesc').value = '';
      ssInclude = false; ssBase64 = null; ssCaptured = false;
      document.getElementById('sschk').classList.remove('on'); document.getElementById('sschk').textContent = '';
      document.getElementById('sstoggle').classList.remove('active');
      document.getElementById('ssprevwrap').classList.remove('show');
      setTimeout(() => { fb.style.display = 'none'; }, 6000);
    }

async function toggleSS() {
      ssInclude = !ssInclude;
      const chk = document.getElementById('sschk');
      const row = document.getElementById('sstoggle');
      chk.textContent = ssInclude ? '✓' : '';
      chk.classList.toggle('on', ssInclude);
      row.classList.toggle('active', ssInclude);
      if (ssInclude && !ssCaptured) {
        await captureSSPreview();
      } else if (!ssInclude) {
        document.getElementById('ssprevwrap').classList.remove('show');
        ssBase64 = null; ssCaptured = false;
      }
    }

async function captureSSPreview() {
      const loading = document.getElementById('ssloading');
      loading.classList.add('show');
      try {
        const result = await IPC.captureScreenshotPreview();
        loading.classList.remove('show');
        if (result) {
          ssBase64 = result.base64; ssCaptured = true;
          const prev = document.getElementById('ssprev');
          prev.src = 'data:image/png;base64,' + result.base64;
          document.getElementById('ssprevsize').textContent = fmtBytes(result.size || 0);
          document.getElementById('ssprevwrap').classList.add('show');
        } else {
          showToast('Screenshot Failed', 'Could not capture screen. Check permissions.', 'warn');
          ssInclude = false; ssCaptured = false;
          document.getElementById('sschk').classList.remove('on'); document.getElementById('sschk').textContent = '';
          document.getElementById('sstoggle').classList.remove('active');
        }
      } catch (e) {
        loading.classList.remove('show');
        showToast('Screenshot Error', e.message || 'Unknown error', 'warn');
      }
    }

async function retakeScreenshot() {
      ssCaptured = false; ssBase64 = null;
      document.getElementById('ssprevwrap').classList.remove('show');
      await captureSSPreview();
    }

function setPrio(p) {
      selPrio = p;
      ['low', 'medium', 'urgent'].forEach(x => { const b = document.getElementById('prio-' + x); b.className = 'prbtn' + (x === p ? ` s${x[0]}` : ''); });
    }

function appendHelpCard(req) {
      const list = document.getElementById('helplist');
      if (!list) return;
      const existing = document.getElementById('hc-' + req.reqId);
      if (existing) existing.remove();
      const empty = list.querySelector('.empty, .empty-glass'); if (empty) empty.remove();
      const ts = req.timestamp ? new Date(req.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const card = document.createElement('article');
      card.className = `hcard ${req.priority || 'medium'}`;
      card.id = 'hc-' + req.reqId;
      card.dataset.priority = req.priority || 'medium';
      card.dataset.status = req.status === 'acked' ? 'acked' : 'open';
      card.dataset.username = req.username || '';
      card.dataset.machine = req.machine || '';
      card.dataset.description = req.description || '';
      const hasScreenshot = !!req.screenshotB64;
      const ssHtml = hasScreenshot ? `
    <div class="help-shot">
      <img class="ss-thumb" src="data:image/png;base64,${req.screenshotB64}" alt="screenshot" onclick="openLightbox(this.src)">
      <div class="ss-meta">Screenshot · ${fmtBytes(req.screenshotSize || 0)}</div>
    </div>` : '';
      const acked = req.status === 'acked';
      card.innerHTML = `
    <div class="help-card-head">
      <div class="help-card-user">
        <div class="help-card-avatar" style="background:${COLORS[Math.abs(hc(req.username || '?')) % COLORS.length]}">${(req.username || '?')[0].toUpperCase()}</div>
        <div>
          <div class="help-card-name">${esc(req.username)}</div>
          <div class="help-card-meta">
            <span class="mtag">${esc(req.machine || '')}</span>
            <span>${acked ? 'Acknowledged' : 'Awaiting action'}</span>
          </div>
        </div>
      </div>
      <div class="help-card-banner">
        <span class="pbadge ${req.priority || 'medium'}">${(req.priority || '').toUpperCase()}</span>
        <span class="help-card-time">${ts}</span>
      </div>
    </div>
    <div class="help-card-body">
      <div class="hdesc">${esc(req.description)}</div>
      ${ssHtml}
    </div>
    <div class="help-card-actions">
      ${acked ? '<span class="bsm done">Acknowledged</span>' : `<button class="bsm pr" onclick="ackHelp('${req.reqId}','${req.fromId}',this)">Acknowledge</button>`}
      <button class="bsm gh" onclick="openChat('${req.fromId}')">Open Chat</button>
    </div>`;
      if (acked) card.style.opacity = '.4';
      list.prepend(card);
      helpBadge = document.querySelectorAll('#helplist .hcard:not([style*="opacity"])').length;
      setHelpBadgeCount();
      addDashboardActivity('help', `Help request from ${req.username || 'user'}`, req.description || 'No details provided.', req.machine || 'LAN peer');
      renderHelpRequests();
      renderDashboard();
    }

async function ackHelp(reqId, fromId, btn) {
      await IPC.ackHelp({ peerId: fromId, reqId });
      const card = document.getElementById('hc-' + reqId);
      if (card) {
        card.style.opacity = '.4';
        card.dataset.status = 'acked';
        const actions = card.querySelector('.help-card-actions');
        if (actions) actions.innerHTML = '<span class="bsm done">Acknowledged</span>';
        card.classList.remove('focus');
      }
      helpBadge = document.querySelectorAll('#helplist .hcard:not([style*="opacity"])').length;
      setHelpBadgeCount();
      addDashboardActivity('system', 'Ticket acknowledged', 'A help request has been marked as acknowledged.', reqId);
      renderHelpRequests();
      renderDashboard();
    }

function focusHelpRequest(reqId) {
      const card = document.getElementById('hc-' + reqId);
      if (!card) return;
      document.querySelectorAll('#helplist .hcard.focus').forEach(el => el.classList.remove('focus'));
      card.classList.add('focus');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

function setHelpFilter(next) {
      helpFilter = next;
      renderHelpRequests();
    }

function renderHelpRequests() {
      const list = document.getElementById('helplist');
      if (!list) return;
      const search = (document.getElementById('helpSearch')?.value || '').trim().toLowerCase();
      const priority = document.getElementById('helpPriorityFilter')?.value || 'all';
      document.getElementById('helpFilterOpen')?.classList.toggle('active', helpFilter === 'open');
      document.getElementById('helpFilterAllState')?.classList.toggle('active', helpFilter === 'all');
      document.getElementById('helpFilterAcked')?.classList.toggle('active', helpFilter === 'acked');
      const cards = [...list.querySelectorAll('.hcard')];
      let visible = 0, urgent = 0, acked = 0, open = 0;
      cards.forEach(card => {
        const textBag = `${card.dataset.username || ''} ${card.dataset.machine || ''} ${card.dataset.description || ''}`.toLowerCase();
        const isAcked = card.dataset.status === 'acked';
        const isUrgent = card.dataset.priority === 'urgent';
        const stateAllowed = helpFilter === 'all' || (helpFilter === 'acked' ? isAcked : !isAcked);
        const priorityAllowed = priority === 'all' || card.dataset.priority === priority;
        const searchAllowed = !search || textBag.includes(search);
        const show = stateAllowed && priorityAllowed && searchAllowed;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
        if (isUrgent && !isAcked) urgent++;
        if (isAcked) acked++;
        if (!isAcked) open++;
      });
      const empty = list.querySelector('.empty-glass, .empty');
      if (!visible) {
        if (!empty) {
          const holder = document.createElement('div');
          holder.className = 'empty-glass';
          holder.innerHTML = '<div class="ei">Tickets</div>No help requests match the current filters.';
          list.appendChild(holder);
        } else {
          empty.className = 'empty-glass';
          empty.innerHTML = '<div class="ei">Tickets</div>No help requests match the current filters.';
        }
      } else if (empty && cards.length) {
        empty.remove();
      }
      document.getElementById('helpStatOpen')?.replaceChildren(document.createTextNode(String(open)));
      document.getElementById('helpStatUrgent')?.replaceChildren(document.createTextNode(String(urgent)));
      document.getElementById('helpStatAcked')?.replaceChildren(document.createTextNode(String(acked)));
    }
