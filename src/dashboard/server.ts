// Minimal in-process dashboard server for log streaming and process status
// - Starts on a random high port
// - Exposes:
//   GET /                -> Minimal HTML dashboard (vanilla JS)
//   GET /api/processes   -> JSON list of processes
//   GET /api/logs?processId=<id> (SSE stream)
// - Intended as a lightweight UI until a full React app is added

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseUrl, fileURLToPath } from 'node:url';
import winston from 'winston';
import { ProcessManager } from '../process/manager.js';
import { LogManager, LogEntry } from '../logs/manager.js';

export class DashboardServer {
  private server?: http.Server;
  private port?: number;
  private processManager: ProcessManager;
  private logManager: LogManager;
  private logger: winston.Logger;
  private streams: Map<string, Set<http.ServerResponse>>; // processId -> responders
  private started = false;

  constructor(pm: ProcessManager, logs: LogManager, logger: winston.Logger) {
    this.processManager = pm;
    this.logManager = logs;
    this.logger = logger;
    this.streams = new Map();
  }

  async ensureStarted(): Promise<{ port: number; url: string }> {
    if (this.started && this.port && this.server) {
      return { port: this.port, url: `http://localhost:${this.port}/` };
    }
    await new Promise<void>((resolve, reject) => {
      const srv = http.createServer((req, res) => this.route(req, res));
      // Ask OS for a random high port by passing 0
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          this.server = srv;
          this.started = true;
          this.logger.info(`Dashboard server listening on http://localhost:${this.port}`);
          // Hook log stream
          this.attachLogForwarder();
          resolve();
        } else {
          reject(new Error('Failed to bind dashboard server'));
        }
      });
      srv.on('error', reject);
    });
    return { port: this.port!, url: `http://localhost:${this.port}/` };
  }

  private route(req: http.IncomingMessage, res: http.ServerResponse) {
    const urlObj = parseUrl(req.url || '/', true);
    const pathname = urlObj.pathname || '/';

    if (pathname === '/' && req.method === 'GET') {
      this.handleIndex(res);
      return;
    }

    if (pathname === '/api/processes' && req.method === 'GET') {
      const processes = this.processManager.listProcesses();
      const body = JSON.stringify({ processes });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(body);
      return;
    }

    if (pathname === '/api/logs' && req.method === 'GET') {
      const processId = (urlObj.query.processId as string) || '';
      if (!processId) {
        res.statusCode = 400;
        res.end('Missing processId');
        return;
      }
      this.handleSseLogs(processId, res);
      return;
    }

    // Serve built React assets if present
    if (this.serveStatic(pathname, res)) return;

    res.statusCode = 404;
    res.end('Not found');
  }

  private serveStatic(pathname: string, res: http.ServerResponse): boolean {
    const rootDir = path.resolve(process.cwd(), 'apps/log-dashboard/dist');
    const safePath = pathname.replace(/\.\.+/g, '.');
    const filePath = path.join(rootDir, safePath.startsWith('/') ? safePath.slice(1) : safePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const ctype = ext === '.js' ? 'application/javascript'
        : ext === '.css' ? 'text/css'
        : ext === '.svg' ? 'image/svg+xml'
        : ext === '.ico' ? 'image/x-icon'
        : 'application/octet-stream';
      try {
        const buf = fs.readFileSync(filePath);
        res.statusCode = 200;
        res.setHeader('Content-Type', ctype);
        res.end(buf);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private handleIndex(res: http.ServerResponse) {
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MCP Process Logs</title>
<style>
  body { font-family: ui-sans-serif, system-ui; margin: 0; display: grid; grid-template-columns: 260px 1fr; height: 100vh; }
  aside { border-right: 1px solid #e5e7eb; padding: 12px; overflow: auto; }
  main { padding: 12px; display: flex; flex-direction: column; height: 100vh; }
  h1 { font-size: 14px; margin: 0 0 8px; color: #111827; }
  .proc { padding: 6px 8px; border-radius: 6px; cursor: pointer; margin-bottom: 6px; border: 1px solid transparent; }
  .proc:hover { background: #f9fafb; }
  .proc.active { border-color: #d1d5db; background: #f3f4f6; }
  .status { width: 8px; height: 8px; border-radius: 999px; display: inline-block; margin-right: 6px; }
  .running { background: #10b981; }
  .stopped { background: #9ca3af; }
  .failed { background: #ef4444; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
  button { padding: 6px 10px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; }
  button:hover { background: #f9fafb; }
  #logs { white-space: pre-wrap; background: #0b1020; color: #e5e7eb; padding: 8px; border-radius: 6px; flex: 1; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
  input { padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; }
</style>
</head>
<body>
  <aside>
    <h1>Processes</h1>
    <div id="proc-list"></div>
  </aside>
  <main>
    <div class="toolbar">
      <span id="current"></span>
      <input id="filter" placeholder="filter text" />
      <button id="pause">Pause</button>
      <button id="resume" disabled>Resume</button>
    </div>
    <div id="logs"></div>
  </main>
<script>
let currentProcessId = null;
let es = null;
let paused = false;
const logsEl = document.getElementById('logs');
const currentEl = document.getElementById('current');
const filterEl = document.getElementById('filter');

async function fetchProcesses() {
  const res = await fetch('/api/processes');
  const data = await res.json();
  const list = document.getElementById('proc-list');
  list.innerHTML = '';
  data.processes.forEach(p => {
    const div = document.createElement('div');
    div.className = 'proc' + (p.id === currentProcessId ? ' active' : '');
    const statusClass = p.status === 'running' ? 'running' : (p.status === 'stopped' ? 'stopped' : 'failed');
    div.innerHTML = '<span class="status ' + statusClass + '"></span>' + p.name + ' <small>(' + p.id.slice(0,6) + ')</small>';
    div.onclick = () => selectProcess(p.id, p.name);
    list.appendChild(div);
  });
}

function selectProcess(id, name) {
  currentProcessId = id;
  currentEl.textContent = 'Viewing: ' + name + ' (' + id.slice(0,6) + ')';
  logsEl.textContent = '';
  if (es) es.close();
  es = new EventSource('/api/logs?processId=' + encodeURIComponent(id));
  es.onmessage = (e) => {
    if (paused) return;
    try {
      const entry = JSON.parse(e.data);
      const filter = filterEl.value?.toLowerCase() || '';
      const text = '[' + new Date(entry.timestamp).toLocaleTimeString() + '] ' + entry.level.toUpperCase() + ' ' + entry.message;
      if (!filter || text.toLowerCase().includes(filter)) {
        logsEl.textContent += text + "\n";
        logsEl.scrollTop = logsEl.scrollHeight;
      }
    } catch {}
  };
  es.onerror = () => { /* ignore */ };
}

document.getElementById('pause').onclick = () => { paused = true; document.getElementById('pause').disabled = true; document.getElementById('resume').disabled = false; };
document.getElementById('resume').onclick = () => { paused = false; document.getElementById('pause').disabled = false; document.getElementById('resume').disabled = true; };

fetchProcesses();
setInterval(fetchProcesses, 3000);
</script>
</body>
</html>`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  }

  private handleSseLogs(processId: string, res: http.ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Send initial snapshot
    this.logManager.getLogs({ processId, limit: 200 }).then(entries => {
      for (const e of entries.reverse()) {
        res.write(`data: ${JSON.stringify(e)}\n\n`);
      }
    }).catch(() => {});

    if (!this.streams.has(processId)) this.streams.set(processId, new Set());
    const set = this.streams.get(processId)!;
    set.add(res);

    reqOnClose(res, () => {
      set.delete(res);
      try { res.end(); } catch {}
    });
  }

  private attachLogForwarder() {
    // Forward newLog events to any SSE clients subscribed for that process
    this.logManager.on('newLog', (entry: LogEntry) => {
      const set = this.streams.get(entry.processId);
      if (!set || set.size === 0) return;
      const line = `data: ${JSON.stringify(entry)}\n\n`;
      for (const res of Array.from(set)) {
        try { res.write(line); } catch {}
      }
    });
  }
}

function reqOnClose(res: http.ServerResponse, cb: () => void) {
  res.on('close', cb);
  res.on('finish', cb);
}
