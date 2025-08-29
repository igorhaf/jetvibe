// graphView.js
const vscode = require('vscode');
const cp = require('child_process');

function run(cmd, cwd) {
    return new Promise((resolve, reject) => {
        cp.exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout);
        });
    });
}

async function fetchLog(repoPath, limit = 400) {
    const fmt = `%H%x09%an%x09%ad%x09%s`;
    const out = await run(
        `git log --date=iso --decorate=short --all --max-count=${limit} --pretty=format:"${fmt}"`,
        repoPath
    );
    return out.split('\n').filter(Boolean).map(line => {
        const [hash, author, date, subject] = line.split('\t');
        return { hash, author, date, subject };
    });
}

function esc(s = '') { return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

function registerGraphView(context, repoService) {
    const provider = {
        async resolveWebviewView(view) {
            view.webview.options = { enableScripts: true };
            const repo = repoService.getFirstRepo();
            if (!repo) {
                view.webview.html = `<html><body><p style="padding:8px">No Git repository detected.</p></body></html>`;
                return;
            }
            const commits = await fetchLog(repo.rootUri.fsPath);
            const rows = commits.map(c =>
                `<div class="row">
           <code>${esc(c.hash.slice(0, 7))}</code>
           <span class="subj">${esc(c.subject)}</span>
           <span class="meta">${esc(c.author)} • ${esc(c.date)}</span>
           <button data-sha="${esc(c.hash)}">Checkout</button>
         </div>`
            ).join('');

            view.webview.html = `
        <html>
          <head>
            <style>
              body{font:12px/1.4 -apple-system,Segoe UI,system-ui,Ubuntu,Roboto,Arial;padding:8px}
              .row{display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid #2a2a2a}
              .subj{flex:1}
              .meta{opacity:.6}
              button{font-size:11px}
            </style>
          </head>
          <body>
            <h4>Commit Graph (lite)</h4>
            ${rows}
            <script>
              const vscode = acquireVsCodeApi();
              document.body.addEventListener('click', e=>{
                if(e.target.tagName==='BUTTON'){
                  vscode.postMessage({type:'checkout', sha:e.target.dataset.sha});
                }
              });
            </script>
          </body>
        </html>`;

            view.webview.onDidReceiveMessage(async msg => {
                if (msg.type === 'checkout') {
                    try {
                        await repo.checkout(msg.sha);
                        vscode.window.showInformationMessage('Detached HEAD at ' + msg.sha.slice(0, 7));
                    } catch (e) {
                        vscode.window.showErrorMessage(e.message);
                    }
                }
            });
        }
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('jetvibeGitGraph', provider)
    );
}

module.exports = { registerGraphView };
