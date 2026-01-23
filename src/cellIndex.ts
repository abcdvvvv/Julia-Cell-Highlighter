import * as vscode from 'vscode';
import { CursorOnDelimiterBehavior, HighlighterConfig } from './config';

export interface CellIndex {
    version: number;
    regexKey: string;
    delimLines: number[];
}

export function getOrBuildIndex(
    cache: Map<string, CellIndex>,
    document: vscode.TextDocument,
    regexes: RegExp[],
    regexKey: string
): CellIndex {
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

export function invalidateIndex(cache: Map<string, CellIndex>, document: vscode.TextDocument): void {
    cache.delete(document.uri.toString());
}

function buildDelimiterLines(document: vscode.TextDocument, regexes: RegExp[]): number[] {
    if (regexes.length === 0) {
        return [];
    }
    const lines: number[] = [];
    for (let line = 0; line < document.lineCount; line += 1) {
        const text = document.lineAt(line).text;
        if (regexes.some((regex) => regex.test(text))) {
            lines.push(line);
        }
    }
    return lines;
}

export function lowerBound(values: number[], target: number): number {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (values[mid] < target) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    return low;
}

function getPrevNext(values: number[], line: number): { prev?: number; next?: number; isDelimiter: boolean } {
    const idx = lowerBound(values, line);
    const isDelimiter = idx < values.length && values[idx] === line;
    const prev = idx > 0 ? values[idx - 1] : undefined;
    const next = isDelimiter
        ? (idx + 1 < values.length ? values[idx + 1] : undefined)
        : (idx < values.length ? values[idx] : undefined);
    return { prev, next, isDelimiter };
}

function resolveActiveLine(
    line: number,
    lineCount: number,
    delimLines: number[],
    behavior: CursorOnDelimiterBehavior
): number | null {
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

export function computeCellRange(
    document: vscode.TextDocument,
    delimLines: number[],
    config: HighlighterConfig,
    activeLine: number
): vscode.Range | null {
    if (document.lineCount === 0) {
        return null;
    }

    if (delimLines.length === 0) {
        if (config.highlightWhenNoDelimiter === 'file') {
            const endLine = document.lineCount - 1;
            return new vscode.Range(
                new vscode.Position(0, 0),
                document.lineAt(endLine).range.end
            );
        }
        return null;
    }

    const resolvedLine = resolveActiveLine(
        activeLine,
        document.lineCount,
        delimLines,
        config.cursorOnDelimiterBehavior
    );
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

    return new vscode.Range(
        new vscode.Position(startLine, 0),
        document.lineAt(endLine).range.end
    );
}

export function findDelimiterLineForRange(delimLines: number[], startLine: number): number | null {
    const idx = lowerBound(delimLines, startLine);
    if (idx < delimLines.length && delimLines[idx] === startLine) {
        return startLine;
    }
    if (idx > 0) {
        return delimLines[idx - 1];
    }
    return null;
}

export function findNextDelimiterLine(delimLines: number[], delimiterLine: number): number | null {
    const idx = lowerBound(delimLines, delimiterLine);
    if (idx >= delimLines.length || delimLines[idx] !== delimiterLine) {
        return null;
    }
    const next = idx + 1 < delimLines.length ? delimLines[idx + 1] : undefined;
    return next ?? null;
}
