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
exports.getOrBuildIndex = getOrBuildIndex;
exports.invalidateIndex = invalidateIndex;
exports.lowerBound = lowerBound;
exports.computeCellRange = computeCellRange;
exports.findDelimiterLineForRange = findDelimiterLineForRange;
exports.findNextDelimiterLine = findNextDelimiterLine;
const vscode = __importStar(require("vscode"));
function getOrBuildIndex(cache, document, regexes, regexKey) {
    const key = document.uri.toString();
    const existing = cache.get(key);
    if (existing && existing.version === document.version && existing.regexKey === regexKey) {
        return existing;
    }
    const delimLines = buildDelimiterLines(document, regexes);
    const index = { version: document.version, regexKey, delimLines };
    cache.set(key, index);
    return index;
}
function invalidateIndex(cache, document) {
    cache.delete(document.uri.toString());
}
function buildDelimiterLines(document, regexes) {
    if (regexes.length === 0) {
        return [];
    }
    const lines = [];
    for (let line = 0; line < document.lineCount; line += 1) {
        const text = document.lineAt(line).text;
        if (regexes.some((regex) => regex.test(text))) {
            lines.push(line);
        }
    }
    return lines;
}
function lowerBound(values, target) {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (values[mid] < target) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function getPrevNext(values, line) {
    const idx = lowerBound(values, line);
    const isDelimiter = idx < values.length && values[idx] === line;
    const prev = idx > 0 ? values[idx - 1] : undefined;
    const next = isDelimiter
        ? (idx + 1 < values.length ? values[idx + 1] : undefined)
        : (idx < values.length ? values[idx] : undefined);
    return { prev, next, isDelimiter };
}
function resolveActiveLine(line, lineCount, delimLines, behavior) {
    if (delimLines.length === 0) {
        return line;
    }
    const { isDelimiter } = getPrevNext(delimLines, line);
    if (!isDelimiter) {
        return line;
    }
    if (behavior === 'none') {
        return null;
    }
    if (behavior === 'next') {
        const nextLine = line + 1;
        return nextLine < lineCount ? nextLine : null;
    }
    const previousLine = line - 1;
    return previousLine >= 0 ? previousLine : null;
}
function computeCellRange(document, delimLines, config, activeLine) {
    if (document.lineCount === 0) {
        return null;
    }
    if (delimLines.length === 0) {
        if (config.highlightWhenNoDelimiter === 'file') {
            const endLine = document.lineCount - 1;
            return new vscode.Range(new vscode.Position(0, 0), document.lineAt(endLine).range.end);
        }
        return null;
    }
    const resolvedLine = resolveActiveLine(activeLine, document.lineCount, delimLines, config.cursorOnDelimiterBehavior);
    if (resolvedLine === null) {
        return null;
    }
    const { prev, next } = getPrevNext(delimLines, resolvedLine);
    const startLine = prev !== undefined
        ? (config.includeDelimiterLine ? prev : prev + 1)
        : 0;
    const endLine = next !== undefined ? next - 1 : document.lineCount - 1;
    if (startLine > endLine) {
        return null;
    }
    return new vscode.Range(new vscode.Position(startLine, 0), document.lineAt(endLine).range.end);
}
function findDelimiterLineForRange(delimLines, startLine) {
    const idx = lowerBound(delimLines, startLine);
    if (idx < delimLines.length && delimLines[idx] === startLine) {
        return startLine;
    }
    if (idx > 0) {
        return delimLines[idx - 1];
    }
    return null;
}
function findNextDelimiterLine(delimLines, delimiterLine) {
    const idx = lowerBound(delimLines, delimiterLine);
    if (idx >= delimLines.length || delimLines[idx] !== delimiterLine) {
        return null;
    }
    const next = idx + 1 < delimLines.length ? delimLines[idx + 1] : undefined;
    return next ?? null;
}
//# sourceMappingURL=cellIndex.js.map