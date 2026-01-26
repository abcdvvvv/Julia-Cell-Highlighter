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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const cellIndex_1 = require("./cellIndex");
const codeLens_1 = require("./codeLens");
const decorations_1 = require("./decorations");
const config_1 = require("./config");
const exclude_1 = require("./exclude");
const indexCache = new Map();
const separatorIndexCache = new Map();
let selectionTimer;
let documentTimer;
let codeLensTimer;
let separatorTimer;
let lastEditor;
const SELECTION_DEBOUNCE_MS = 50;
const DOCUMENT_DEBOUNCE_MS = 200;
function activate(context) {
    const toggleCommand = vscode.commands.registerCommand('juliaCellHighlighter.toggleHighlighting', async () => {
        const config = vscode.workspace.getConfiguration('juliaCellHighlighter');
        const enabled = config.get('enabled', true);
        await config.update('enabled', !enabled, vscode.ConfigurationTarget.Global);
        scheduleUpdate(vscode.window.activeTextEditor, 0);
    });
    const executeCellCommand = vscode.commands.registerCommand('juliaCellHighlighter.executeCellAtDelimiter', async (uri, line) => {
        await (0, codeLens_1.executeJuliaCellAtDelimiter)(uri, line, 'execute', indexCache);
    });
    const executeCellAndMoveCommand = vscode.commands.registerCommand('juliaCellHighlighter.executeCellAndMoveAtDelimiter', async (uri, line) => {
        await (0, codeLens_1.executeJuliaCellAtDelimiter)(uri, line, 'executeAndMove', indexCache);
    });
    const codeLensProvider = new codeLens_1.JuliaCellCodeLensProvider(indexCache);
    const codeLensDisposable = vscode.languages.registerCodeLensProvider([{ language: 'julia', scheme: 'file' }, { language: 'julia', scheme: 'untitled' }], codeLensProvider);
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
        }
        else if (lastEditor) {
            (0, decorations_1.clearHighlightDecorations)(lastEditor);
            (0, decorations_1.clearSeparatorDecorations)(lastEditor);
            lastEditor = undefined;
        }
    });
    const configDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('juliaCellHighlighter') || event.affectsConfiguration('julia.cellDelimiters')) {
            indexCache.clear();
            separatorIndexCache.clear();
            (0, config_1.invalidateConfigCache)();
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
        (0, cellIndex_1.invalidateIndex)(indexCache, event.document);
        (0, cellIndex_1.invalidateIndex)(separatorIndexCache, event.document);
        scheduleUpdate(vscode.window.activeTextEditor, DOCUMENT_DEBOUNCE_MS);
        codeLensProvider.refresh();
        if (vscode.window.activeTextEditor) {
            scheduleSeparatorRefresh(vscode.window.activeTextEditor, DOCUMENT_DEBOUNCE_MS);
        }
    });
    const closeDisposable = vscode.workspace.onDidCloseTextDocument((document) => {
        (0, cellIndex_1.invalidateIndex)(indexCache, document);
        (0, cellIndex_1.invalidateIndex)(separatorIndexCache, document);
    });
    const extensionsDisposable = vscode.extensions.onDidChange(() => {
        (0, codeLens_1.resetExecuteAvailabilityCache)();
        codeLensProvider.refresh();
    });
    context.subscriptions.push(toggleCommand, executeCellCommand, executeCellAndMoveCommand, codeLensDisposable, selectionDisposable, editorDisposable, configDisposable, documentDisposable, closeDisposable, extensionsDisposable);
    if (vscode.window.activeTextEditor) {
        scheduleUpdate(vscode.window.activeTextEditor, 0);
        scheduleSeparatorRefresh(vscode.window.activeTextEditor, 0);
    }
}
function deactivate() {
    if (selectionTimer)
        clearTimeout(selectionTimer);
    if (documentTimer)
        clearTimeout(documentTimer);
    if (codeLensTimer)
        clearTimeout(codeLensTimer);
    if (separatorTimer)
        clearTimeout(separatorTimer);
    if (lastEditor) {
        (0, decorations_1.clearHighlightDecorations)(lastEditor);
        (0, decorations_1.clearSeparatorDecorations)(lastEditor);
    }
    (0, decorations_1.disposeDecorations)();
}
function scheduleUpdate(editor, delayMs) {
    if (delayMs <= 0) {
        updateHighlighting(editor);
        return;
    }
    if (delayMs === SELECTION_DEBOUNCE_MS) {
        if (selectionTimer)
            clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => updateHighlighting(editor), delayMs);
        return;
    }
    if (documentTimer)
        clearTimeout(documentTimer);
    documentTimer = setTimeout(() => updateHighlighting(editor), delayMs);
}
function scheduleCodeLensRefresh(provider, delayMs) {
    const config = (0, config_1.readConfig)();
    if (config.codeLensMode !== 'current') {
        return;
    }
    if (delayMs <= 0) {
        provider.refresh();
        return;
    }
    if (codeLensTimer)
        clearTimeout(codeLensTimer);
    codeLensTimer = setTimeout(() => provider.refresh(), delayMs);
}
function scheduleSeparatorRefresh(editor, delayMs) {
    if (delayMs <= 0) {
        refreshSeparatorLines(editor);
        return;
    }
    if (separatorTimer)
        clearTimeout(separatorTimer);
    separatorTimer = setTimeout(() => refreshSeparatorLines(editor), delayMs);
}
function updateHighlighting(editor) {
    if (!editor || editor.document.languageId !== 'julia') {
        if (lastEditor)
            (0, decorations_1.clearHighlightDecorations)(lastEditor);
        lastEditor = undefined;
        return;
    }
    if (lastEditor && lastEditor !== editor)
        (0, decorations_1.clearHighlightDecorations)(lastEditor);
    lastEditor = editor;
    const config = (0, config_1.readConfig)();
    if (!config.enabled || (0, exclude_1.isDocumentExcluded)(editor.document, config.excludeMatchers)) {
        (0, decorations_1.clearHighlightDecorations)(editor);
        return;
    }
    const index = (0, cellIndex_1.getOrBuildIndex)(indexCache, editor.document, config.delimiterRegexes, config.delimiterKey);
    const ranges = computeRanges(editor, index, config);
    if (ranges.length === 0) {
        (0, decorations_1.clearHighlightDecorations)(editor);
        return;
    }
    const decoration = (0, decorations_1.getHighlightDecorationType)(config.backgroundColor);
    editor.setDecorations(decoration, ranges);
    const { top, bottom } = (0, decorations_1.getBorderDecorationTypes)(config.borderColor, config.topBorderWidth, config.bottomBorderWidth);
    const topRanges = ranges.map((range) => lineRange(editor.document, range.start.line));
    const bottomRanges = ranges.map((range) => lineRange(editor.document, range.end.line));
    editor.setDecorations(top, topRanges);
    editor.setDecorations(bottom, bottomRanges);
    // Separator lines are refreshed separately to avoid updates on cursor moves.
}
function computeRanges(editor, index, config) {
    const selections = editor.selections;
    const ranges = [];
    const pushRange = (line) => {
        const range = (0, cellIndex_1.computeCellRange)(editor.document, index.delimLines, config, line);
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
function mergeRanges(ranges) {
    if (ranges.length <= 1) {
        return ranges;
    }
    const sorted = [...ranges].sort((a, b) => a.start.line - b.start.line);
    const merged = [];
    let current = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
        const next = sorted[i];
        if (next.start.line <= current.end.line + 1) {
            const end = next.end.isAfter(current.end) ? next.end : current.end;
            current = new vscode.Range(current.start, end);
        }
        else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);
    return merged;
}
function lineRange(document, line) {
    return new vscode.Range(new vscode.Position(line, 0), document.lineAt(line).range.end);
}
function refreshSeparatorLines(editor) {
    if (editor.document.languageId !== 'julia')
        return;
    const config = (0, config_1.readConfig)();
    if (!config.showDelimiterSeparator) {
        (0, decorations_1.clearSeparatorDecorations)(editor);
        return;
    }
    const separatorIndex = (0, cellIndex_1.getOrBuildIndex)(separatorIndexCache, editor.document, config.separatorDelimiterRegexes, config.separatorDelimiterKey);
    if (separatorIndex.delimLines.length === 0) {
        (0, decorations_1.clearSeparatorDecorations)(editor);
        return;
    }
    const decoration = (0, decorations_1.getDelimiterSeparatorDecorationType)(config.delimiterSeparatorColor, config.delimiterSeparatorWidth);
    const ranges = separatorIndex.delimLines.map((line) => lineRange(editor.document, line));
    editor.setDecorations(decoration, ranges);
}
//# sourceMappingURL=extension.js.map