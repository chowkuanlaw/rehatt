'use strict';

const { app, shell, dialog, clipboard } = require('electron');
const { spawn } = require('child_process');
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

let child = null;
let starting = null;
let nextId = 1;
let loginPending = null;
let accountCache = null;
let cachedAt = 0;
let selectedModel = '';
let startError = null;
let quitting = false;

const pending = new Map();
const listeners = new Set();

const folder = () =>
  path.join(app.getPath('userData'), 'chatgpt-runtime');

const workspace = () =>
  path.join(folder(), 'workspace');

const revisionFile = () =>
  path.join(folder(), 'login-revision.txt');

function nativeRuntime() {
  const targets = {
    'win32-x64': 'x86_64-pc-windows-msvc',
    'win32-arm64': 'aarch64-pc-windows-msvc',
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'linux-x64': 'x86_64-unknown-linux-musl',
    'linux-arm64': 'aarch64-unknown-linux-musl'
  };

  const platform = `${process.platform}-${process.arch}`;
  const target = targets[platform];

  if (!target) {
    throw new Error(
      `Codex does not support this system: ${platform}.`
    );
  }

  const projectRequire = createRequire(
    path.join(__dirname, 'package.json')
  );

  let packageRoot;

  try {
    packageRoot = path.dirname(
      projectRequire.resolve('@openai/codex/package.json')
    );
  } catch {
    throw new Error(
      'Install Codex: npm.cmd install @openai/codex --save --include=optional'
    );
  }

  const roots = [];

  try {
    const codexRequire = createRequire(
      path.join(packageRoot, 'package.json')
    );

    roots.push(
      path.dirname(
        codexRequire.resolve(
          `@openai/codex-${platform}/package.json`
        )
      )
    );
  } catch {}

  roots.push(packageRoot);

  const name =
    process.platform === 'win32' ? 'codex.exe' : 'codex';

  for (const root of roots) {
    const base = path.join(root, 'vendor', target);

    for (const [bin, helpers] of [
      ['bin', 'codex-path'],
      ['codex', 'path']
    ]) {
      const executable = path.join(base, bin, name);

      if (
        fs.existsSync(executable) &&
        fs.statSync(executable).isFile()
      ) {
        return {
          executable,
          helpers: path.join(base, helpers)
        };
      }
    }
  }

  throw new Error(
    'The Codex program is missing. Run: npm.cmd install @openai/codex --save --include=optional'
  );
}

function safeMessage(value) {
  return String(
    value || 'The ChatGPT connection failed.'
  )
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [hidden]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)/g,
      '[hidden]'
    )
    .replace(
      /((?:access_token|refresh_token|id_token|api_key|authorization|user_code|device_code|code|state)\s*[=:]\s*)[^\s,;]+/gi,
      '$1[hidden]'
    )
    .replace(
      /[A-Za-z0-9_+./=-]{70,}/g,
      '[hidden]'
    )
    .slice(0, 900);
}

function revision(change = false) {
  fs.mkdirSync(folder(), { recursive: true });

  if (change || !fs.existsSync(revisionFile())) {
    fs.writeFileSync(
      revisionFile(),
      crypto.randomUUID(),
      'utf8'
    );
  }

  return fs.readFileSync(revisionFile(), 'utf8').trim();
}

function notify(method, params) {
  if (
    method === 'account/updated' ||
    method === 'account/login/completed'
  ) {
    accountCache = null;
    cachedAt = 0;
  }

  for (const listener of [...listeners]) {
    listener(method, params);
  }
}

function stop(
  error = new Error('The ChatGPT connection is closed.')
) {
  const running = child;

  child = null;
  startError = error;
  accountCache = null;
  selectedModel = '';

  for (const job of pending.values()) {
    clearTimeout(job.timer);
    job.reject(error);
  }

  pending.clear();

  notify('runtime/stopped', {
    error: error.message
  });

  if (running && !running.killed) {
    running.kill();
  }
}

function receive(line) {
  let message;

  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.id != null && !message.method) {
    const job = pending.get(message.id);

    if (!job) return;

    pending.delete(message.id);
    clearTimeout(job.timer);

    if (message.error) {
      job.reject(
        new Error(safeMessage(message.error.message))
      );
    } else {
      job.resolve(message.result);
    }

    return;
  }

  // Project Mode only makes suggestions at this stage.
  if (message.id != null && message.method) {
    child?.stdin.write(
      JSON.stringify({
        id: message.id,
        error: {
          code: -32601,
          message:
            'Kopi Island does not allow running tools at this stage.'
        }
      }) + '\n'
    );

    return;
  }

  if (message.method) {
    notify(message.method, message.params || {});
  }
}

function request(method, params = {}, timeout = 25000) {
  return new Promise((resolve, reject) => {
    if (
      !child ||
      child.killed ||
      !child.stdin.writable
    ) {
      reject(new Error('ChatGPT did not start.'));
      return;
    }

    const id = nextId++;

    const timer = setTimeout(() => {
      pending.delete(id);

      reject(
        new Error(
          'ChatGPT did not respond in time. Try again.'
        )
      );
    }, timeout);

    pending.set(id, { resolve, reject, timer });

    child.stdin.write(
      JSON.stringify({ id, method, params }) + '\n',
      error => {
        if (!error || !pending.has(id)) return;

        clearTimeout(timer);
        pending.delete(id);

        reject(
          new Error(
            'The request could not be sent to ChatGPT.'
          )
        );
      }
    );
  });
}

function waitFor(method, predicate, timeout) {
  let listener;
  let timer;
  let rejectWait;

  const cleanup = () => {
    clearTimeout(timer);
    listeners.delete(listener);
  };

  const promise = new Promise((resolve, reject) => {
    rejectWait = reject;

    listener = (name, params) => {
      if (name === 'runtime/stopped') {
        cleanup();
        reject(new Error(params.error));
      } else if (
        name === method &&
        predicate(params)
      ) {
        cleanup();
        resolve(params);
      }
    };

    listeners.add(listener);

    timer = setTimeout(() => {
      cleanup();

      reject(
        new Error(
          'The ChatGPT connection took too long. Try again.'
        )
      );
    }, timeout);
  });

  // Notifications can arrive before the RPC answer.
  promise.catch(() => {});

  return {
    promise,
    cancel(error) {
      cleanup();
      rejectWait(error);
    }
  };
}

async function start(retry = false) {
  if (quitting) {
    throw new Error('Kopi Island is closing.');
  }

  if (starting) return starting;
  if (child) return;

  // After an error, only start again on an explicit sign-in.
  if (startError && !retry) throw startError;

  startError = null;

  const runtime = nativeRuntime();

  fs.mkdirSync(workspace(), { recursive: true });

  const task = (async () => {
    const env = { ...process.env };

    // Kopi Island’s own login and configuration.
    env.CODEX_HOME = path.join(folder(), 'codex');

    fs.mkdirSync(env.CODEX_HOME, { recursive: true });

    for (const name of [
      'OPENAI_API_KEY',
      'KOPI_OPENAI_API_KEY',
      'CODEX_API_KEY',
      'CODEX_ACCESS_TOKEN',
      'ELECTRON_RUN_AS_NODE'
    ]) {
      delete env[name];
    }

    if (fs.existsSync(runtime.helpers)) {
      const key =
        Object.keys(env).find(
          name => name.toLowerCase() === 'path'
        ) || 'PATH';

      env[key] = [
        runtime.helpers,
        env[key] || ''
      ]
        .filter(Boolean)
        .join(path.delimiter);

      for (const name of Object.keys(env)) {
        if (
          name.toLowerCase() === 'path' &&
          name !== key
        ) {
          delete env[name];
        }
      }
    }

    const overrides = [
      'forced_login_method="chatgpt"',
      'cli_auth_credentials_store="keyring"',
      'model_provider="openai"',
      'features.shell_tool=false',
      'features.unified_exec=false',
      'features.multi_agent=false',
      'features.apps=false',
      'features.hooks=false',
      'features.memories=false',
      'features.code_mode.enabled=false',
      'web_search="disabled"',
      'shell_environment_policy.inherit="none"',
      'default_permissions="kopi-chat"',
      'permissions.kopi-chat.filesystem={":minimal"="read",":workspace_roots"={"."="read"}}',
      'permissions.kopi-chat.network.enabled=false'
    ];

    const args = [
      'app-server',
      '--listen',
      'stdio://'
    ];

    for (const override of overrides) {
      args.push('-c', override);
    }

    // Start the program directly, without an extra launcher.
    const running = spawn(runtime.executable, args, {
      cwd: workspace(),
      env,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child = running;

    let diagnostics = '';

    running.stderr.on('data', data => {
      diagnostics = (
        diagnostics + data.toString()
      ).slice(-4000);
    });

    running.stdin.on('error', () => {});

    running.on('error', error => {
      if (child === running) {
        stop(
          new Error(
            `Codex could not start: ${safeMessage(error.message)}`
          )
        );
      }
    });

    running.on('exit', (code, signal) => {
      if (child !== running) return;

      const detail = diagnostics.trim()
        ? safeMessage(diagnostics.trim())
        : 'Click Sign in to try again.';

      stop(
        new Error(
          `Codex stopped (${code ?? signal ?? 'unknown'}). ${detail}`
        )
      );
    });

    readline
      .createInterface({ input: running.stdout })
      .on('line', line => {
        if (child === running) receive(line);
      });

    await request('initialize', {
      clientInfo: {
        name: 'kopi_island',
        title: 'Kopi Island',
        version: '1.0.0'
      },
      capabilities: {
        experimentalApi: true
      }
    });

    running.stdin.write(
      JSON.stringify({
        method: 'initialized',
        params: {}
      }) + '\n'
    );
  })();

  starting = task;

  try {
    await task;
  } catch (error) {
    stop(error);
    throw error;
  } finally {
    if (starting === task) starting = null;
  }
}

async function status(refresh = false) {
  try {
    nativeRuntime();
  } catch (error) {
    return {
      installed: false,
      ready: false,
      error: error.message
    };
  }

  try {
    await start();

    if (
      !refresh &&
      accountCache &&
      Date.now() - cachedAt < 1500
    ) {
      return accountCache;
    }

    const result = await request('account/read', {
      refreshToken: refresh
    });

    const account = result?.account;
    const ready = account?.type === 'chatgpt';

    accountCache = {
      installed: true,
      ready,
      email: ready ? account.email || '' : '',
      plan: ready ? account.planType || '' : '',
      model: selectedModel,
      fingerprint: ready
        ? crypto
            .createHash('sha256')
            .update(
              [
                account.email || '',
                account.planType || '',
                revision()
              ].join(':')
            )
            .digest('hex')
            .slice(0, 24)
        : ''
    };

    cachedAt = Date.now();
    remember(accountCache);

    return accountCache;
  } catch (error) {
    return {
      installed: true,
      ready: false,
      error: error.message
    };
  }
}

// What we last knew about the account, without starting Codex. Starting codex.exe can freeze all of
// Kopi Island for seconds on Windows (the virus scanner checks it first), so the settings use this.
// A login or logout changes the revision, which makes the old snapshot invalid.
const snapshotFile = () =>
  path.join(folder(), 'account.json');

function remember(account) {
  try {
    fs.writeFileSync(
      snapshotFile(),
      JSON.stringify({
        revision: revision(),
        ready: account.ready,
        email: account.email,
        plan: account.plan,
        fingerprint: account.fingerprint
      }),
      'utf8'
    );
  } catch {}
}

function peek() {
  if (accountCache) return accountCache;

  try {
    nativeRuntime();
  } catch (error) {
    return {
      installed: false,
      ready: false,
      error: error.message
    };
  }

  try {
    const saved = JSON.parse(fs.readFileSync(snapshotFile(), 'utf8'));

    if (saved?.revision === revision()) {
      return {
        installed: true,
        ready: saved.ready === true,
        email: String(saved.email || ''),
        plan: String(saved.plan || ''),
        model: selectedModel,
        fingerprint: String(saved.fingerprint || '')
      };
    }
  } catch {}

  return null;
}

async function login() {
  if (loginPending) {
    throw new Error(
      'A ChatGPT sign-in is already open.'
    );
  }

  await start(true);

  if (loginPending) {
    throw new Error(
      'A ChatGPT sign-in is already open.'
    );
  }

  loginPending = {
    id: null,
    waiter: null,
    cancelled: false
  };

  const attempt = loginPending;

  const waiter = waitFor(
    'account/login/completed',
    params =>
      !attempt.id ||
      params.loginId === attempt.id,
    900000
  );

  attempt.waiter = waiter;

  try {
    const result = await request(
      'account/login/start',
      { type: 'chatgptDeviceCode' },
      60000
    );

    attempt.id = result.loginId;

    if (attempt.cancelled) {
      throw new Error(
        'The ChatGPT sign-in was cancelled.'
      );
    }

    if (
      result.type !== 'chatgptDeviceCode' ||
      !attempt.id ||
      !result.userCode
    ) {
      throw new Error(
        'ChatGPT returned no sign-in code. Check that device-code sign-in is allowed for your account or workspace.'
      );
    }

    const url = new URL(result.verificationUrl);

    if (
      url.protocol !== 'https:' ||
      ![
        'auth.openai.com',
        'chatgpt.com'
      ].includes(url.hostname)
    ) {
      throw new Error(
        'The sign-in URL is not from OpenAI.'
      );
    }

    const choice = await dialog.showMessageBox({
      type: 'info',
      title: 'Kopi Island · Connect ChatGPT',
      message:
        `Your one-time sign-in code: ${result.userCode}`,
      detail:
        'Click below to copy the code and open the official OpenAI sign-in page. Sign in and paste the code there. Keep Kopi Island open until the connection is done.',
      buttons: [
        'Copy code and open browser',
        'Cancel'
      ],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (
      choice.response !== 0 ||
      attempt.cancelled ||
      child == null
    ) {
      throw new Error(
        'The ChatGPT sign-in was cancelled.'
      );
    }

    clipboard.writeText(result.userCode);

    await shell.openExternal(url.href);

    const completed = await waiter.promise;

    if (!completed.success) {
      throw new Error(
        safeMessage(
          completed.error ||
          'The ChatGPT sign-in was interrupted.'
        )
      );
    }

    revision(true);
    accountCache = null;

    const account = await status(true);

    if (!account.ready) {
      throw new Error(
        account.error ||
        'The account is not connected yet.'
      );
    }

    return account;
  } catch (error) {
    waiter.cancel(error);

    if (attempt.id) {
      await request('account/login/cancel', {
        loginId: attempt.id
      }).catch(() => {});
    }

    throw error;
  } finally {
    if (loginPending === attempt) {
      loginPending = null;
    }
  }
}

async function cancelLogin() {
  const attempt = loginPending;

  if (!attempt) return;

  attempt.cancelled = true;

  attempt.waiter?.cancel(
    new Error('The ChatGPT sign-in was cancelled.')
  );

  if (attempt.id) {
    await request('account/login/cancel', {
      loginId: attempt.id
    }).catch(() => {});
  }
}

async function logout() {
  await cancelLogin();
  await start();
  await request('account/logout');

  revision(true);

  accountCache = null;
  selectedModel = '';
}

async function answer(prompt, instructions, images = []) {
  const account = await status(true);

  if (!account.ready) {
    throw new Error(
      account.error ||
      'First sign in via Settings → AI → ChatGPT.'
    );
  }

  const catalog = await request('model/list', {
    includeHidden: false
  });

  const models = (catalog?.data || []).filter(
    model => !model.hidden
  );

  const chosen =
    models.find(model => model.isDefault) ||
    models[0];

  if (!chosen?.model) {
    throw new Error(
      'No model was found for this account.'
    );
  }

  selectedModel = chosen.model;

  const started = await request('thread/start', {
    model: chosen.model,
    cwd: workspace(),
    approvalPolicy: 'never',
    permissions: 'kopi-chat',
    ephemeral: true,
    baseInstructions:
      'Answer the text you are given. Use no tools and do not read or change files.',
    developerInstructions: instructions
  });

  const threadId = started?.thread?.id;

  if (!threadId) {
    throw new Error(
      'The ChatGPT chat could not be started.'
    );
  }

  let text = '';
  let turnId = null;

  const collect = (method, params) => {
    if (params.threadId !== threadId) return;

    if (method === 'item/agentMessage/delta') {
      text += params.delta || '';
    }

    if (
      method === 'item/completed' &&
      params.item?.type === 'agentMessage'
    ) {
      text = params.item.text || text;
    }
  };

  listeners.add(collect);

  const completed = waitFor(
    'turn/completed',
    params => params.threadId === threadId,
    180000
  );

  try {
    const result = await request('turn/start', {
      threadId,
      input: [
        {
          type: 'text',
          text: prompt
        },
        // screenshots (Kopi the buddy sends what is under him)
        ...images.map(file => ({ type: 'localImage', path: file }))
      ],
      approvalPolicy: 'never',
      permissions: 'kopi-chat'
    });

    turnId = result?.turn?.id;

    const event = await completed.promise;

    if (event.turn?.status !== 'completed') {
      throw new Error(
        safeMessage(
          event.turn?.error?.message ||
          'ChatGPT did not finish the request.'
        )
      );
    }

    if (!text.trim()) {
      throw new Error(
        'ChatGPT returned no readable answer.'
      );
    }

    return text.trim();
  } catch (error) {
    completed.cancel(error);

    if (turnId) {
      await request('turn/interrupt', {
        threadId,
        turnId
      }).catch(() => {});
    }

    throw error;
  } finally {
    listeners.delete(collect);

    await request('thread/unsubscribe', {
      threadId
    }).catch(() => {});
  }
}

app.on('before-quit', () => {
  quitting = true;
  stop();
});

// "Fix it" for Kopi Buddy: Codex changes files in one project folder, with Kopi Island's ChatGPT login.
// Only that folder may change (workspace-write sandbox), no web search, no hooks.
function fixInFolder(dir, prompt, images = [], sandbox = 'workspace-write') {
  const runtime = nativeRuntime();
  const env = { ...process.env };
  env.CODEX_HOME = path.join(folder(), 'codex');
  for (const name of ['OPENAI_API_KEY', 'KOPI_OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'ELECTRON_RUN_AS_NODE']) delete env[name];
  if (fs.existsSync(runtime.helpers)) {
    const key = Object.keys(env).find(name => name.toLowerCase() === 'path') || 'PATH';
    env[key] = [runtime.helpers, env[key] || ''].filter(Boolean).join(path.delimiter);
  }
  const out = path.join(folder(), `fix-${Date.now()}.txt`);
  const args = ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', sandbox === 'read-only' ? 'read-only' : 'workspace-write', '-C', dir, '-o', out,
    '-c', 'forced_login_method="chatgpt"', '-c', 'cli_auth_credentials_store="keyring"', '-c', 'features.hooks=false', '-c', 'web_search="disabled"',
    ...images.flatMap(file => ['-i', file]), '-'];
  return new Promise((resolve, reject) => {
    const running = spawn(runtime.executable, args, { cwd: dir, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let diagnostics = '';
    const timer = setTimeout(() => { try { running.kill(); } catch {} reject(new Error('Codex took too long.')); }, 300000);
    running.stderr.on('data', data => { diagnostics = (diagnostics + data.toString()).slice(-2000); });
    running.stdout.on('data', () => {});
    running.on('error', error => { clearTimeout(timer); reject(new Error(`Codex could not start: ${safeMessage(error.message)}`)); });
    running.on('close', code => {
      clearTimeout(timer);
      let text = '';
      try { text = fs.readFileSync(out, 'utf8').trim(); fs.unlinkSync(out); } catch {}
      if (text) resolve(text);
      else reject(new Error(code === 0 ? 'Codex gave no answer.' : `Codex stopped: ${safeMessage(diagnostics.split('\n').filter(Boolean).pop() || String(code))}`));
    });
    running.stdin.end(prompt);
  });
}

module.exports = {
  status,
  peek,
  login,
  cancelLogin,
  logout,
  answer,
  fixInFolder
};