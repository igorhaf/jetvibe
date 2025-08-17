const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(ctx) {
  const cmd = vscode.commands.registerCommand('jetvibe.installFont', async () => {
    const dir = ctx.asAbsolutePath(path.join('fonts', 'JetBrainsMono'));
    if (!fs.existsSync(dir)) {
      vscode.window.showErrorMessage('Pasta fonts/JetBrainsMono não encontrada na extensão.');
      return;
    }
    const ttfs = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.ttf'));
    if (ttfs.length === 0) {
      vscode.window.showErrorMessage('Nenhum arquivo .ttf encontrado em fonts/JetBrainsMono.');
      return;
    }
    // Abre cada TTF no visualizador do SO — o usuário só clica "Install".
    for (const f of ttfs) {
      await vscode.env.openExternal(vscode.Uri.file(path.join(dir, f)));
    }
    vscode.window.showInformationMessage('Arquivos da JetBrains Mono abertos. Clique "Install" em cada janela e depois: Developer: Reload Window.');
  });
  ctx.subscriptions.push(cmd);
}
function deactivate() {}
module.exports = { activate, deactivate };
