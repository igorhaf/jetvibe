// localHistory.js — Feature de Histórico Local (inspirada no Local History do JetBrains)
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Registra todos os comandos e funcionalidades relacionadas ao Histórico Local
 * Esta função é chamada pelo extension.js durante a ativação da extensão
 * 
 * @param {vscode.ExtensionContext} context - Contexto da extensão do VSCode
 */
// Instância global do serviço de histórico
let localHistoryService = null;

// Provedor de conteúdo para snapshots (URI scheme: jetvibe-snapshot)
/**
 * Tenta reconstruir uma URI remota correta (ex.: WSL) a partir de um fsPath do workspace.
 */
function resolveWorkspaceUriFromFsPath(filePath) {
    try {
        const folders = vscode.workspace.workspaceFolders || [];
        for (const folder of folders) {
            const baseFs = folder.uri.fsPath;
            if (filePath.startsWith(baseFs)) {
                const rel = path.relative(baseFs, filePath);
                return vscode.Uri.joinPath(folder.uri, rel);
            }
        }
    } catch {}
    // Fallback local
    return vscode.Uri.file(filePath);
}

// Provedor de conteúdo para snapshots (URI scheme: jetvibe-snapshot)
class SnapshotContentProvider {
    constructor(getter) {
        this.getter = getter; // (id) => content
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChange = this._onDidChange.event;
    }

    provideTextDocumentContent(uri) {
        const params = new URLSearchParams(uri.query || '');
        const id = params.get('id');
        const content = this.getter(id) || '';
        return content;
    }
}

/**
 * Resolve a melhor URI do arquivo alvo (lado direito do diff), suportando WSL/Remote.
 */
function getBestFileUri(filePath, snapshot) {
    try {
        if (snapshot?.fileUri) {
            return vscode.Uri.parse(snapshot.fileUri);
        }
        // Tenta encontrar um documento aberto com o mesmo fsPath (preserva scheme remoto)
        const openDoc = vscode.workspace.textDocuments.find(d => d?.uri?.fsPath === filePath);
        if (openDoc?.uri) return openDoc.uri;
        // Fallback local
        return vscode.Uri.file(filePath);
    } catch {
        return vscode.Uri.file(filePath);
    }
}

/**
 * Cria uma URI para o conteúdo de um snapshot via provider (scheme jetvibe-snapshot)
 */
function buildSnapshotUri(snapshot) {
    const labelName = snapshot.fileName.split(/[\/\\]/).pop();
    const query = new URLSearchParams({ id: snapshot.id }).toString();
    return vscode.Uri.from({ scheme: 'jetvibe-snapshot', path: `/${labelName}`, query });
}

/**
 * Abre um diff entre um snapshot e o arquivo atual
 */
async function openDiffForSnapshot(service, filePath, snapshot) {
    try {
        const left = buildSnapshotUri(snapshot);
        // Tenta usar a URI do editor ativo quando o caminho bater; senão, cria a partir do caminho
        const active = vscode.window.activeTextEditor?.document;
        let right = getBestFileUri(filePath, snapshot);
        if (active?.uri?.fsPath === filePath) {
            right = active.uri; // preferência ao editor ativo
        }
        const title = `${snapshot.fileName.split(/[\/\\]/).pop()} ⟷ Snapshot ${new Date(snapshot.timestamp).toLocaleString()}`;
        await vscode.commands.executeCommand('vscode.diff', left, right, title);
    } catch (e) {
        vscode.window.showErrorMessage(`❌ Falha ao abrir diff: ${e?.message || e}. Se o arquivo estiver numa pasta remota (ex.: WSL), abra o arquivo no editor e tente novamente para que a URI remota seja detectada.`);
    }
}

/**
 * Compara o editor ativo com o último snapshot disponível
 */
async function diffActiveEditorWithLatest(service) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('Abra um arquivo para comparar com o último snapshot.');
        return;
    }
    const filePath = editor.document.uri.fsPath;
    const snapshots = service.getFileSnapshots(filePath);
    if (!snapshots || snapshots.length === 0) {
        vscode.window.showInformationMessage('Nenhum snapshot encontrado para este arquivo.');
        return;
    }
    const latest = snapshots[0];
    await openDiffForSnapshot(service, filePath, latest);
}

function register(context) {
    console.log('🔄 Iniciando registro da feature de Histórico Local...');
    
    try {
        // Inicializa o LocalHistoryService
        localHistoryService = new LocalHistoryService(context);
        context.subscriptions.push(localHistoryService);
        
        // Registra o comando principal do Histórico Local
        const openLocalHistoryCommand = vscode.commands.registerCommand(
            'jetvibe.openLocalHistory', 
            () => openLocalHistory(localHistoryService)
        );
        
        // Registra comando para mostrar estatísticas
        const showStatsCommand = vscode.commands.registerCommand(
            'jetvibe.showLocalHistoryStats',
            () => showHistoryStats(localHistoryService)
        );
        
        // Registra comando para limpar snapshots antigos
        const cleanupCommand = vscode.commands.registerCommand(
            'jetvibe.cleanupLocalHistory',
            () => cleanupHistory(localHistoryService)
        );

        // Provedor de conteúdo para diffs de snapshots
        const provider = new SnapshotContentProvider((id) => localHistoryService?.getSnapshotById(id)?.content);
        const providerReg = vscode.workspace.registerTextDocumentContentProvider('jetvibe-snapshot', provider);

        // Comando para comparar arquivo atual com o último snapshot
        const diffWithLatest = vscode.commands.registerCommand(
            'jetvibe.diffWithLatestSnapshot',
            () => diffActiveEditorWithLatest(localHistoryService)
        );

        // TreeView: JetVibe Local History
        const treeDataProvider = new LocalHistoryTreeDataProvider(localHistoryService);
        const treeView = vscode.window.createTreeView('jetvibeLocalHistory', { treeDataProvider });
        context.subscriptions.push(treeView);

        // Comando: abrir diff entre snapshot selecionado e o snapshot anterior (mudanças introduzidas)
        const openSnapshotDiff = vscode.commands.registerCommand('jetvibe.openSnapshotDiff', async (filePath, snapshotId) => {
            try {
                const snaps = localHistoryService.getFileSnapshots(filePath);
                const idx = snaps.findIndex(s => s.id === snapshotId);
                if (idx === -1) return;
                const current = snaps[idx];
                const previous = snaps[idx + 1]; // anterior no tempo (lista é mais recente -> mais antigo)
                if (!previous) {
                    // Se não há anterior, compara com arquivo atual
                    await openDiffForSnapshot(localHistoryService, filePath, current);
                    return;
                }
                // Esquerda: anterior, Direita: atual (introduzido neste snapshot)
                const left = buildSnapshotUri(previous);
                const right = buildSnapshotUri(current);
                const title = `${current.fileName.split(/[\/\\]/).pop()} ⟷ Changes @ ${new Date(current.timestamp).toLocaleString()}`;
                await vscode.commands.executeCommand('vscode.diff', left, right, title);
            } catch (e) {
                vscode.window.showErrorMessage(`❌ Falha ao abrir diff entre snapshots: ${e?.message || e}`);
            }
        });
        
        // Adiciona comandos às subscriptions para limpeza automática
        context.subscriptions.push(
            openLocalHistoryCommand,
            showStatsCommand,
            cleanupCommand,
            providerReg,
            diffWithLatest,
            openSnapshotDiff
        );

        // Comandos de ações de pasta (rodapé)
        const folderDiffCmd = vscode.commands.registerCommand('jetvibe.diffFolderWithLocal', async (folderRel) => {
            vscode.window.showInformationMessage(`Diff with the local directory: ${folderRel || (vscode.workspace.name || './')}`);
        });
        const nextRevCmd = vscode.commands.registerCommand('jetvibe.switchToNextRevision', async () => {
            vscode.window.showInformationMessage('Switch to diff with the next revision (placeholder).');
        });
        context.subscriptions.push(folderDiffCmd, nextRevCmd);
        
        console.log('✅ Comandos do Histórico Local registrados com sucesso');
        console.log('✅ Feature de Histórico Local registrada com sucesso');
    } catch (error) {
        console.error('❌ Erro ao registrar feature de Histórico Local:', error);
        vscode.window.showErrorMessage(`Erro ao registrar Histórico Local: ${error.message}`);
    }
}

/**
 * Função principal que é executada quando o usuário chama o comando "jetvibe.openLocalHistory"
 * Por enquanto, exibe apenas uma mensagem placeholder
 * 
 * TODO: Futuramente, esta função irá:
 * 1. Verificar se há snapshots salvos para o workspace atual
 * 2. Abrir uma TreeView com o histórico de arquivos
 * 3. Permitir navegação pelos snapshots
 * 4. Abrir diffs lado a lado usando vscode.diff
 */
async function openLocalHistory(service) {
    try {
        const stats = service.getStats();
        const filesWithSnapshots = service.getFilesWithSnapshots();
        
        if (stats.totalSnapshots === 0) {
            const choice = await vscode.window.showInformationMessage(
                '📁 Histórico Local ativo! Nenhum snapshot encontrado ainda.\n\nSnapshots são criados automaticamente quando você salva arquivos.',
                'Ver Estatísticas', 'OK'
            );
            
            if (choice === 'Ver Estatísticas') {
                showHistoryStats(service);
            }
            return;
        }
        
        // Mostra resumo dos snapshots
        const choice = await vscode.window.showInformationMessage(
            `📁 Histórico Local\n\n` +
            `📊 ${stats.totalFiles} arquivos monitorados\n` +
            `📸 ${stats.totalSnapshots} snapshots salvos\n` +
            `${stats.isActive ? '✅ Ativo' : '❌ Inativo'}`,
            'Ver Arquivos', 'Estatísticas', 'Limpar Histórico'
        );
        
        if (choice === 'Ver Arquivos') {
            showFilesList(service);
        } else if (choice === 'Estatísticas') {
            showHistoryStats(service);
        } else if (choice === 'Limpar Histórico') {
            cleanupHistory(service);
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`❌ Erro no comando Local History: ${error.message}`);
        console.error('Erro em openLocalHistory:', error);
    }
}

/**
 * Mostra estatísticas detalhadas do histórico
 */
async function showHistoryStats(service) {
    try {
        const stats = service.getStats();
        const filesWithSnapshots = service.getFilesWithSnapshots();
        
        let message = `📊 Estatísticas do Histórico Local\n\n`;
        message += `📁 Arquivos monitorados: ${stats.totalFiles}\n`;
        message += `📸 Total de snapshots: ${stats.totalSnapshots}\n`;
        message += `${stats.isActive ? '✅ Status: Ativo' : '❌ Status: Inativo'}\n\n`;
        
        if (filesWithSnapshots.length > 0) {
            message += `📋 Arquivos com snapshots:\n`;
            filesWithSnapshots.slice(0, 5).forEach(filePath => {
                const fileName = filePath.split(/[/\\]/).pop();
                const snapshotCount = service.getFileSnapshots(filePath).length;
                message += `• ${fileName} (${snapshotCount} snapshots)\n`;
            });
            
            if (filesWithSnapshots.length > 5) {
                message += `... e mais ${filesWithSnapshots.length - 5} arquivos`;
            }
        }
        
        await vscode.window.showInformationMessage(message, 'OK');
        
    } catch (error) {
        vscode.window.showErrorMessage(`❌ Erro ao mostrar estatísticas: ${error.message}`);
    }
}

/**
 * Mostra lista de arquivos com snapshots
 */
async function showFilesList(service) {
    try {
        const filesWithSnapshots = service.getFilesWithSnapshots();
        
        if (filesWithSnapshots.length === 0) {
            vscode.window.showInformationMessage('📁 Nenhum arquivo com snapshots encontrado.');
            return;
        }
        
        // Cria lista de itens para o QuickPick
        const items = filesWithSnapshots.map(filePath => {
            const fileName = filePath.split(/[/\\]/).pop();
            const snapshots = service.getFileSnapshots(filePath);
            const lastSnapshot = snapshots[0];
            const lastModified = lastSnapshot ? new Date(lastSnapshot.timestamp).toLocaleString() : 'N/A';
            
            return {
                label: fileName,
                description: `${snapshots.length} snapshots`,
                detail: `Último: ${lastModified}`,
                filePath: filePath
            };
        });
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Selecione um arquivo para ver seu histórico'
        });
        
        if (selected) {
            showFileHistory(service, selected.filePath);
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`❌ Erro ao mostrar lista de arquivos: ${error.message}`);
    }
}

/**
 * Mostra histórico de um arquivo específico
 */
async function showFileHistory(service, filePath) {
    try {
        const snapshots = service.getFileSnapshots(filePath);
        const fileName = filePath.split(/[/\\]/).pop();
        
        if (snapshots.length === 0) {
            vscode.window.showInformationMessage(`📁 Nenhum snapshot encontrado para ${fileName}`);
            return;
        }
        
        // Cria lista de snapshots para o QuickPick
        const items = snapshots.map((snapshot, index) => {
            const date = new Date(snapshot.timestamp);
            const timeAgo = getTimeAgo(date);
            
            return {
                label: `📸 ${date.toLocaleString()}`,
                description: `${snapshot.type} • ${timeAgo}`,
                detail: `${snapshot.size} bytes • ${snapshot.lineCount} linhas`,
                snapshot: snapshot
            };
        });
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Histórico de ${fileName} (${snapshots.length} snapshots)`
        });
        
        if (selected) {
            await openDiffForSnapshot(service, filePath, selected.snapshot);
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`❌ Erro ao mostrar histórico do arquivo: ${error.message}`);
    }
}

/**
 * Limpa snapshots antigos
 */
async function cleanupHistory(service) {
    try {
        const choice = await vscode.window.showWarningMessage(
            '🧹 Limpar Histórico Local\n\nEsta ação removerá snapshots antigos. Deseja continuar?',
            'Limpar (30 dias)', 'Limpar (7 dias)', 'Cancelar'
        );
        
        if (choice === 'Cancelar' || !choice) {
            return;
        }
        
        const daysToKeep = choice.includes('30') ? 30 : 7;
        const removedCount = service.cleanupOldSnapshots(daysToKeep);
        
        vscode.window.showInformationMessage(
            `🧹 Limpeza concluída!\n\n${removedCount} snapshots antigos foram removidos.`
        );
        
    } catch (error) {
        vscode.window.showErrorMessage(`❌ Erro ao limpar histórico: ${error.message}`);
    }
}

/**
 * Calcula tempo decorrido desde uma data
 */
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'agora mesmo';
    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    return `${diffDays}d atrás`;
}

/**
 * LocalHistoryService - Serviço principal para gerenciamento de histórico local
 * Responsável por monitorar mudanças e criar snapshots automáticos
 */
class LocalHistoryService {
    constructor(context) {
        this.context = context;
        this.snapshots = new Map(); // filePath -> Array<Snapshot>
        const cfg = vscode.workspace.getConfiguration('jetvibe.localHistory');
        this.maxSnapshotsPerFile = cfg.get('maxSnapshotsPerFile', 50);
        this.isActive = cfg.get('enabled', true);
        this.includeGlobs = cfg.get('includeGlobs', ['**/*']);
        this.excludeGlobs = cfg.get('excludeGlobs', ['**/.git/**', '**/node_modules/**', '**/*.log']);

        // Diretórios de armazenamento (persistência)
        this.storageRoot = context.globalStorageUri?.fsPath || context.storageUri?.fsPath;
        this.snapshotsDir = this.storageRoot ? path.join(this.storageRoot, 'localHistory', 'snapshots') : null;

        // Inicializa o monitoramento
        this.initializeStorage();
        this.loadPersistedSnapshots();
        this.initializeWatchers();
        
        console.log('📁 LocalHistoryService inicializado');

        // Evento para consumidores (ex.: TreeDataProvider)
        this._onDidChangeSnapshots = new vscode.EventEmitter();
        this.onDidChangeSnapshots = this._onDidChangeSnapshots.event;
    }
    
    /**
     * Configura os watchers para monitorar mudanças em arquivos
     */
    initializeWatchers() {
        console.log('🔍 Inicializando watchers do LocalHistoryService...');
        
        // Monitora salvamento de arquivos
        const saveWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
            console.log('💾 Arquivo salvo detectado:', document.fileName);
            this.createSnapshot(document);
        });
        
        // Monitora abertura de arquivos (para snapshot inicial)
        const openWatcher = vscode.workspace.onDidOpenTextDocument((document) => {
            console.log('📂 Arquivo aberto detectado:', document.fileName);
            // Só cria snapshot se for um arquivo do workspace
            if (this.isWorkspaceFile(document)) {
                this.createSnapshot(document, 'opened');
            }
        });
        
        // Adiciona watchers às subscriptions para limpeza automática
        this.context.subscriptions.push(saveWatcher, openWatcher);
        console.log('✅ Watchers configurados com sucesso');

        // Reagir a mudanças de configuração
        const cfgWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('jetvibe.localHistory')) {
                const cfg = vscode.workspace.getConfiguration('jetvibe.localHistory');
                this.isActive = cfg.get('enabled', true);
                this.maxSnapshotsPerFile = cfg.get('maxSnapshotsPerFile', 50);
                this.includeGlobs = cfg.get('includeGlobs', ['**/*']);
                this.excludeGlobs = cfg.get('excludeGlobs', ['**/.git/**', '**/node_modules/**', '**/*.log']);
                console.log('⚙️ Configuração do Histórico Local atualizada');
            }
        });
        this.context.subscriptions.push(cfgWatcher);
    }
    
    /**
     * Verifica se o documento pertence ao workspace atual
     */
    isWorkspaceFile(document) {
        try {
            const uri = document.uri;
            if (!uri) {
                console.log('❌ Documento sem URI');
                return false;
            }

            // Ignora documentos que não são arquivos editáveis/salváveis
            const ignoreSchemes = new Set(['untitled', 'git', 'output', 'vscode-userdata']);
            if (ignoreSchemes.has(uri.scheme)) {
                console.log('❌ Ignorando documento com scheme:', uri.scheme);
                return false;
            }

            // Suporta tanto arquivos locais (scheme: file) quanto remotos (ex.: vscode-remote)
            const folder = vscode.workspace.getWorkspaceFolder(uri);
            const inWorkspace = !!folder;

            console.log(`📁 Verificando arquivo: [scheme=${uri.scheme}] ${uri.fsPath} - É do workspace: ${inWorkspace}`);
            return inWorkspace;
        } catch (e) {
            console.log('❌ Erro ao verificar workspace do documento:', e);
            return false;
        }
    }
    
    /**
     * Cria um snapshot do documento atual
     */
    createSnapshot(document, type = 'saved') {
        try {
            if (!this.isActive || !this.isWorkspaceFile(document) || !this.passesFilters(document.uri.fsPath)) {
                return;
            }
            
            const filePath = document.uri.fsPath;
            const content = document.getText();
            
            // Cria o snapshot
            const snapshot = {
                id: this.generateSnapshotId(),
                filePath: filePath,
                fileName: document.fileName,
                fileUri: document.uri.toString(),
                content: content,
                timestamp: new Date().toISOString(),
                type: type, // 'saved', 'opened', 'manual'
                size: content.length,
                lineCount: document.lineCount
            };
            
            // Adiciona à lista de snapshots do arquivo
            if (!this.snapshots.has(filePath)) {
                this.snapshots.set(filePath, []);
            }
            
            const fileSnapshots = this.snapshots.get(filePath);
            fileSnapshots.unshift(snapshot); // Adiciona no início (mais recente primeiro)
            
            // Limita o número de snapshots por arquivo
            if (fileSnapshots.length > this.maxSnapshotsPerFile) {
                fileSnapshots.splice(this.maxSnapshotsPerFile);
            }
            
            console.log(`📸 Snapshot criado para ${document.fileName} (${type})`);

            // Persistir snapshot em disco
            this.persistSnapshot(snapshot);

            // Notificar listeners
            this._onDidChangeSnapshots.fire();

        } catch (error) {
            console.error('❌ Erro ao criar snapshot:', error);
        }
    }

    /**
     * Cria diretórios necessários para persistência
     */
    initializeStorage() {
        try {
            if (!this.snapshotsDir) return;
            fs.mkdirSync(this.snapshotsDir, { recursive: true });
            console.log('💾 Pasta de snapshots:', this.snapshotsDir);
        } catch (e) {
            console.warn('⚠️ Não foi possível inicializar armazenamento do histórico:', e?.message || e);
        }
    }

    /**
     * Carrega snapshots persistidos do disco
     */
    loadPersistedSnapshots() {
        try {
            if (!this.snapshotsDir || !fs.existsSync(this.snapshotsDir)) return;
            const files = fs.readdirSync(this.snapshotsDir).filter(f => f.endsWith('.json'));
            for (const f of files) {
                const full = path.join(this.snapshotsDir, f);
                try {
                    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
                    if (Array.isArray(data) && data.length) {
                        const filePath = data[0].filePath;
                        // Migração: garante fileUri para snapshots antigos
                        for (const s of data) {
                            if (!s.fileUri) {
                                const uri = resolveWorkspaceUriFromFsPath(s.filePath);
                                s.fileUri = uri.toString();
                            }
                        }
                        this.snapshots.set(filePath, data);
                    }
                } catch (e) {
                    console.warn('⚠️ Erro lendo snapshot file:', f, e?.message || e);
                }
            }
            console.log(`💾 Snapshots carregados: ${this.snapshots.size} arquivos`);
            // Notifica consumidores (TreeView) após carga/migração
            try { this._onDidChangeSnapshots?.fire?.(); } catch {}
        } catch (e) {
            console.warn('⚠️ Falha ao carregar snapshots persistidos:', e?.message || e);
        }
    }

    /**
     * Persiste os snapshots de um determinado arquivo em disco
     */
    persistSnapshot(snapshot) {
        try {
            if (!this.snapshotsDir) return;
            const key = this.safeKeyFromPath(snapshot.filePath);
            const file = path.join(this.snapshotsDir, `${key}.json`);
            const arr = this.snapshots.get(snapshot.filePath) || [snapshot];
            fs.writeFileSync(file, JSON.stringify(arr, null, 2), 'utf8');
        } catch (e) {
            console.warn('⚠️ Não foi possível persistir snapshot:', e?.message || e);
        }
    }

    /**
     * Remove do disco os snapshots apagados por limpeza
     */
    removePersistedIfEmpty(filePath) {
        try {
            if (!this.snapshotsDir) return;
            const key = this.safeKeyFromPath(filePath);
            const file = path.join(this.snapshotsDir, `${key}.json`);
            if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch (e) {
            console.warn('⚠️ Não foi possível remover snapshot persistido:', e?.message || e);
        }
    }

    /**
     * Converte caminho de arquivo para uma chave de arquivo segura
     */
    safeKeyFromPath(p) {
        const authority = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(p))?.uri?.authority || '';
        return (authority + '_' + p).replace(/[\/:*?"<>|]+/g, '_');
    }

    /**
     * Aplica filtros include/exclude simples por substring
     */
    passesFilters(fsPath) {
        // Excludes: se qualquer padrão (substring) ocorrer, rejeita
        if (Array.isArray(this.excludeGlobs)) {
            for (const pat of this.excludeGlobs) {
                if (typeof pat === 'string' && pat !== '' && fsPath.includes(pat.replace(/\*\*\//g, ''))) {
                    return false;
                }
            }
        }
        // Includes: se vazia, aceita; se houver, aceita se qualquer ocorrer
        if (Array.isArray(this.includeGlobs) && this.includeGlobs.length > 0) {
            for (const pat of this.includeGlobs) {
                if (typeof pat === 'string' && pat === '**/*') return true;
                if (typeof pat === 'string' && pat !== '' && fsPath.includes(pat.replace(/\*\*\//g, ''))) {
                    return true;
                }
            }
            return false;
        }
        return true;
    }
    
    /**
     * Gera um ID único para o snapshot
     */
    generateSnapshotId() {
        return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Retorna todos os snapshots de um arquivo
     */
    getFileSnapshots(filePath) {
        return this.snapshots.get(filePath) || [];
    }
    
    /**
     * Retorna todos os arquivos com snapshots
     */
    getFilesWithSnapshots() {
        return Array.from(this.snapshots.keys());
    }
    
    /**
     * Retorna estatísticas do histórico
     */
    getStats() {
        let totalSnapshots = 0;
        let totalFiles = this.snapshots.size;
        
        for (const fileSnapshots of this.snapshots.values()) {
            totalSnapshots += fileSnapshots.length;
        }
        
        return {
            totalFiles,
            totalSnapshots,
            isActive: this.isActive
        };
    }
    
    /**
     * Retorna um snapshot pelo id
     */
    getSnapshotById(id) {
        for (const arr of this.snapshots.values()) {
            const found = arr.find(s => s.id === id);
            if (found) return found;
        }
        return undefined;
    }
    
    /**
     * Limpa snapshots antigos (política de retenção)
     */
    cleanupOldSnapshots(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        let removedCount = 0;
        
        for (const [filePath, fileSnapshots] of this.snapshots.entries()) {
            const filteredSnapshots = fileSnapshots.filter(snapshot => {
                const snapshotDate = new Date(snapshot.timestamp);
                return snapshotDate > cutoffDate;
            });
            
            removedCount += fileSnapshots.length - filteredSnapshots.length;
            this.snapshots.set(filePath, filteredSnapshots);
            
            // Remove entrada se não há mais snapshots
            if (filteredSnapshots.length === 0) {
                this.snapshots.delete(filePath);
                this.removePersistedIfEmpty(filePath);
            } else {
                // Atualiza persistência do arquivo
                try {
                    if (this.snapshotsDir) {
                        const key = this.safeKeyFromPath(filePath);
                        const file = path.join(this.snapshotsDir, `${key}.json`);
                        fs.writeFileSync(file, JSON.stringify(filteredSnapshots, null, 2), 'utf8');
                    }
                } catch (e) {
                    console.warn('⚠️ Falha ao atualizar persistência durante limpeza:', e?.message || e);
                }
            }
        }
        
        console.log(`🧹 Limpeza concluída: ${removedCount} snapshots removidos`);
        // Notificar listeners
        this._onDidChangeSnapshots.fire();
        return removedCount;
    }
    
    /**
     * Ativa/desativa o serviço
     */
    setActive(active) {
        this.isActive = active;
        console.log(`📁 LocalHistoryService ${active ? 'ativado' : 'desativado'}`);
    }
    
    /**
     * Dispose - limpa recursos
     */
    dispose() {
        this.snapshots.clear();
        console.log('📁 LocalHistoryService finalizado');
    }
}

/**
 * TreeDataProvider para exibir arquivos e snapshots
 */
class LocalHistoryTreeDataProvider {
    constructor(service) {
        this.service = service;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        if (this.service?.onDidChangeSnapshots) {
            this._sub = this.service.onDidChangeSnapshots(() => this.refresh());
        }
    }
    dispose() { this._sub?.dispose?.(); }
    refresh() { this._onDidChangeTreeData.fire(undefined); }
    getTreeItem(element) { return element; }
    async getChildren(element) {
        const files = this.service.getFilesWithSnapshots();
        if (!element) {
            // Topo: seção Timeline + pastas do workspace (e bucket ./)
            const items = [];
            items.push(this.makeTimelineRoot());
            const roots = this.computeImmediateFolders(files, '');
            const folderItems = roots.map(folderRel => this.makeFolderItem(folderRel, this.countFilesUnder(files, folderRel)));
            const rootDirectFiles = this.listDirectFiles(files, '');
            if (rootDirectFiles.length > 0) {
                folderItems.unshift(this.makeFolderItem('', rootDirectFiles.length));
            }
            items.push(...folderItems);
            return items;
        }
        if (element.contextValue === 'jetvibe-lh-timeline-root') {
            const recent = this.getRecentSnapshots(files, 50);
            return recent.map(({ filePath, snapshot }) => this.makeTimelineItem(filePath, snapshot));
        }
        if (element.contextValue === 'jetvibe-lh-timeline-item') {
            // Render a small list of modified files for this timeline entry
            const entries = element.timelineEntries || [];
            return entries.map(e => this.makeTimelineFileItem(e.filePath, e.snapshotId));
        }
        if (element.contextValue === 'jetvibe-lh-folder') {
            const folderRel = element.folderRel; // string relativa ('' para raiz, ou 'src', 'src/components', ...)
            const subfolders = this.computeImmediateFolders(files, folderRel);
            const items = subfolders.map(sf => this.makeFolderItem(sf, this.countFilesUnder(files, sf)));
            // Arquivos diretamente dentro desta pasta
            const directFiles = this.listDirectFiles(files, folderRel);
            items.push(...directFiles.map(fp => this.makeFileItem(fp)));
            // Rodapé com ações
            items.push(this.makeFolderActionItem('Diff with the local directory.', 'jetvibe.diffFolderWithLocal', folderRel));
            items.push(this.makeFolderActionItem('Switch to diff with the next revision', 'jetvibe.switchToNextRevision'));
            return items;
        }
        if (element.contextValue === 'jetvibe-lh-file') {
            const snaps = this.service.getFileSnapshots(element.filePath);
            return snaps.map(s => this.makeSnapshotItem(element.filePath, s));
        }
        return [];
    }
    // Helpers para árvore hierárquica
    toRel(filePath) {
        try {
            const uri = resolveWorkspaceUriFromFsPath(filePath);
            const rel = vscode.workspace.asRelativePath(uri, false);
            return rel.replace(/\\/g, '/');
        } catch {
            return filePath.split(/^[^:]*:\\?/).pop().replace(/\\/g, '/');
        }
    }
    // Retorna subpastas imediatas sob folderRel
    computeImmediateFolders(files, folderRel) {
        const set = new Set();
        const base = folderRel ? folderRel + '/' : '';
        for (const f of files) {
            const rel = this.toRel(f);
            if (!rel.startsWith(base)) continue;
            const rest = rel.substring(base.length);
            const idx = rest.indexOf('/');
            if (idx > 0) {
                set.add(base + rest.substring(0, idx));
            }
        }
        // Ordenação alfabética, pastas raiz primeiro (exibe '.' como nome para raiz?)
        return Array.from(set).sort();
    }
    // Lista arquivos diretamente dentro de folderRel (sem subpastas)
    listDirectFiles(files, folderRel) {
        const base = folderRel ? folderRel + '/' : '';
        return files.filter(f => {
            const rel = this.toRel(f);
            if (!rel.startsWith(base)) return false;
            return !rel.substring(base.length).includes('/');
        }).sort();
    }
    // Conta arquivos (recursivo) dentro de folderRel
    countFilesUnder(files, folderRel) {
        const base = folderRel ? folderRel + '/' : '';
        let count = 0;
        for (const f of files) {
            const rel = this.toRel(f);
            if (rel === folderRel || rel.startsWith(base)) count++;
        }
        return count;
    }
    makeFolderItem(folderRel, filesCount) {
        const workspaceName = vscode.workspace.name || './';
        const name = folderRel ? folderRel : workspaceName;
        const item = new vscode.TreeItem(' ', vscode.TreeItemCollapsibleState.Collapsed);
        item.description = `${name}   ${filesCount} files`;
        item.contextValue = 'jetvibe-lh-folder';
        item.iconPath = new vscode.ThemeIcon('folder');
        item.folderRel = folderRel;
        item.tooltip = name;
        return item;
    }
    makeFileItem(filePath) {
        const base = filePath.split(/[/\\]/).pop();
        const count = this.service.getFileSnapshots(filePath)?.length ?? 0;
        const item = new vscode.TreeItem(' ', vscode.TreeItemCollapsibleState.Collapsed);
        item.description = count > 0 ? `${base}   ${count} snapshots` : base;
        item.tooltip = filePath;
        item.contextValue = 'jetvibe-lh-file';
        // Usa resourceUri para ícones baseados na linguagem/tema
        try { item.resourceUri = resolveWorkspaceUriFromFsPath(filePath); } catch {}
        item.iconPath = new vscode.ThemeIcon('file');
        item.filePath = filePath;
        return item;
    }
    makeSnapshotItem(filePath, snapshot) {
        const date = new Date(snapshot.timestamp);
        const fmt = this.formatDate(date);
        const labelMain = `${fmt} (${snapshot.type})`;
        const item = new vscode.TreeItem(' ', vscode.TreeItemCollapsibleState.None);
        item.description = `${labelMain}   ${snapshot.size} B • ${snapshot.lineCount} ln`;
        item.tooltip = `${filePath}\n${labelMain}`;
        item.contextValue = 'jetvibe-lh-snapshot';
        item.iconPath = new vscode.ThemeIcon('history');
        // Abrir diff contra snapshot anterior ao clicar
        item.command = {
            command: 'jetvibe.openSnapshotDiff',
            title: 'Diff Snapshot with Previous',
            arguments: [filePath, snapshot.id]
        };
        return item;
    }
    makeTimelineRoot() {
        const item = new vscode.TreeItem('Timeline', vscode.TreeItemCollapsibleState.Expanded);
        item.contextValue = 'jetvibe-lh-timeline-root';
        item.iconPath = new vscode.ThemeIcon('history');
        return item;
    }
    getRecentSnapshots(files, limit = 50) {
        const entries = [];
        for (const fp of files) {
            const snaps = this.service.getFileSnapshots(fp);
            for (const s of snaps) entries.push({ filePath: fp, snapshot: s });
        }
        entries.sort((a, b) => new Date(b.snapshot.timestamp) - new Date(a.snapshot.timestamp));
        return entries.slice(0, limit);
    }
    makeTimelineItem(filePath, snapshot) {
        const fileName = filePath.split(/[/\\]/).pop();
        const verb = this.mapTypeToVerb(snapshot.type);
        const left = `${verb} ${fileName}`;
        const item = new vscode.TreeItem(' ', vscode.TreeItemCollapsibleState.Collapsed);
        const date = new Date(snapshot.timestamp);
        const fmt = this.formatDate(date);
        item.description = `${left}   ${fmt}`;
        item.tooltip = `${filePath}\n${left} — ${fmt}`;
        item.iconPath = new vscode.ThemeIcon(this.iconForType(snapshot.type));
        item.contextValue = 'jetvibe-lh-timeline-item';
        // Store timeline entries (future-proof for multiple files per change). For now, single file.
        item.timelineEntries = [{ filePath, snapshotId: snapshot.id }];
        return item;
    }
    makeTimelineFileItem(filePath, snapshotId) {
        const base = filePath.split(/[/\\]/).pop();
        const item = new vscode.TreeItem(' ', vscode.TreeItemCollapsibleState.None);
        item.description = base;
        item.tooltip = filePath;
        item.contextValue = 'jetvibe-lh-timeline-file';
        try { item.resourceUri = resolveWorkspaceUriFromFsPath(filePath); } catch {}
        item.iconPath = new vscode.ThemeIcon('file');
        item.command = {
            command: 'jetvibe.openSnapshotDiff',
            title: 'Open Diff',
            arguments: [filePath, snapshotId]
        };
        return item;
    }
    makeFolderActionItem(label, command, folderRel) {
        const item = new vscode.TreeItem(' ', vscode.TreeItemCollapsibleState.None);
        item.description = label;
        item.contextValue = 'jetvibe-lh-folder-action';
        item.iconPath = new vscode.ThemeIcon('chevron-right');
        item.command = {
            command,
            title: label,
            arguments: typeof folderRel !== 'undefined' ? [folderRel] : []
        };
        return item;
    }
    formatDate(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    mapTypeToVerb(type) {
        if (type === 'saved') return 'Modify';
        if (type === 'opened') return 'Create';
        if (type === 'external') return 'External change';
        return 'Change';
    }
    iconForType(type) {
        if (type === 'saved') return 'edit';
        if (type === 'opened') return 'add';
        if (type === 'external') return 'warning';
        return 'history';
    }
}

/**
 * TODO: LocalHistoryTreeDataProvider
 * Responsável por:
 * - Implementar vscode.TreeDataProvider para exibir histórico
 * - Organizar snapshots por arquivo e data
 * - Permitir navegação hierárquica (workspace > arquivo > snapshots)
 * - Fornecer ações de contexto (comparar, restaurar, deletar)
 */

/**
 * TODO: SnapshotManager
 * Responsável por:
 * - Criar e gerenciar snapshots individuais
 * - Calcular diffs entre versões
 * - Comprimir conteúdo para otimizar espaço
 * - Metadados (timestamp, tamanho, hash, etc.)
 */

/**
 * TODO: DiffViewer
 * Responsável por:
 * - Abrir comparações lado a lado usando vscode.diff
 * - Destacar mudanças entre versões
 * - Permitir navegação entre diferenças
 * - Ações de merge/restore seletivo
 */

// Exporta a função register para ser usada pelo extension.js
module.exports = {
    register
};
