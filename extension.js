// extension.js — JetVibe
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// Importa a feature de Histórico Local de forma modular
const localHistory = require('./localHistory');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

async function openAllTTFs(dir) {
  if (!exists(dir)) {
    vscode.window.showErrorMessage(`Pasta não encontrada: ${dir}`);
    return false;
  }
  const ttfs = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.ttf'));
  if (ttfs.length === 0) {
    vscode.window.showWarningMessage(`Nenhum .ttf em ${dir}. Coloque os TTFs e rode o comando de novo.`);
    return false;
  }
  for (const f of ttfs) {
    await vscode.env.openExternal(vscode.Uri.file(path.join(dir, f)));
  }
  return true;
}

async function setConfig(pairs, target = vscode.ConfigurationTarget.Global) {
  const cfg = vscode.workspace.getConfiguration();
  for (const [key, value] of pairs) {
    await cfg.update(key, value, target);
  }
}

/* --------- Fontes --------- */
async function installJetBrainsMono(ctx) {
  const dir = ctx.asAbsolutePath(path.join('fonts', 'JetBrainsMono'));
  const ok = await openAllTTFs(dir);
  if (ok) vscode.window.showInformationMessage('JetBrains Mono: clique "Install" nas janelas e depois use "Developer: Reload Window".');
}

async function installNerdFont(ctx) {
  const dir = ctx.asAbsolutePath(path.join('fonts', 'NerdFonts', 'JetBrainsMono'));
  const ok = await openAllTTFs(dir);
  if (ok) vscode.window.showInformationMessage('JetBrainsMono Nerd Font: instalada via instalador do SO. Depois use "Developer: Reload Window".');
}

async function useNerdFontInTerminal() {
  const candidates = [
    'JetBrainsMono Nerd Font Mono',
    'JetBrainsMono Nerd Font',
    'JetBrains Mono Nerd Font Mono',
    'JetBrains Mono Nerd Font'
  ];
  await setConfig([
    ['terminal.integrated.fontFamily', candidates[0]],
    ['terminal.integrated.fontSize', 13],
    ['terminal.integrated.lineHeight', 1.1],
    ['terminal.integrated.letterSpacing', 0]
  ]);
  vscode.window.showInformationMessage(`Terminal apontado para: ${candidates[0]} (troque o nome se os ícones não aparecerem).`);
}

/* --------- P10k no WSL --------- */
function runWSL(script) {
  return new Promise((resolve, reject) => {
    const cmd = `wsl.exe -e bash -lc "${script.replace(/"/g, '\\"')}"`;
    cp.exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

async function setupP10kWSL() {
  if (!isWindows) {
    vscode.window.showWarningMessage('Setup P10k (WSL) só é suportado no Windows. Pule esse passo neste SO.');
    return;
  }

  const installScript = `
set -e
export DEBIAN_FRONTEND=noninteractive
sudo apt update
sudo apt install -y zsh git curl ca-certificates
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi
THEME_DIR="\${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"
if [ ! -d "$THEME_DIR" ]; then
  git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "$THEME_DIR"
fi
if [ -f "$HOME/.zshrc" ]; then
  if grep -q '^ZSH_THEME=' "$HOME/.zshrc"; then
    sed -i 's/^ZSH_THEME=.*/ZSH_THEME="powerlevel10k\\/powerlevel10k"/' "$HOME/.zshrc"
  else
    echo 'ZSH_THEME="powerlevel10k/powerlevel10k"' >> "$HOME/.zshrc"
  fi
  grep -q 'POWERLEVEL9K_INSTANT_PROMPT' "$HOME/.zshrc" || echo 'typeset -g POWERLEVEL9K_INSTANT_PROMPT=quiet' >> "$HOME/.zshrc"
else
  echo 'ZSH_THEME="powerlevel10k/powerlevel10k"' > "$HOME/.zshrc"
  echo 'typeset -g POWERLEVEL9K_INSTANT_PROMPT=quiet' >> "$HOME/.zshrc"
fi
if command -v chsh >/dev/null 2>&1; then chsh -s "$(command -v zsh)" || true; fi
echo "OK"
`.trim();

  try {
    await runWSL(installScript);
    vscode.window.showInformationMessage('Powerlevel10k instalado no WSL. Abra um terminal zsh e rode `p10k configure` se quiser personalizar.');
  } catch {
    const term = vscode.window.createTerminal({ name: 'JetVibe · Setup P10k (WSL)', shellPath: 'wsl.exe' });
    term.show();
    term.sendText(installScript.replace(/\n/g, ' && '));
    vscode.window.showWarningMessage('Não consegui executar via wsl.exe. Abri um terminal com o script; acompanhe a instalação.');
  }
}

/* --------- Opt-in: habilitar stubs extras do Intelephense --------- */
async function enablePhpStubsExtras() {
  const cfg = vscode.workspace.getConfiguration('intelephense');
  let stubs = cfg.get('stubs');

  // tenta capturar o default do próprio pacote do Intelephense se o usuário não personalizou
  if (!Array.isArray(stubs) || stubs.length === 0) {
    try {
      const ext = vscode.extensions.getExtension('bmewburn.vscode-intelephense-client');
      const def = ext?.packageJSON?.contributes?.configuration?.properties?.['intelephense.stubs']?.default;
      stubs = Array.isArray(def) ? def.slice() : [];
    } catch {
      stubs = [];
    }
  }

  const extras = ['wordpress', 'blackfire', 'redis', 'imagick', 'swoole']; // ajuste conforme público
  const next = Array.from(new Set([...(stubs || []), ...extras])).sort();

  await cfg.update('stubs', next, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`JetVibe: habilitei stubs extras do PHP → ${extras.join(', ')}`);
}

/* --------- activate --------- */
function activate(ctx) {
  console.log('🚀 Ativando extensão JetVibe...');

  // Comandos principais (fontes e P10k)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('jetvibe.installFont', () => installJetBrainsMono(ctx)),
    vscode.commands.registerCommand('jetvibe.installNerdFont', () => installNerdFont(ctx)),
    vscode.commands.registerCommand('jetvibe.useNerdFontInTerminal', () => useNerdFontInTerminal()),
    vscode.commands.registerCommand('jetvibe.setupP10kWSL', () => setupP10kWSL()),
    vscode.commands.registerCommand('jetvibe.enablePhpStubsExtras', () => enablePhpStubsExtras()) // ✅ novo comando
  );

  console.log('✅ Comandos principais registrados');

  // Histórico Local
  try {
    localHistory.register(ctx);
  } catch (error) {
    console.error('❌ Erro ao carregar localHistory:', error);
    vscode.window.showErrorMessage(`Erro ao carregar Histórico Local: ${error.message}`);
  }

  console.log('🎉 Extensão JetVibe ativada com sucesso');
}
function deactivate() { }
module.exports = { activate, deactivate };
