"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileExcludeMatchers = compileExcludeMatchers;
exports.isDocumentExcluded = isDocumentExcluded;
const vscode = __importStar(require("vscode"));
const isWindows = process.platform === 'win32';
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function globToRegExp(pattern) {
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
function compileExcludeMatchers(patterns) {
    return patterns
        .map((pattern) => pattern.trim())
        .filter((pattern) => pattern.length > 0)
        .map((pattern) => globToRegExp(pattern.replace(/\\/g, '/')));
}
function isDocumentExcluded(document, excludeMatchers) {
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
//# sourceMappingURL=exclude.js.map