const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

async function openAllTTFs(dir) {
  if (!fs.existsSync(dir)) {
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

async function useNerdFontInTerminal() {
  const cfg = vscode.workspace.getConfiguration();
  // tente nomes mais comuns; o usuário pode ter instalado "Mono" ou não
  const candidates = [
    'JetBrainsMono Nerd Font Mono',
    'JetBrainsMono Nerd Font',
    'JetBrains Mono Nerd Font Mono',
    'JetBrains Mono Nerd Font'
  ];
  // seta o preferido; se o primeiro não existir no SO, o VS Code cai no fallback
  await cfg.update('terminal.integrated.fontFamily', candidates[0], vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Terminal apontado para: ${candidates[0]} (se não renderizar ícones, tente outro nome nas Configurações).`);
}

function runWSL(script) {
  return new Promise((resolve, reject) => {
    // executa no WSL (requer WSL instalado)
    const cmd = `wsl.exe -e bash -lc "${script.replace(/"/g, '\\"')}"`;
    cp.exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

async function setupP10kWSL() {
  const installScript = `
    set -e
    export DEBIAN_FRONTEND=noninteractive
    sudo apt update
    sudo apt install -y zsh git curl ca-certificates
    # oh-my-zsh (sem abrir shell no final)
    if [ ! -d "$HOME/.oh-my-zsh" ]; then
      RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
    fi
    # powerlevel10k
    THEME_DIR="\${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"
    if [ ! -d "$THEME_DIR" ]; then
      git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "$THEME_DIR"
    fi
    # zshrc: ativa tema e otimizações
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
    # tenta definir zsh como shell padrão (pode pedir senha; se falhar, segue)
    if command -v chsh >/dev/null 2>&1; then chsh -s "$(command -v zsh)" || true; fi
    echo "OK"
  `.trim();

  try {
    const out = await runWSL(installScript);
    vscode.window.showInformationMessage('Powerlevel10k instalado no WSL. Abra um terminal zsh e rode `p10k configure` se quiser ajustar o prompt.');
  } catch (e) {
    // fallback: abre terminal integrado no WSL com as instruções prontas
    const term = vscode.window.createTerminal({ name: 'JetVibe · Setup P10k (WSL)', shellPath: 'wsl.exe' });
    term.show();
    term.sendText(installScript.replace(/\n/g, ' && '));
    vscode.window.showWarningMessage('Não consegui rodar via wsl.exe. Abri um terminal com o script; aguarde a instalação terminar.');
  }
}

function activate(ctx) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('jetvibe.installNerdFont', async () => {
      const dir = ctx.asAbsolutePath(path.join('fonts','NerdFonts','JetBrainsMono'));
      const ok = await openAllTTFs(dir);
      if (ok) vscode.window.showInformationMessage('Arquivos da JetBrainsMono Nerd Font abertos. Clique "Install" e depois: Developer: Reload Window.');
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('jetvibe.useNerdFontInTerminal', useNerdFontInTerminal)
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('jetvibe.setupP10kWSL', setupP10kWSL)
  );
}

function deactivate() {}
module.exports = { activate, deactivate };
