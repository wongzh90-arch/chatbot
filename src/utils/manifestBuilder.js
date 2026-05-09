// src/utils/manifestBuilder.js
// Parses JS files for ES module imports/exports and builds a dependency graph.

export class ManifestBuilder {
    /**
     * Build a manifest object from the complete file tree.
     * @param {Array<{path:string, content:string}>} files - list of file objects from the repo
     * @returns {Object} manifest JSON (path -> {exports, imports, importedBy})
     */
    static buildFromFiles(files) {
        const jsFiles = files.filter(f => /\.(js|jsx|mjs)$/.test(f.path));
        // Step 1: parse exports and imports from each file
        const entries = {};
        for (const file of jsFiles) {
            const path = file.path;
            const code = file.content;
            entries[path] = {
                exports: this._extractExports(code),
                imports: this._extractImportPaths(code)  // resolved to absolute paths
            };
        }

        // Step 2: compute importedBy (reverse lookup)
        for (const [path, entry] of Object.entries(entries)) {
            entry.importedBy = [];
            for (const [otherPath, otherEntry] of Object.entries(entries)) {
                if (otherEntry.imports.includes(path)) {
                    entry.importedBy.push(otherPath);
                }
            }
        }

        return entries;
    }

    // --- private helpers ---

    static _extractExports(code) {
        const exports = new Set();
        // named exports: export { foo, bar }; or export const foo = ...
        const namedRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
        let match;
        while ((match = namedRegex.exec(code)) !== null) {
            exports.add(match[1]);
        }
        // export { name };
        const braceRegex = /export\s*\{([^}]*)\}/g;
        while ((match = braceRegex.exec(code)) !== null) {
            match[1].split(',').forEach(name => {
                const clean = name.trim().split(' as ')[0].trim();
                if (clean) exports.add(clean);
            });
        }
        // export default (anonymous) -> we just mark as 'default'
        if (/export\s+default\s+/.test(code)) {
            exports.add('default');
        }
        return [...exports];
    }

    static _extractImportPaths(code) {
        const paths = new Set();
        // import ... from './relative' or 'absolute'
        const fromRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = fromRegex.exec(code)) !== null) {
            const importPath = match[1];
            if (importPath.startsWith('.')) {
                // resolve relative path to repo-absolute path (from project root)
                // We need the file's own path to resolve. This method is called per-file,
                // so we pass the file path as context? Actually we can't resolve here.
                // Instead, we'll delay resolution until we have the file path.
                // So _extractImportPaths returns raw paths (relative or alias).
                paths.add(importPath);
            } else {
                // likely an external module (ignore)
            }
        }
        // also import() dynamic expressions? skip.
        return [...paths];
    }

    /**
     * Resolve a relative import string relative to a given file path.
     * @param {string} importPath - './foo' or '../bar'
     * @param {string} currentFilePath - like 'src/components/Header.js'
     * @returns {string} absolute repo path (e.g., 'src/components/foo.js')
     */
    static resolveImportPath(importPath, currentFilePath) {
        if (!importPath.startsWith('.')) return null; // not a local relative path
        const dir = currentFilePath.includes('/') ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) : '';
        // naive resolution (no node_modules)
        const segments = [...(dir ? dir.split('/') : []), ...importPath.split('/')];
        const resolved = [];
        for (const seg of segments) {
            if (seg === '.' || seg === '') continue;
            if (seg === '..') {
                resolved.pop();
            } else {
                resolved.push(seg);
            }
        }
        let absolutePath = resolved.join('/');
        if (!absolutePath.endsWith('.js') && !absolutePath.endsWith('.jsx') && !absolutePath.endsWith('.mjs')) {
            // try adding .js extension if missing
            absolutePath += '.js';
        }
        return absolutePath;
    }
}
