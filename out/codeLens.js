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
exports.JuliaCellCodeLensProvider = void 0;
exports.resetExecuteAvailabilityCache = resetExecuteAvailabilityCache;
exports.executeJuliaCellAtDelimiter = executeJuliaCellAtDelimiter;
const vscode = __importStar(require("vscode"));
const cellIndex_1 = require("./cellIndex");
const config_1 = require("./config");
const exclude_1 = require("./exclude");
const EXECUTE_CELL = 'language-julia.executeCell';
const EXECUTE_CELL_AND_MOVE = 'language-julia.executeCellAndMove';
const AVAILABILITY_RETRY_BASE_MS = 500;
const AVAILABILITY_RETRY_MAX_MS = 60000;
const AVAILABILITY_RETRY_MAX_ATTEMPTS = 8;
let availabilityCache = null;
let availabilityPromise = null;
function resetExecuteAvailabilityCache() {
    availabilityCache = null;
    availabilityPromise = null;
}
class JuliaCellCodeLensProvider {
    constructor(indexCache) {
        this.indexCache = indexCache;
        this.emitter = new vscode.EventEmitter();
        this.availabilityRetryDelayMs = AVAILABILITY_RETRY_BASE_MS;
        this.availabilityRetryAttempts = 0;
        this.onDidChangeCodeLenses = this.emitter.event;
    }
    refresh() {
        this.emitter.fire();
    }
    async provideCodeLenses(document) {
        if (document.languageId !== 'julia')
            return [];
        const config = (0, config_1.readConfig)();
        if (config.codeLensMode === 'never')
            return [];
        if ((0, exclude_1.isDocumentExcluded)(document, config.excludeMatchers))
            return [];
        const availability = await getExecuteAvailability();
        if (!availability.hasExecute && !availability.hasExecuteAndMove) {
            this.scheduleAvailabilityRetry();
            return [];
        }
        const index = (0, cellIndex_1.getOrBuildIndex)(this.indexCache, document, config.delimiterRegexes, config.delimiterKey);
        if (index.delimLines.length === 0)
            return [];
        if (config.codeLensMode === 'current') {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.uri.toString() !== document.uri.toString())
                return [];
            const range = (0, cellIndex_1.computeCellRange)(document, index.delimLines, config, activeEditor.selection.active.line);
            if (!range)
                return [];
            const delimiterLine = (0, cellIndex_1.findDelimiterLineForRange)(index.delimLines, range.start.line);
            if (delimiterLine === null)
                return [];
            return buildLensesForLine(document, delimiterLine, availability.hasExecute, availability.hasExecuteAndMove);
        }
        const lenses = [];
        for (let i = 0; i < index.delimLines.length; i += 1) {
            if (!hasExecutableLine(index.delimLines, i, document.lineCount))
                continue;
            const line = index.delimLines[i];
            lenses.push(...buildLensesForLine(document, line, availability.hasExecute, availability.hasExecuteAndMove));
        }
        return lenses;
    }
    scheduleAvailabilityRetry() {
        if (this.availabilityRetryTimer)
            return;
        if (this.availabilityRetryAttempts >= AVAILABILITY_RETRY_MAX_ATTEMPTS)
            return;
        this.availabilityRetryAttempts += 1;
        this.availabilityRetryTimer = setTimeout(async () => {
            this.availabilityRetryTimer = undefined;
            resetExecuteAvailabilityCache();
            const availability = await getExecuteAvailability();
            if (availability.hasExecute || availability.hasExecuteAndMove) {
                this.availabilityRetryDelayMs = AVAILABILITY_RETRY_BASE_MS;
                this.availabilityRetryAttempts = 0;
                this.emitter.fire();
                return;
            }
            this.availabilityRetryDelayMs = Math.min(this.availabilityRetryDelayMs * 2, AVAILABILITY_RETRY_MAX_MS);
            this.scheduleAvailabilityRetry();
        }, this.availabilityRetryDelayMs);
    }
}
exports.JuliaCellCodeLensProvider = JuliaCellCodeLensProvider;
function findExecutableLineForDelimiter(delimLines, delimiterLine, lineCount) {
    const idx = (0, cellIndex_1.lowerBound)(delimLines, delimiterLine);
    if (idx >= delimLines.length || delimLines[idx] !== delimiterLine)
        return null;
    const next = idx + 1 < delimLines.length ? delimLines[idx + 1] : undefined;
    const start = delimiterLine + 1;
    const end = next !== undefined ? next - 1 : lineCount - 1;
    if (start <= end)
        return start;
    const prev = idx > 0 ? delimLines[idx - 1] : undefined;
    if (prev === undefined)
        return null;
    const prevStart = prev + 1;
    const prevEnd = delimiterLine - 1;
    return prevStart <= prevEnd ? prevStart : null;
}
function buildLensesForLine(document, line, hasExecute, hasExecuteAndMove) {
    const range = new vscode.Range(line, 0, line, 0);
    const lenses = [];
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
async function executeJuliaCellAtDelimiter(uri, delimiterLine, mode, indexCache) {
    const availability = await getExecuteAvailability();
    if (!ensureCommandAvailable(mode, availability))
        return;
    const document = await vscode.workspace.openTextDocument(uri);
    const config = (0, config_1.readConfig)();
    if ((0, exclude_1.isDocumentExcluded)(document, config.excludeMatchers))
        return;
    const index = (0, cellIndex_1.getOrBuildIndex)(indexCache, document, config.delimiterRegexes, config.delimiterKey);
    const targetLine = findExecutableLineForDelimiter(index.delimLines, delimiterLine, document.lineCount);
    if (targetLine === null)
        return;
    const editor = await vscode.window.showTextDocument(document, { preserveFocus: false, preview: true });
    const position = new vscode.Position(targetLine, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
    const execCommand = mode === 'executeAndMove' && availability.hasExecute
        ? EXECUTE_CELL
        : (mode === 'execute' ? EXECUTE_CELL : EXECUTE_CELL_AND_MOVE);
    await vscode.commands.executeCommand(execCommand);
    if (mode === 'executeAndMove' && availability.hasExecute) {
        const nextDelimiter = (0, cellIndex_1.findNextDelimiterLine)(index.delimLines, delimiterLine);
        if (nextDelimiter === null)
            return;
        await delay(150);
        const nextPosition = new vscode.Position(nextDelimiter, 0);
        editor.selection = new vscode.Selection(nextPosition, nextPosition);
        editor.revealRange(new vscode.Range(nextPosition, nextPosition));
    }
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function getExecuteAvailability() {
    if (availabilityCache)
        return availabilityCache;
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
    }
    finally {
        availabilityPromise = null;
    }
}
function hasExecutableLine(delimLines, index, lineCount) {
    const delimiterLine = delimLines[index];
    const next = index + 1 < delimLines.length ? delimLines[index + 1] : undefined;
    const startAfter = delimiterLine + 1;
    const endAfter = next !== undefined ? next - 1 : lineCount - 1;
    if (startAfter <= endAfter)
        return true;
    const prev = index > 0 ? delimLines[index - 1] : undefined;
    if (prev === undefined)
        return false;
    const prevStart = prev + 1;
    const prevEnd = delimiterLine - 1;
    return prevStart <= prevEnd;
}
function ensureCommandAvailable(mode, availability) {
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
//# sourceMappingURL=codeLens.js.map