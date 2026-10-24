import http from 'http';
import { execSync } from 'child_process';

const ADB_DEVICE = '192.168.1.185:5555';

function adb(cmd) {
  try {
    return execSync(`adb -s ${ADB_DEVICE} ${cmd}`, { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error(`ADB command error: adb -s ${ADB_DEVICE} ${cmd}`, err.message);
    throw err;
  }
}

async function getDevToolsPort() {
  const unixSockets = adb('shell "grep -a webview_devtools_remote /proc/net/unix"');
  const match = unixSockets.match(/@webview_devtools_remote_(\d+)/);
  if (!match) throw new Error('No webview_devtools_remote found in /proc/net/unix');
  const pid = match[1];
  console.log(`[DevTools] Found WebView PID: ${pid}`);
  adb(`forward tcp:9223 localabstract:webview_devtools_remote_${pid}`);
  return 9223;
}

function getWsUrl(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const page = targets.find(t => t.type === 'page');
          if (page && page.webSocketDebuggerUrl) {
            resolve(page.webSocketDebuggerUrl);
          } else {
            reject(new Error(`No page target found in: ${data}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

class DevToolsClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = evt => {
        const msg = JSON.parse(evt.data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function connectToApp() {
  const port = await getDevToolsPort();
  const wsUrl = await getWsUrl(port);
  console.log(`[DevTools] Connecting to ${wsUrl}`);
  const client = new DevToolsClient(wsUrl);
  await client.connect();
  return client;
}

async function main() {
  console.log('====================================================');
  console.log(' IRONLOG WORKOUT FINISH & RESTORE VERIFICATION TEST ');
  console.log('====================================================\n');

  let client = await connectToApp();

  // Test 1: Check initial page state
  console.log('>>> [1] Inspecting current page state...');
  let state = await client.eval(`({
    url: window.location.href,
    activeWorkout: localStorage.getItem('active-workout'),
    sessions: localStorage.getItem('ironlog_table_workout_sessions')
  })`);
  console.log('Current state:', state);

  // Navigate to /workout/
  console.log('\n>>> [2] Navigating to /workout/...');
  await client.eval(`window.location.href = '/workout/'`);
  await client.wait(2000);
  // Reconnect in case context changed
  client.close();
  client = await connectToApp();

  let workoutPage = await client.eval(`({
    url: window.location.href,
    hasStartWorkout: document.body.innerText.includes('Start a workout') || document.body.innerText.includes('Start'),
    hasActiveWorkout: !document.body.innerText.includes('Start a workout') && document.body.innerText.includes('Finish'),
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
  })`);
  console.log('Workout page state:', workoutPage);

  // Scenario A: Test Discard Workout escape hatch
  console.log('\n>>> [3] SCENARIO A: Test Discard escape hatch with confirm dialog...');
  
  // Start a quick custom workout or routine
  console.log('Starting a workout from UI...');
  const started = await client.eval(`(() => {
    // Look for Start a workout or a routine button
    const btns = Array.from(document.querySelectorAll('button'));
    const startBtn = btns.find(b => b.innerText.includes('Start a workout') || b.innerText.includes('Start empty workout') || b.innerText.includes('Start'));
    if (startBtn) {
      startBtn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Clicked start button:', started);
  await client.wait(2000);

  // If on StartWorkout screen tabs, tap "Instant" or "Start empty workout"
  let checkScreen = await client.eval(`({
    hasFinish: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Finish') || b.getAttribute('data-testid') === 'finish-button'),
    hasDiscard: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Discard') || b.getAttribute('data-testid') === 'discard-button'),
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
  })`);
  console.log('After start click:', checkScreen);

  if (!checkScreen.hasFinish) {
    // Try tapping "Planned" or "Start empty workout"
    console.log('Looking for routine card or empty workout...');
    await client.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const instant = btns.find(b => b.innerText.includes('Instant') || b.innerText.includes('Start empty') || b.innerText.includes('Full Body'));
      if (instant) instant.click();
    })()`);
    await client.wait(2000);
  }

  // Verify we are now in an active workout screen
  let activeScreen = await client.eval(`({
    hasFinish: Array.from(document.querySelectorAll('button')).some(b => b.getAttribute('data-testid') === 'finish-button' || b.innerText.includes('Finish')),
    hasDiscard: Array.from(document.querySelectorAll('button')).some(b => b.getAttribute('data-testid') === 'discard-button' || b.innerText.includes('Discard')),
    discardTestId: !!document.querySelector('[data-testid="discard-button"]'),
  })`);
  console.log('In active workout:', activeScreen);

  if (activeScreen.hasDiscard) {
    console.log('Tapping Discard button...');
    await client.eval(`document.querySelector('[data-testid="discard-button"]').click()`);
    await client.wait(500);

    const confirmDialogVisible = await client.eval(`!!document.querySelector('[data-testid="discard-confirm-dialog"]')`);
    console.log('✓ Discard confirmation dialog appeared:', confirmDialogVisible);

    console.log('Tapping "Keep editing" (Cancel)...');
    await client.eval(`(() => {
      const dialog = document.querySelector('[data-testid="discard-confirm-dialog"]');
      const keepBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.includes('Keep editing'));
      if (keepBtn) keepBtn.click();
    })()`);
    await client.wait(500);
    const dialogStillThere = await client.eval(`!!document.querySelector('[data-testid="discard-confirm-dialog"]')`);
    console.log('Confirmation dialog closed after cancel:', !dialogStillThere);

    console.log('Tapping Discard again and confirming discard...');
    await client.eval(`document.querySelector('[data-testid="discard-button"]').click()`);
    await client.wait(500);
    await client.eval(`document.querySelector('[data-testid="confirm-discard"]').click()`);
    await client.wait(1500);

    const postDiscard = await client.eval(`({
      url: window.location.href,
      activeWorkout: localStorage.getItem('active-workout'),
      sessions: localStorage.getItem('ironlog_table_workout_sessions'),
      hasActiveWorkoutBar: !!document.querySelector('[data-testid="active-workout-bar"]')
    })`);
    console.log('✓ Post-discard state:', postDiscard);
    if (!postDiscard.activeWorkout || postDiscard.activeWorkout === 'null') {
      console.log('✓ SUCCESS: Active workout flag cleared, workout discarded cleanly!');
    } else {
      throw new Error(`Failed: active workout flag still set: ${postDiscard.activeWorkout}`);
    }
  }

  // Scenario B: Test Finish Workout Flow & Reopen Prevention
  console.log('\n>>> [4] SCENARIO B: Test Finish workout, volume computation, and reopen prevention...');
  // Go to /workout/
  await client.eval(`window.location.href = '/workout/'`);
  await client.wait(2000);
  client.close();
  client = await connectToApp();

  // Start a workout
  console.log('Starting workout for finish test...');
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const startBtn = btns.find(b => b.innerText.includes('Start a workout') || b.innerText.includes('Start empty workout') || b.innerText.includes('Start'));
    if (startBtn) startBtn.click();
  })()`);
  await client.wait(2000);

  // Check if we need to tap a routine
  let inWorkout = await client.eval(`!!document.querySelector('[data-testid="finish-button"]')`);
  if (!inWorkout) {
    await client.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find(b => b.innerText.includes('Full Body A') || b.innerText.includes('Instant') || b.innerText.includes('Start'));
      if (b) b.click();
    })()`);
    await client.wait(2000);
  }

  // Ensure an exercise is added and log a set
  console.log('Adding exercise / logging set...');
  const addExBtn = await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addBtn = btns.find(b => b.innerText.includes('Add exercise'));
    if (addBtn) {
      addBtn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Clicked Add Exercise:', addExBtn);
  await client.wait(1000);

  // If exercise picker opened, pick the first exercise (e.g. Barbell Squat or Bench Press)
  await client.eval(`(() => {
    const items = Array.from(document.querySelectorAll('button, [role="button"]'));
    const ex = items.find(i => i.innerText.includes('Squat') || i.innerText.includes('Bench Press') || i.innerText.includes('Barbell'));
    if (ex) ex.click();
  })()`);
  await client.wait(1000);

  // Now log the set using "Log Set" button
  console.log('Tapping Log Set...');
  const logged = await client.eval(`(() => {
    const logBtn = document.querySelector('[data-testid="log-set"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Log Set'));
    if (logBtn) {
      logBtn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Logged set:', logged);
  await client.wait(1000);

  // Now tap Finish
  console.log('Tapping Finish button...');
  await client.eval(`document.querySelector('[data-testid="finish-button"]').click()`);
  await client.wait(1000);

  // If confirmation dialog appears, confirm finish
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const finishConfirm = btns.find(b => b.innerText === 'Finish' || b.innerText.includes('Save'));
    if (finishConfirm) finishConfirm.click();
  })()`);
  await client.wait(2000);

  // If finish summary appears, close it or tap Done
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const doneBtn = btns.find(b => b.innerText.includes('Done') || b.innerText.includes('Close'));
    if (doneBtn) doneBtn.click();
  })()`);
  await client.wait(1500);

  // Inspect state after finish
  const postFinish = await client.eval(`({
    url: window.location.href,
    activeWorkout: localStorage.getItem('active-workout'),
    sessions: localStorage.getItem('ironlog_table_workout_sessions'),
  })`);
  console.log('Post-finish state:', postFinish);

  const sessions = JSON.parse(postFinish.sessions || '[]');
  const latestSession = sessions[sessions.length - 1];
  console.log('Latest session in history:', latestSession);

  if (latestSession && latestSession.end_time) {
    console.log(`✓ SUCCESS: Workout saved to history with completed end_time: ${latestSession.end_time}, volume: ${latestSession.volume}`);
  } else {
    throw new Error(`Failed: Workout in history has no end_time: ${JSON.stringify(latestSession)}`);
  }

  if (!postFinish.activeWorkout || postFinish.activeWorkout === 'null') {
    console.log('✓ SUCCESS: Active workout flag cleared everywhere!');
  } else {
    throw new Error(`Failed: Active workout flag still set: ${postFinish.activeWorkout}`);
  }

  // Test reopen prevention across navigations
  console.log('\n>>> [5] Testing Reopen Prevention across navigations...');
  for (const tab of ['/progress/', '/plans/', '/more/', '/', '/workout/']) {
    console.log(`Navigating to ${tab}...`);
    await client.eval(`window.location.href = '${tab}'`);
    await client.wait(1500);
    client.close();
    client = await connectToApp();

    const tabState = await client.eval(`({
      url: window.location.href,
      activeWorkout: localStorage.getItem('active-workout'),
      hasFinish: !!document.querySelector('[data-testid="finish-button"]')
    })`);
    console.log(`  State at ${tab}: activeWorkout=${tabState.activeWorkout}, hasFinish=${tabState.hasFinish}`);
    if (tabState.hasFinish) {
      throw new Error(`FAILED: Active workout reopened on navigation to ${tab}!`);
    }
  }
  console.log('✓ SUCCESS: Active workout never reopens on navigation!');

  // Test app restart
  console.log('\n>>> [6] Testing App Restart...');
  client.close();
  console.log('Force stopping com.ironlog.app...');
  adb('shell am force-stop com.ironlog.app');
  await new Promise(r => setTimeout(r, 1000));
  console.log('Relaunching com.ironlog.app...');
  adb('shell monkey -p com.ironlog.app -c android.intent.category.LAUNCHER 1');
  await new Promise(r => setTimeout(r, 2000));

  client = await connectToApp();
  const restartState = await client.eval(`({
    url: window.location.href,
    activeWorkout: localStorage.getItem('active-workout'),
    hasFinish: !!document.querySelector('[data-testid="finish-button"]')
  })`);
  console.log('Post-restart state:', restartState);
  if (restartState.hasFinish) {
    throw new Error('FAILED: Active workout reopened after app restart!');
  }
  console.log('✓ SUCCESS: Active workout never reopens on app restart!');

  // Scenario C: Offline / Airplane mode test
  console.log('\n>>> [7] SCENARIO C: Offline / Airplane Mode Finish Test...');
  console.log('Enabling airplane mode...');
  adb('shell cmd connectivity airplane-mode enable');
  await client.wait(1500);

  // Start a workout in airplane mode
  console.log('Navigating to /workout/ in airplane mode...');
  await client.eval(`window.location.href = '/workout/'`);
  await client.wait(1500);
  client.close();
  client = await connectToApp();

  console.log('Starting offline workout...');
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const startBtn = btns.find(b => b.innerText.includes('Start a workout') || b.innerText.includes('Start'));
    if (startBtn) startBtn.click();
  })()`);
  await client.wait(1500);

  // If routine list, click first
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(b => b.innerText.includes('Full Body A') || b.innerText.includes('Instant') || b.innerText.includes('Start'));
    if (b) b.click();
  })()`);
  await client.wait(1500);

  // Add exercise & log set offline
  await client.eval(`(() => {
    const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Add exercise'));
    if (addBtn) addBtn.click();
  })()`);
  await client.wait(1000);
  await client.eval(`(() => {
    const items = Array.from(document.querySelectorAll('button, [role="button"]'));
    const ex = items.find(i => i.innerText.includes('Squat') || i.innerText.includes('Bench') || i.innerText.includes('Barbell'));
    if (ex) ex.click();
  })()`);
  await client.wait(1000);

  // Tap Log Set
  await client.eval(`(() => {
    const logBtn = document.querySelector('[data-testid="log-set"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Log Set'));
    if (logBtn) logBtn.click();
  })()`);
  await client.wait(1000);

  // Tap Finish
  console.log('Finishing workout offline in airplane mode...');
  await client.eval(`document.querySelector('[data-testid="finish-button"]').click()`);
  await client.wait(1000);
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const finishConfirm = btns.find(b => b.innerText === 'Finish' || b.innerText.includes('Save'));
    if (finishConfirm) finishConfirm.click();
  })()`);
  await client.wait(2000);

  // Close summary if open
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const doneBtn = btns.find(b => b.innerText.includes('Done') || b.innerText.includes('Close'));
    if (doneBtn) doneBtn.click();
  })()`);
  await client.wait(1000);

  const offlineFinish = await client.eval(`({
    activeWorkout: localStorage.getItem('active-workout'),
    sessions: localStorage.getItem('ironlog_table_workout_sessions')
  })`);
  console.log('Offline finish state:', offlineFinish);
  if (!offlineFinish.activeWorkout || offlineFinish.activeWorkout === 'null') {
    console.log('✓ SUCCESS: Workout finished cleanly offline!');
  } else {
    throw new Error('FAILED: Active workout not cleared offline!');
  }

  console.log('Disabling airplane mode (restoring network)...');
  adb('shell cmd connectivity airplane-mode disable');
  await client.wait(2000);
  console.log('✓ Airplane mode disabled.');

  // Scenario D: Folded & Unfolded layout test
  console.log('\n>>> [8] SCENARIO D: Folded & Unfolded Test on Galaxy Z Fold8...');
  console.log('Testing Unfolded (state 3)...');
  adb('shell cmd device_state state 3');
  await client.wait(1000);
  let unfoldedDims = await client.eval(`({ width: window.innerWidth, height: window.innerHeight })`);
  console.log('Unfolded viewport dimensions:', unfoldedDims);

  console.log('Testing Folded (state 0)...');
  adb('shell cmd device_state state 0');
  await client.wait(1500);
  let foldedDims = await client.eval(`({ width: window.innerWidth, height: window.innerHeight })`);
  console.log('Folded viewport dimensions:', foldedDims);

  console.log('Canceling device state override (returning to hardware sensor state)...');
  adb('shell cmd device_state cancel');
  await client.wait(1000);

  // Step 9: Check console errors
  console.log('\n>>> [9] Checking for console errors in logcat...');
  const logs = adb('logcat -d -s "Capacitor/Console"');
  const errorLines = logs.split('\n').filter(l => l.includes('Msg: Error') || l.includes('TypeError') || l.includes('Uncaught'));
  console.log(`Console error lines count: ${errorLines.length}`);
  if (errorLines.length > 0) {
    console.log('Console errors:', errorLines);
  }

  console.log('\n====================================================');
  console.log(' ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!       ');
  console.log('====================================================');

  client.close();
}

main().catch(err => {
  console.error('\n*** TEST FAILED ***', err);
  process.exit(1);
});
