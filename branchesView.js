// branchesView.js
const vscode = require('vscode');

class BranchesProvider {
    constructor(repoService) {
        this.repoService = repoService;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() { this._onDidChangeTreeData.fire(); }

    getTreeItem(item) { return item; }

    async getChildren() {
        const repo = this.repoService.getFirstRepo();
        if (!repo) return [];
        const headName = repo.state.HEAD?.name;
        const locals = repo.state.refs.filter(r => r.type === 0); // 0 = branch local

        return locals.map(ref => {
            const item = new vscode.TreeItem(
                ref.name,
                vscode.TreeItemCollapsibleState.None
            );
            item.description = ref.name === headName ? 'current' : '';
            item.command = {
                command: 'jetvibe.git.checkoutBranch',
                title: 'Checkout',
                arguments: [ref.name]
            };
            item.contextValue = 'branch';
            return item;
        });
    }
}

function registerBranchesView(context, repoService) {
    const provider = new BranchesProvider(repoService);
    const view = vscode.window.createTreeView('jetvibeGitBranches', {
        treeDataProvider: provider
    });

    context.subscriptions.push(
        view,
        vscode.commands.registerCommand('jetvibe.git.refreshBranches', () => provider.refresh()),
        vscode.commands.registerCommand('jetvibe.git.checkoutBranch', async (name) => {
            if (!this.repoService.api) {
                return [new vscode.TreeItem('Git API not available (enable built-in Git).')];
            }
            const repo = this.repoService.getFirstRepo();
            if (!repo) return;
            try {
                await repo.checkout(name);
                provider.refresh();
                vscode.window.showInformationMessage(`Switched to ${name}`);
            } catch (e) {
                vscode.window.showErrorMessage(`Checkout failed: ${e.message}`);
            }
        })
    );
}

module.exports = { registerBranchesView };
