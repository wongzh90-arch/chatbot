// Add this import at the top of SelfImprover.js
import { ManifestBuilder } from '../utils/manifestBuilder.js';

// inside SelfImprover class:

async _ensureManifest() {
    if (this.manifest) return;
    // try to load from repo
    try {
        const { content } = await GitHubService.loadFileContent(this.repo, this.branch, 'manifest.json', this.githubToken);
        this.manifest = JSON.parse(content);
        this.onLog('✅ Manifest loaded from repo');
        return;
    } catch {
        this.onLog('⚠️ No manifest.json found – building from source...');
    }

    // Build from file tree
    if (!this.fileTree) await this.fetchFileTree();
    // Fetch content for all JS files (could be slow if many files; we could limit to maxFiles)
    const jsPaths = this.fileTree.filter(f => f.path.endsWith('.js') || f.path.endsWith('.jsx')).map(f => f.path);
    const fileContents = [];
    for (const p of jsPaths) {
        try {
            const { content } = await GitHubService.loadFileContent(this.repo, this.branch, p, this.githubToken);
            fileContents.push({ path: p, content });
        } catch (e) {
            // skip any that can't be loaded
        }
    }

    // Build manifest
    this.manifest = ManifestBuilder.buildFromFiles(fileContents);
    this.onLog('✅ Manifest built from source');
}
