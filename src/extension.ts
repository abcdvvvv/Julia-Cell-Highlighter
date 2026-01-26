import * as vscode from 'vscode';
import { computeCellRange, getOrBuildIndex, invalidateIndex, CellIndex } from './cellIndex';
import { JuliaCellCodeLensProvider, executeJuliaCellAtDelimiter, resetExecuteAvailabilityCache } from './codeLens';
import {
    clearHighlightDecorations,
    clearSeparatorDecorations,
    disposeDecorations,
    getBorderDecorationTypes,
    getDelimiterSeparatorDecorationType,
    getHighlightDecorationType
} from './decorations';
import { invalidateConfigCache, readConfig } from './config';
import { isDocumentExcluded } from './exclude';

const indexCache = new Map<string, CellIndex>();
const separatorIndexCache = new Map<string, CellIndex>();

let selectionTimer: NodeJS.Timeout | undefined;
let documentTimer: NodeJS.Timeout | undefined;
let codeLensTimer: NodeJS.Timeout | undefined;
let separatorTimer: NodeJS.Timeout | undefined;
let lastEditor: vscode.TextEditor | undefined;

const SELECTION_DEBOUNCE_MS = 50;
const DOCUMENT_DEBOUNCE_MS = 200;

export function activate(context: vscode.ExtensionContext): void {
    const toggleCommand = vscode.commands.registerCommand('juliaCellHighlighter.toggleHighlighting', async () => {
        const config = vscode.workspace.getConfiguration('juliaCellHighlighter');
        const enabled = config.get<boolean>('enabled', true);
        await config.update('enabled', !enabled, vscode.ConfigurationTarget.Global);
        scheduleUpdate(vscode.window.activeTextEditor, 0);
    });

    const executeCellCommand = vscode.commands.registerCommand(
        'juliaCellHighlighter.executeCellAtDelimiter',
        async (uri: vscode.Uri, line: number) => {
            await executeJuliaCellAtDelimiter(uri, line, 'execute', indexCache);
        }
    );

    const executeCellAndMoveCommand = vscode.commands.registerCommand(
        'juliaCellHighlighter.executeCellAndMoveAtDelimiter',
        async (uri: vscode.Uri, line: number) => {
            await executeJuliaCellAtDelimiter(uri, line, 'executeAndMove', indexCache);
        }
    );

    const codeLensProvider = new JuliaCellCodeLensProvider(indexCache);
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        [{ language: 'julia', scheme: 'file' }, { language: 'julia', scheme: 'untitled' }],
        codeLensProvider
    );

    const selectionDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
        if (!event.textEditor) {
            return;
        }
        scheduleUpdate(event.textEditor, SELECTION_DEBOUNCE_MS);
        scheduleCodeLensRefresh(codeLensProvider, SELECTION_DEBOUNCE_MS);
    });

    const editorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            scheduleUpdate(editor, 0);
            scheduleCodeLensRefresh(codeLensProvider, 0);
            scheduleSeparatorRefresh(editor, 0);
        } else if (lastEditor) {
            clearHighlightDecorations(lastEditor);
            clearSeparatorDecorations(lastEditor);
            lastEditor = undefined;
        }
    });

    const configDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('juliaCellHighlighter') || event.affectsConfiguration('julia.cellDelimiters')) {
            indexCache.clear();
            separatorIndexCache.clear();
            invalidateConfigCache();
            scheduleUpdate(vscode.window.activeTextEditor, 0);
            codeLensProvider.refresh();
            if (vscode.window.activeTextEditor) {
                scheduleSeparatorRefresh(vscode.window.activeTextEditor, 0);
            }
        }
    });

    const documentDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId !== 'julia') {
            return;
        }
        invalidateIndex(indexCache, event.document);
        invalidateIndex(separatorIndexCache, event.document);
        scheduleUpdate(vscode.window.activeTextEditor, DOCUMENT_DEBOUNCE_MS);
        codeLensProvider.refresh();
        if (vscode.window.activeTextEditor) {
            scheduleSeparatorRefresh(vscode.window.activeTextEditor, DOCUMENT_DEBOUNCE_MS);
        }
    });

    const closeDisposable = vscode.workspace.onDidCloseTextDocument((document) => {
        invalidateIndex(indexCache, document);
        invalidateIndex(separatorIndexCache, document);
    });

    const extensionsDisposable = vscode.extensions.onDidChange(() => {
        resetExecuteAvailabilityCache();
        codeLensProvider.refresh();
    });

    context.subscriptions.push(
        toggleCommand,
        executeCellCommand,
        executeCellAndMoveCommand,
        codeLensDisposable,
        selectionDisposable,
        editorDisposable,
        configDisposable,
        documentDisposable,
        closeDisposable,
        extensionsDisposable
    );

    if (vscode.window.activeTextEditor) {
        scheduleUpdate(vscode.window.activeTextEditor, 0);
        scheduleSeparatorRefresh(vscode.window.activeTextEditor, 0);
    }
}

export function deactivate(): void {
    if (selectionTimer) clearTimeout(selectionTimer);
    if (documentTimer) clearTimeout(documentTimer);
    if (codeLensTimer) clearTimeout(codeLensTimer);
    if (separatorTimer) clearTimeout(separatorTimer);
    if (lastEditor) {
        clearHighlightDecorations(lastEditor);
        clearSeparatorDecorations(lastEditor);
    }
    disposeDecorations();
}

function scheduleUpdate(editor: vscode.TextEditor | undefined, delayMs: number): void {
    if (delayMs <= 0) {
        updateHighlighting(editor);
        return;
    }
    if (delayMs === SELECTION_DEBOUNCE_MS) {
        if (selectionTimer) clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => updateHighlighting(editor), delayMs);
        return;
    }
    if (documentTimer) clearTimeout(documentTimer);
    documentTimer = setTimeout(() => updateHighlighting(editor), delayMs);
}

function scheduleCodeLensRefresh(provider: JuliaCellCodeLensProvider, delayMs: number): void {
    const config = readConfig();
    if (config.codeLensMode !== 'current') {
        return;
    }
    if (delayMs <= 0) {
        provider.refresh();
        return;
    }
    if (codeLensTimer) clearTimeout(codeLensTimer);
    codeLensTimer = setTimeout(() => provider.refresh(), delayMs);
}

function scheduleSeparatorRefresh(editor: vscode.TextEditor, delayMs: number): void {
    if (delayMs <= 0) {
        refreshSeparatorLines(editor);
        return;
    }
    if (separatorTimer) clearTimeout(separatorTimer);
    separatorTimer = setTimeout(() => refreshSeparatorLines(editor), delayMs);
}

function updateHighlighting(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'julia') {
        if (lastEditor) clearHighlightDecorations(lastEditor);
        lastEditor = undefined;
        return;
    }

    if (lastEditor && lastEditor !== editor) clearHighlightDecorations(lastEditor);
    lastEditor = editor;

    const config = readConfig();
    if (!config.enabled || isDocumentExcluded(editor.document, config.excludeMatchers)) {
        clearHighlightDecorations(editor);
        return;
    }

    const index = getOrBuildIndex(indexCache, editor.document, config.delimiterRegexes, config.delimiterKey);
    const ranges = computeRanges(editor, index, config);
    if (ranges.length === 0) {
        clearHighlightDecorations(editor);
        return;
    }

    const decoration = getHighlightDecorationType(config.backgroundColor);
    editor.setDecorations(decoration, ranges);

    const { top, bottom } = getBorderDecorationTypes(
        config.borderColor,
        config.topBorderWidth,
        config.bottomBorderWidth
    );
    const topRanges = ranges.map((range) => lineRange(editor.document, range.start.line));
    const bottomRanges = ranges.map((range) => lineRange(editor.document, range.end.line));
    editor.setDecorations(top, topRanges);
    editor.setDecorations(bottom, bottomRanges);

    // Separator lines are refreshed separately to avoid updates on cursor moves.
}

function computeRanges(
    editor: vscode.TextEditor,
    index: CellIndex,
    config: ReturnType<typeof readConfig>
): vscode.Range[] {
    const selections = editor.selections;
    const ranges: vscode.Range[] = [];

    const pushRange = (line: number): void => {
        const range = computeCellRange(editor.document, index.delimLines, config, line);
        if (range) {
            ranges.push(range);
        }
    };

    if (config.multiCursorMode === 'primary' || selections.length === 0) {
        pushRange(editor.selection.active.line);
        return ranges;
    }

    if (config.multiCursorMode === 'first') {
        pushRange(selections[0].active.line);
        return ranges;
    }

    for (const selection of selections) {
        pushRange(selection.active.line);
    }

    return mergeRanges(ranges);
}

function mergeRanges(ranges: vscode.Range[]): vscode.Range[] {
    if (ranges.length <= 1) {
        return ranges;
    }
    const sorted = [...ranges].sort((a, b) => a.start.line - b.start.line);
    const merged: vscode.Range[] = [];
    let current = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
        const next = sorted[i];
        if (next.start.line <= current.end.line + 1) {
            const end = next.end.isAfter(current.end) ? next.end : current.end;
            current = new vscode.Range(current.start, end);
        } else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);
    return merged;
}

function lineRange(document: vscode.TextDocument, line: number): vscode.Range {
    return new vscode.Range(new vscode.Position(line, 0), document.lineAt(line).range.end);
}

function refreshSeparatorLines(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== 'julia') return;
    const config = readConfig();
    if (!config.showDelimiterSeparator) {
        clearSeparatorDecorations(editor);
        return;
    }
    const separatorIndex = getOrBuildIndex(
        separatorIndexCache,
        editor.document,
        config.separatorDelimiterRegexes,
        config.separatorDelimiterKey
    );
    if (separatorIndex.delimLines.length === 0) {
        clearSeparatorDecorations(editor);
        return;
    }
    const decoration = getDelimiterSeparatorDecorationType(
        config.delimiterSeparatorColor,
        config.delimiterSeparatorWidth
    );
    const ranges = separatorIndex.delimLines.map((line) => lineRange(editor.document, line));
    editor.setDecorations(decoration, ranges);
}
