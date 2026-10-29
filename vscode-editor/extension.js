(function vscodeExtension() {
  'use strict';

  const vscode = require('vscode');
  const http = require('http');
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  const hash = value =>
    crypto.createHash('sha256').update(value).digest('hex');

  const norm = value =>
    String(value).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  let queue = Promise.resolve();

  function request(port, token, route, data) {
    return new Promise((resolve, reject) => {
      const body = data ? JSON.stringify(data) : '';

      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: route,
        method: data ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(data ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          } : {})
        }
      }, res => {
        let bytes = 0;
        const chunks = [];

        res.on('data', part => {
          bytes += part.length;

          if (bytes > 1024 * 1024) {
            req.destroy(new Error('The request is too big.'));
          } else {
            chunks.push(part);
          }
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(
              Buffer.concat(chunks).toString('utf8')
            );

            if (!result.ok) {
              reject(new Error(
                result.error || 'Kopi Island is no longer connected.'
              ));
            } else {
              resolve(result);
            }
          } catch (error) {
            reject(error);
          }
        });

        res.on('error', reject);
      });

      req.on('error', reject);

      req.setTimeout(10000, () => {
        req.destroy(new Error('Kopi Island is not responding.'));
      });

      req.end(body);
    });
  }

  function inspect(job, document) {
    if (
      !path.isAbsolute(job.root) ||
      !path.isAbsolute(job.file)
    ) {
      throw new Error('Invalid project location.');
    }

    const root = fs.realpathSync(job.root);
    const file = fs.realpathSync(job.file);
    const relative = path.relative(root, file);

    if (
      root !== job.root ||
      file !== job.file ||
      !relative ||
      relative.startsWith('..' + path.sep) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        'The file is outside the chosen project.'
      );
    }

    let item = root;

    for (const part of relative.split(path.sep)) {
      item = path.join(item, part);

      if (fs.lstatSync(item).isSymbolicLink()) {
        throw new Error('Links are not edited.');
      }
    }

    const stat = fs.statSync(file);

    if (
      !stat.isFile() ||
      stat.nlink > 1 ||
      stat.size > 300 * 1024
    ) {
      throw new Error(
        'The file cannot be edited safely.'
      );
    }

    const bytes = fs.readFileSync(file);

    if (hash(bytes) !== job.hash) {
      throw new Error(
        'The file changed in the meantime. ' +
        'Send your request again.'
      );
    }

    if (document.isDirty) {
      throw new Error(
        'Save your own changes in VS Code first. ' +
        'Kopi Island overwrote nothing.'
      );
    }

    if (hash(norm(document.getText())) !== job.textHash) {
      throw new Error(
        'VS Code shows a different version. ' +
        'Save the file and try again.'
      );
    }

    return stat;
  }

  function rawOffset(text, normalized) {
    let raw = 0;
    let count = 0;

    while (raw < text.length && count < normalized) {
      if (text[raw] === '\r' && text[raw + 1] === '\n') {
        raw++;
      }

      raw++;
      count++;
    }

    return raw;
  }

  async function run(port, token, job) {
    const uri = vscode.Uri.file(job.file);
    const doc = await vscode.workspace.openTextDocument(uri);

    const editor = await vscode.window.showTextDocument(doc, {
      preview: false,
      preserveFocus: false
    });

    inspect(job, doc);

    if (['open', 'check'].includes(job.kind)) {
      return { ok: true };
    }

    if (!['apply', 'restore'].includes(job.kind)) {
      throw new Error('Unknown Kopi Island command.');
    }

    const version = doc.version;
    const source = doc.getText();
    const normalized = norm(source);

    let target = normalized;

    if (job.kind === 'apply') {
      if (
        !Array.isArray(job.edits) ||
        !job.edits.length ||
        job.edits.length > 20
      ) {
        throw new Error('Invalid code change.');
      }

      let previous = -1;

      for (const edit of job.edits) {
        if (
          !Number.isInteger(edit.start) ||
          !Number.isInteger(edit.end) ||
          edit.start < 0 ||
          edit.end <= edit.start ||
          edit.end > normalized.length ||
          edit.start < previous ||
          typeof edit.text !== 'string'
        ) {
          throw new Error(
            'Invalid range for the change.'
          );
        }

        previous = edit.end;
      }

      for (const edit of [...job.edits].reverse()) {
        target =
          target.slice(0, edit.start) +
          edit.text +
          target.slice(edit.end);
      }

      if (
        !target.trim() ||
        Buffer.byteLength(target) > 300 * 1024 ||
        hash(target) !== job.targetHash
      ) {
        throw new Error(
          'The change was not received completely.'
        );
      }
    } else {
      if (
        typeof job.content !== 'string' ||
        Buffer.byteLength(job.content) > 300 * 1024 ||
        hash(Buffer.from(job.content)) !== job.originalHash
      ) {
        throw new Error('The backup is not valid.');
      }
    }

    await request(port, token, '/ready', { id: job.id });

    if (doc.version !== version || doc.getText() !== source) {
      throw new Error(
        'You typed in VS Code in the meantime. ' +
        'Nothing was overwritten.'
      );
    }

    const stat = inspect(job, doc);

    if (job.kind === 'restore') {
      const temp =
        job.file + '.' + crypto.randomUUID() + '.kopi-tmp';

      try {
        fs.writeFileSync(
          temp,
          Buffer.from(job.content),
          { flag: 'wx', mode: stat.mode }
        );

        inspect(job, doc);
        fs.renameSync(temp, job.file);
      } finally {
        if (fs.existsSync(temp)) {
          fs.unlinkSync(temp);
        }
      }

      return {
        ok: true,
        savedHash: job.originalHash
      };
    }

    const edit = new vscode.WorkspaceEdit();

    const eol = doc.eol === vscode.EndOfLine.CRLF
      ? '\r\n'
      : '\n';

    for (const change of job.edits) {
      edit.replace(
        uri,
        new vscode.Range(
          doc.positionAt(rawOffset(source, change.start)),
          doc.positionAt(rawOffset(source, change.end))
        ),
        change.text.replace(/\n/g, eol)
      );
    }

    if (!await vscode.workspace.applyEdit(edit, {
      label: 'Kopi Island change'
    })) {
      throw new Error(
        'VS Code could not make the change.'
      );
    }

    const appliedVersion = doc.version;

    if (norm(doc.getText()) !== target) {
      throw new Error(
        'The content changed while editing. ' +
        'Check the file in VS Code.'
      );
    }

    const onDisk = fs.readFileSync(job.file);

    const autoSaved =
      !doc.isDirty &&
      hash(norm(onDisk.toString('utf8'))) === hash(target);

    if (
      (!autoSaved && hash(onDisk) !== job.hash) ||
      doc.version !== appliedVersion
    ) {
      throw new Error(
        'The file was changed at the same time. ' +
        'Kopi Island did not save.'
      );
    }

    if (!autoSaved && !await doc.save()) {
      throw new Error(
        'The change is in VS Code, but saving failed. ' +
        'Your backup is kept.'
      );
    }

    if (doc.isDirty) {
      throw new Error(
        'There are new changes in VS Code. ' +
        'Check the file.'
      );
    }

    job.savedHash = hash(fs.readFileSync(job.file));

    const first = job.edits[0];

    const pos = doc.positionAt(rawOffset(
      doc.getText(),
      Math.min(first.start, norm(doc.getText()).length)
    ));

    editor.selection = new vscode.Selection(pos, pos);

    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );

    return {
      ok: true,
      savedHash: job.savedHash
    };
  }

  exports.activate = function activate(context) {
    context.subscriptions.push(
      vscode.window.registerUriHandler({
        handleUri(uri) {
          if (
            uri.authority !== 'kopi.project-editor' ||
            uri.path !== '/connect'
          ) {
            return;
          }

          const params = new URLSearchParams(uri.query);
          const port = Number(params.get('port'));
          const token = params.get('token');
          const id = params.get('job');

          if (
            !Number.isInteger(port) ||
            port < 1024 ||
            port > 65535 ||
            !/^[a-f0-9]{64}$/.test(token || '') ||
            !/^[a-f0-9-]{36}$/.test(id || '')
          ) {
            return;
          }

          queue = queue.catch(() => {}).then(async () => {
            let claimed = false;
            let job;

            try {
              const data = await request(
                port,
                token,
                '/job/' + id
              );

              claimed = true;
              job = data.job;

              const title = job.kind === 'apply'
                ? 'Changing code'
                : job.kind === 'restore'
                  ? 'Restoring the previous version'
                  : 'Opening file';

              const result = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: 'Kopi Island · ' + title
              }, () => run(port, token, job));

              await request(port, token, '/complete', {
                id,
                result
              });
            } catch (error) {
              const result = {
                ok: false,
                error: String(
                  error.message || 'The change failed.'
                ).slice(0, 700),
                savedHash: job?.savedHash || ''
              };

              if (claimed) {
                await request(port, token, '/complete', {
                  id,
                  result
                }).catch(() => {});
              }

              vscode.window.showWarningMessage(
                'Kopi Island: ' + result.error
              );
            }
          });
        }
      })
    );
  };
})();
