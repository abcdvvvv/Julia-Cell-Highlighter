import * as vscode from 'vscode';
import {
    CellIndex,
    computeCellRange,
    findDelimiterLineForRange,
    findNextDelimiterLine,
    getOrBuildIndex,
    lowerBound
} from './cellIndex';
import { readConfig } from './config';
import { isDocumentExcluded } from './exclude';

const EXECUTE_CELL = 'language-julia.executeCell';
const EXECUTE_CELL_AND_MOVE = 'language-julia.executeCellAndMove';

let availabilityCache: { hasExecute: boolean; hasExecuteAndMove: boolean } | null = null;
let availabilityPromise: Promise<{ hasExecute: boolean; hasExecuteAndMove: boolean }> | null = null;

export function resetExecuteAvailabilityCache(): void {
    availabilityCache = null;
    availabilityPromise = null;
}

export class JuliaCellCodeLensProvider implements vscode.CodeLensProvider {
    private readonly emitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.emitter.event;

    constructor(private readonly indexCache: Map<string, CellIndex>) {}

    refresh(): void {
        this.emitter.fire();
    }

    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        if (document.languageId !== 'julia') {
            return [];
        }
        const config = readConfig();
        if (config.codeLensMode === 'never') {
            return [];
        }
        if (isDocumentExcluded(document, config.excludeMatchers)) {
            return [];
        }

        const availability = await getExecuteAvailability();
        if (!availability.hasExecute && !availability.hasExecuteAndMove) {
            return [];
        }

        const index = getOrBuildIndex(this.indexCache, document, config.delimiterRegexes, config.delimiterKey);
        if (index.delimLines.length === 0) {
            return [];
        }

        if (config.codeLensMode === 'current') {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.uri.toString() !== document.uri.toString()) {
                return [];
            }
            const range = computeCellRange(
                document,
                index.delimLines,
                config,
                activeEditor.selection.active.line
            );
            if (!range) {
                return [];
            }
            const delimiterLine = findDelimiterLineForRange(index.delimLines, range.start.line);
            if (delimiterLine === null) {
                return [];
            }
            return buildLensesForLine(document, delimiterLine, availability.hasExecute, availability.hasExecuteAndMove);
        }

        const lenses: vscode.CodeLens[] = [];
        for (let i = 0; i < index.delimLines.length; i += 1) {
            if (!hasExecutableLine(index.delimLines, i, document.lineCount)) {
                continue;
            }
            const line = index.delimLines[i];
            lenses.push(...buildLensesForLine(document, line, availability.hasExecute, availability.hasExecuteAndMove));
        }

        return lenses;
    }
}

function findExecutableLineForDelimiter(
    delimLines: number[],
    delimiterLine: number,
    lineCount: number
): number | null {
    const idx = lowerBound(delimLines, delimiterLine);
    if (idx >= delimLines.length || delimLines[idx] !== delimiterLine) {
        return null;
    }
    const next = idx + 1 < delimLines.length ? delimLines[idx + 1] : undefined;
    const start = delimiterLine + 1;
    const end = next !== undefined ? next - 1 : lineCount - 1;
    if (start <= end) {
        return start;
    }
    const prev = idx > 0 ? delimLines[idx - 1] : undefined;
    if (prev === undefined) {
        return null;
    }
    const prevStart = prev + 1;
    const prevEnd = delimiterLine - 1;
    return prevStart <= prevEnd ? prevStart : null;
}

function buildLensesForLine(
    document: vscode.TextDocument,
    line: number,
    hasExecute: boolean,
    hasExecuteAndMove: boolean
): vscode.CodeLens[] {
    const range = new vscode.Range(line, 0, line, 0);
    const lenses: vscode.CodeLens[] = [];
    if (hasExecute) {
        lenses.push(new vscode.CodeLens(range, {
            title: '$(run) Run Cell',
            command: 'juliaCellHighlighter.executeCellAtDelimiter',
            arguments: [document.uri, line]
        }));
    }
    if (hasExecuteAndMove) {
        lenses.push(new vscode.CodeLens(range, {
            title: 'Run Cell and Move',
            command: 'juliaCellHighlighter.executeCellAndMoveAtDelimiter',
            arguments: [document.uri, line]
        }));
    }
    return lenses;
}

export async function executeJuliaCellAtDelimiter(
    uri: vscode.Uri,
    delimiterLine: number,
    mode: 'execute' | 'executeAndMove',
    indexCache: Map<string, CellIndex>
): Promise<void> {
    const availability = await getExecuteAvailability();
    if (!ensureCommandAvailable(mode, availability)) {
        return;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    const config = readConfig();
    if (isDocumentExcluded(document, config.excludeMatchers)) {
        return;
    }
    const index = getOrBuildIndex(indexCache, document, config.delimiterRegexes, config.delimiterKey);
    const targetLine = findExecutableLineForDelimiter(index.delimLines, delimiterLine, document.lineCount);
    if (targetLine === null) {
        return;
    }

    const editor = await vscode.window.showTextDocument(document, { preserveFocus: false, preview: true });
    const position = new vscode.Position(targetLine, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));

    const execCommand = mode === 'executeAndMove' && availability.hasExecute
        ? EXECUTE_CELL
        : (mode === 'execute' ? EXECUTE_CELL : EXECUTE_CELL_AND_MOVE);
    await vscode.commands.executeCommand(execCommand);

    if (mode === 'executeAndMove' && availability.hasExecute) {
        const nextDelimiter = findNextDelimiterLine(index.delimLines, delimiterLine);
        if (nextDelimiter !== null) {
            await delay(150);
            const nextPosition = new vscode.Position(nextDelimiter, 0);
            editor.selection = new vscode.Selection(nextPosition, nextPosition);
            editor.revealRange(new vscode.Range(nextPosition, nextPosition));
        }
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getExecuteAvailability(): Promise<{ hasExecute: boolean; hasExecuteAndMove: boolean }> {
    if (availabilityCache) {
        return availabilityCache;
    }
    if (!availabilityPromise) {
        availabilityPromise = (async () => {
            const commands = await vscode.commands.getCommands(true);
            availabilityCache = {
                hasExecute: commands.includes(EXECUTE_CELL),
                hasExecuteAndMove: commands.includes(EXECUTE_CELL_AND_MOVE)
            };
            return availabilityCache;
        })();
    }
    try {
        return await availabilityPromise;
    } finally {
        availabilityPromise = null;
    }
}

function hasExecutableLine(delimLines: number[], index: number, lineCount: number): boolean {
    const delimiterLine = delimLines[index];
    const next = index + 1 < delimLines.length ? delimLines[index + 1] : undefined;
    const startAfter = delimiterLine + 1;
    const endAfter = next !== undefined ? next - 1 : lineCount - 1;
    if (startAfter <= endAfter) {
        return true;
    }
    const prev = index > 0 ? delimLines[index - 1] : undefined;
    if (prev === undefined) {
        return false;
    }
    const prevStart = prev + 1;
    const prevEnd = delimiterLine - 1;
    return prevStart <= prevEnd;
}

function ensureCommandAvailable(
    mode: 'execute' | 'executeAndMove',
    availability: { hasExecute: boolean; hasExecuteAndMove: boolean }
): boolean {
    if (mode === 'execute' && !availability.hasExecute) {
        vscode.window.showWarningMessage('Julia extension command is not available. Please install the Julia extension.');
        return false;
    }
    if (mode === 'executeAndMove' && !availability.hasExecute && !availability.hasExecuteAndMove) {
        vscode.window.showWarningMessage('Julia extension command is not available. Please install the Julia extension.');
        return false;
    }
    return true;
}
