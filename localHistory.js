// localHistory.js — Feature de Histórico Local (inspirada no Local History do JetBrains)
const vscode = require('vscode');

/**
 * Registra todos os comandos e funcionalidades relacionadas ao Histórico Local
 * Esta função é chamada pelo extension.js durante a ativação da extensão
 * 
 * @param {vscode.ExtensionContext} context - Contexto da extensão do VSCode
 */
// Instância global do serviço de histórico
let localHistoryService = null;

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
        
        // Adiciona comandos às subscriptions para limpeza automática
        context.subscriptions.push(
            openLocalHistoryCommand,
            showStatsCommand,
            cleanupCommand
        );
        
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
            // TODO: Implementar visualização/comparação do snapshot
            vscode.window.showInformationMessage(
                `📸 Snapshot selecionado:\n${selected.snapshot.timestamp}\n\nEm breve: visualização e comparação de snapshots`
            );
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
        this.maxSnapshotsPerFile = 50;
        this.isActive = true;
        
        // Inicializa o monitoramento
        this.initializeWatchers();
        
        console.log('📁 LocalHistoryService inicializado');
    }
    
    /**
     * Configura os watchers para monitorar mudanças em arquivos
     */
    initializeWatchers() {
        // Monitora salvamento de arquivos
        const saveWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
            this.createSnapshot(document);
        });
        
        // Monitora abertura de arquivos (para snapshot inicial)
        const openWatcher = vscode.workspace.onDidOpenTextDocument((document) => {
            // Só cria snapshot se for um arquivo do workspace
            if (this.isWorkspaceFile(document)) {
                this.createSnapshot(document, 'opened');
            }
        });
        
        // Adiciona watchers às subscriptions para limpeza automática
        this.context.subscriptions.push(saveWatcher, openWatcher);
    }
    
    /**
     * Verifica se o documento pertence ao workspace atual
     */
    isWorkspaceFile(document) {
        if (!document.uri || document.uri.scheme !== 'file') {
            return false;
        }
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return false;
        }
        
        return workspaceFolders.some(folder => 
            document.uri.fsPath.startsWith(folder.uri.fsPath)
        );
    }
    
    /**
     * Cria um snapshot do documento atual
     */
    createSnapshot(document, type = 'saved') {
        try {
            if (!this.isActive || !this.isWorkspaceFile(document)) {
                return;
            }
            
            const filePath = document.uri.fsPath;
            const content = document.getText();
            
            // Cria o snapshot
            const snapshot = {
                id: this.generateSnapshotId(),
                filePath: filePath,
                fileName: document.fileName,
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
            
            // TODO: Persistir snapshot em disco
            // this.persistSnapshot(snapshot);
            
        } catch (error) {
            console.error('❌ Erro ao criar snapshot:', error);
        }
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
            }
        }
        
        console.log(`🧹 Limpeza concluída: ${removedCount} snapshots removidos`);
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
