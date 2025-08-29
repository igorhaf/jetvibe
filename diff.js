// diff.js
const vscode = require('vscode');
const path = require('path');

async function openDiff(repo, fsPath, shaA, shaB) {
    const rel = path.relative(repo.rootUri.fsPath, fsPath).replace(/\\/g, '/');
    const left = vscode.Uri.file(fsPath).with({ scheme: 'git', query: JSON.stringify({ path: rel, ref: shaA }) });
    const right = vscode.Uri.file(fsPath).with({ scheme: 'git', query: JSON.stringify({ path: rel, ref: shaB }) });
    const title = `${shaA.slice(0, 7)} ↔ ${shaB.slice(0, 7)} — ${rel}`;
    await vscode.commands.executeCommand('vscode.diff', left, right, title);
}

module.exports = { openDiff };
