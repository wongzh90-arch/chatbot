/**
 * stripComments – Removes JS/CSS comments and blank lines to reduce prompt size.
 */
export function stripComments(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/\/\/.*$/gm, '')           // line comments
        .replace(/^\s*[\r\n]/gm, '');       // blank lines
}
