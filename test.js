// Requirements: Node >= 18 (for global fetch)
// 1. Starts an async task
// 2. Polls until the task status becomes success or error

const BASE_URL = 'https://yce-api-01.makeupar.com/s2s/v2.1/task/hair-transfer';
const START_METHOD = 'POST';
const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": "Bearer sk-kCmq9dUPqAPFpb-ZKftcqHo16Pd1ay2cQ8zeNl0fUzYWIsqlzDcONiEGyO3o7Qb-"
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function httpRequest(method, fullUrl, {headers = {}, body} = {}) {
  const init = { method, headers };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await fetch(fullUrl, init);
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, headers: Object.fromEntries(res.headers.entries()), text, json };
}

async function startTask() {
  const initBody = JSON.stringify({
      "src_file_id": "W+uaMhf/2Kv6MwtiN4dbX1TgsobewpnqUGfsAlan41wLbKfeLEmuXUa9yH4wuc2K",
      "template_id": "all_highlight_pixie_cut"
});
  const { status, ok, json } = await httpRequest(START_METHOD, BASE_URL, { headers: HEADERS, body: initBody });
  if (!ok) {
    throw new Error('Start request failed: ' + status);
  }
  const taskId = json?.data?.task_id;
  if (!taskId) {
    throw new Error('task_id not found in response: ' + JSON.stringify(json));
  }
  console.log('[startTask] Task started, id =', taskId);
  return taskId;
}

async function pollTask(taskId, { intervalMs = 2000, maxAttempts = 300 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const pollUrl = BASE_URL + '/' + encodeURIComponent(taskId);
    const { status, ok, json } = await httpRequest('GET', pollUrl, { headers: HEADERS });
    if (!ok) {
      throw new Error('Polling failed: ' + status);
    }
    const taskStatus = json?.data?.task_status;
    console.log('[pollTask] Attempt', attempt, 'status =', taskStatus);
    if (taskStatus === 'success') {
      console.log('[pollTask] Success results:', json?.data?.results);
      return json;
    }
    if (taskStatus === 'error') {
      throw new Error('Task failed: ' + JSON.stringify(json));
    }
    await sleep(intervalMs);
  }
  throw new Error('Max attempts exceeded while polling');
}

(async () => {
  try {
    const taskId = await startTask();
    const finalPayload = await pollTask(taskId);
    console.log('[main] Final response:', JSON.stringify(finalPayload, null, 2));
  } catch (e) {
    console.error('[main] Flow error:', e);
    process.exitCode = 1;
  }
})();