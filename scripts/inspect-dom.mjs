import http from 'http';
import { execSync } from 'child_process';

const ADB_DEVICE = '192.168.1.185:5555';

function getDevToolsPort() {
  const unixSockets = execSync(`adb -s ${ADB_DEVICE} shell "grep -a webview_devtools_remote /proc/net/unix"`, { encoding: 'utf8' });
  const match = unixSockets.match(/@webview_devtools_remote_(\d+)/);
  if (!match) throw new Error('No webview found');
  const pid = match[1];
  execSync(`adb -s ${ADB_DEVICE} forward tcp:9223 localabstract:webview_devtools_remote_${pid}`);
  return 9223;
}

function getWsUrl(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const targets = JSON.parse(data);
        const page = targets.find(t => t.type === 'page');
        resolve(page.webSocketDebuggerUrl);
      });
    }).on('error', reject);
  });
}

async function run() {
  const port = getDevToolsPort();
  const wsUrl = await getWsUrl(port);
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `({
        url: window.location.href,
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean),
        links: Array.from(document.querySelectorAll('a')).map(a => a.innerText.trim()).filter(Boolean),
        text: document.body.innerText.slice(0, 400)
      })`,
      returnByValue: true
    }
  }));

  ws.onmessage = evt => {
    const res = JSON.parse(evt.data.toString());
    console.log('DOM Info:', JSON.stringify(res.result?.value, null, 2));
    ws.close();
    process.exit(0);
  };
}

run().catch(console.error);
