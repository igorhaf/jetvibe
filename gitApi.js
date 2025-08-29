// gitApi.js
const vscode = require('vscode');

async function getGitApi() {
    const ext = vscode.extensions.getExtension('vscode.git');
    if (!ext) return null;
    if (!ext.isActive) await ext.activate();
    return ext.exports.getAPI(1); // API v1 estável
}

module.exports = { getGitApi };
