import * as vscode from 'vscode';

const isWindows = process.platform === 'win32';

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(pattern: string): RegExp {
    let regex = '^';
    let i = 0;
    if (pattern.startsWith('**/')) {
        regex += '(?:.*/)?';
        i = 3;
    }
    while (i < pattern.length) {
        const char = pattern[i];
        if (char === '*') {
            const next = pattern[i + 1];
            if (next === '*') {
                regex += '.*';
                i += 2;
                continue;
            }
            regex += '[^/]*';
            i += 1;
            continue;
        }
        if (char === '?') {
            regex += '[^/]';
            i += 1;
            continue;
        }
        if (char === '/') {
            regex += '\\/';
            i += 1;
            continue;
        }
        regex += escapeRegex(char);
        i += 1;
    }
    regex += '$';
    return new RegExp(regex, isWindows ? 'i' : undefined);
}

export function compileExcludeMatchers(patterns: string[]): RegExp[] {
    return patterns
        .map((pattern) => pattern.trim())
        .filter((pattern) => pattern.length > 0)
        .map((pattern) => globToRegExp(pattern.replace(/\\/g, '/')));
}

export function isDocumentExcluded(
    document: vscode.TextDocument,
    excludeMatchers: RegExp[]
): boolean {
    if (excludeMatchers.length === 0) {
        return false;
    }
    if (document.isUntitled) {
        return false;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        return false;
    }
    const relativePath = vscode.workspace.asRelativePath(document.uri, false).replace(/\\/g, '/');
    return excludeMatchers.some((matcher) => matcher.test(relativePath));
}
