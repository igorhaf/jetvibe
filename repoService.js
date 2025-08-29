// repoService.js
const { getGitApi } = require('./gitApi');

class RepoService {
    constructor() {
        this.api = null;
        this.repos = [];
        this.disposables = [];
    }

    async init() {
        this.api = await getGitApi();
        if (!this.api) {          // << sem API, segue leve
            this.repos = [];
            return;
        }
        this.repos = this.api.repositories;

        this.disposables.push(
            this.api.onDidOpenRepository(repo => this.repos.push(repo)),
            this.api.onDidCloseRepository(repo => {
                this.repos = this.repos.filter(r => r !== repo);
            })
        );

        // (opcional) escutar mudanças de estado por repo
        this.repos.forEach(repo => {
            this.disposables.push(repo.state.onDidChange(() => {
                // tu pode notificar views aqui se quiser
            }));
        });
    }

    getFirstRepo() { return this.repos[0]; }

    dispose() { this.disposables.forEach(d => d.dispose()); }
}

module.exports = { RepoService };
