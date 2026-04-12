const CLIENT_TOOLS = [
  { id: 'sysinfo',   label: 'System Info',       icon: '🖥️',  desc: 'OS, CPU, RAM, hostname' },
  { id: 'network',   label: 'Network Status',     icon: '🌐',  desc: 'IP, interfaces, adapters' },
  { id: 'processes', label: 'Running Processes',  icon: '⚙️',  desc: 'Top processes by memory' },
  { id: 'storage',   label: 'Disk Space',         icon: '💾',  desc: 'Drives and free space' },
  { id: 'services',  label: 'Services',           icon: '🔧',  desc: 'Windows service status' }
];

function initClientTools() {
  const grid = document.getElementById('clientToolsGrid');
  if (!grid) return;
  grid.innerHTML = CLIENT_TOOLS.map(tool => `
    <div class="ct-card" onclick="openClientTool('${tool.id}')">
      <div class="ct-icon">${tool.icon}</div>
      <div class="ct-label">${tool.label}</div>
      <div class="ct-desc">${tool.desc}</div>
    </div>
  `).join('');
}

async function openClientTool(toolId) {
  const tool = CLIENT_TOOLS.find(t => t.id === toolId);
  if (!tool) return;
  const grid = document.getElementById('clientToolsGrid');
  const result = document.getElementById('clientToolResult');
  const title = document.getElementById('ctResultTitle');
  const body = document.getElementById('ctResultBody');
  if (!result || !body) return;

  body.textContent = 'Loading…';
  if (grid) grid.style.display = 'none';
  result.style.display = 'block';
  if (title) title.textContent = `${tool.icon} ${tool.label}`;

  try {
    const data = await IPC.getClientToolData?.(toolId);
    body.textContent = data?.output || data?.error || 'No data returned.';
  } catch (e) {
    body.textContent = 'Error: ' + (e?.message || 'Unknown error');
  }
}

function closeClientToolResult() {
  const grid = document.getElementById('clientToolsGrid');
  const result = document.getElementById('clientToolResult');
  if (grid) grid.style.display = '';
  if (result) result.style.display = 'none';
}
