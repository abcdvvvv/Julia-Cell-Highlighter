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
exports.invalidateConfigCache = invalidateConfigCache;
exports.readConfig = readConfig;
const vscode = __importStar(require("vscode"));
const exclude_1 = require("./exclude");
const DEFAULT_DELIMITER_PATTERNS = {
    '##': '^##(?!#)',
    '#%%': '^#%%',
    '# %%': '^#\\s+%%'
};
const DEFAULT_DELIMITER_OPTIONS = ['##', '#%%', '# %%'];
const DEFAULT_EXCLUDE_PATTERNS = ['**/src/**', '**/test/**', '**/deps/**', '**/docs/**'];
const warnedKeys = new Set();
function warnOnce(key, message) {
    if (warnedKeys.has(key))
        return;
    warnedKeys.add(key);
    vscode.window.showWarningMessage(message);
}
function getStringArray(config, key) {
    const raw = config.get(key);
    if (!Array.isArray(raw))
        return [];
    return raw
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}
function isExplicitlySet(config, key) {
    const inspected = config.inspect(key);
    return Boolean(inspected?.globalValue !== undefined ||
        inspected?.workspaceValue !== undefined ||
        inspected?.workspaceFolderValue !== undefined);
}
function compileRegexes(patterns) {
    const regexes = [];
    let invalidCount = 0;
    for (const pattern of patterns) {
        try {
            regexes.push(new RegExp(pattern));
        }
        catch {
            invalidCount += 1;
        }
    }
    return { regexes, invalidCount };
}
function parseDefaultDelimiterOptions(config) {
    const raw = getStringArray(config, 'defaultDelimiters');
    const filtered = raw.filter((value) => DEFAULT_DELIMITER_OPTIONS.includes(value));
    const explicitlySet = isExplicitlySet(config, 'defaultDelimiters');
    if (!explicitlySet) {
        return { options: DEFAULT_DELIMITER_OPTIONS, usedFallback: false };
    }
    if (filtered.length === 0) {
        return { options: DEFAULT_DELIMITER_OPTIONS, usedFallback: true };
    }
    return { options: filtered, usedFallback: false };
}
function parseSeparatorDelimiters(config) {
    const patterns = getStringArray(config, 'separatorDelimiters');
    const explicitlySet = isExplicitlySet(config, 'separatorDelimiters');
    if (patterns.length === 0) {
        if (explicitlySet) {
            warnOnce('separatorDelimiters-empty', 'Julia Cell Highlighter: separatorDelimiters is empty, falling back to the built-in defaults.');
        }
        const defaultPatterns = DEFAULT_DELIMITER_OPTIONS.map((option) => DEFAULT_DELIMITER_PATTERNS[option]);
        return {
            regexes: compileRegexes(defaultPatterns).regexes,
            key: `separator-default|${DEFAULT_DELIMITER_OPTIONS.join(';')}`
        };
    }
    const compiled = compileRegexes(patterns);
    if (compiled.regexes.length === 0) {
        warnOnce('separatorDelimiters-invalid', 'Julia Cell Highlighter: separatorDelimiters is invalid, falling back to the built-in defaults.');
        const defaultPatterns = DEFAULT_DELIMITER_OPTIONS.map((option) => DEFAULT_DELIMITER_PATTERNS[option]);
        return {
            regexes: compileRegexes(defaultPatterns).regexes,
            key: `separator-default|${DEFAULT_DELIMITER_OPTIONS.join(';')}`
        };
    }
    if (compiled.invalidCount > 0) {
        warnOnce('separatorDelimiters-partial', 'Julia Cell Highlighter: Some separatorDelimiters are invalid and were ignored.');
    }
    return {
        regexes: compiled.regexes,
        key: `separator-custom|${patterns.join(';')}`
    };
}
function parseHighlightWhenNoDelimiter(value) {
    return value === 'file' || value === 'none' ? value : 'none';
}
function parseCursorOnDelimiterBehavior(value) {
    return value === 'previous' || value === 'none' || value === 'next' ? value : 'next';
}
function parseMultiCursorMode(value) {
    return value === 'union' || value === 'first' || value === 'primary' ? value : 'primary';
}
function parseCodeLensMode(value) {
    return value === 'always' || value === 'current' || value === 'never' ? value : 'always';
}
let cachedConfig = null;
function invalidateConfigCache() {
    cachedConfig = null;
}
function readConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }
    const config = vscode.workspace.getConfiguration('juliaCellHighlighter');
    const juliaConfig = vscode.workspace.getConfiguration('julia');
    const enabled = config.get('enabled', true);
    const codeLensModeRaw = config.get('codeLensMode');
    const codeLensModeSet = isExplicitlySet(config, 'codeLensMode');
    let codeLensMode = parseCodeLensMode(codeLensModeRaw);
    if (!codeLensModeSet) {
        const legacyEnable = config.get('enableCodeLens', true);
        codeLensMode = legacyEnable ? 'always' : 'never';
    }
    const backgroundColor = config.get('backgroundColor', 'rgba(100, 150, 255, 0.06)');
    const borderColor = config.get('borderColor', 'rgba(100, 150, 255, 0.6)');
    const topBorderWidth = config.get('topBorderWidth', '2px');
    const bottomBorderWidth = config.get('bottomBorderWidth', '1px');
    const showDelimiterSeparator = config.get('showDelimiterSeparator', true);
    const delimiterSeparatorColor = config.get('delimiterSeparatorColor', '#ffffff');
    const delimiterSeparatorWidth = config.get('delimiterSeparatorWidth', '1px');
    const separatorDelimiter = parseSeparatorDelimiters(config);
    const excludePatterns = config.get('excludePatterns', DEFAULT_EXCLUDE_PATTERNS);
    const excludeMatchers = (0, exclude_1.compileExcludeMatchers)(excludePatterns);
    const includeDelimiterLine = config.get('includeDelimiterLine', true);
    const highlightWhenNoDelimiter = parseHighlightWhenNoDelimiter(config.get('highlightWhenNoDelimiter', 'none'));
    const cursorOnDelimiterBehavior = parseCursorOnDelimiterBehavior(config.get('cursorOnDelimiterBehavior', 'next'));
    const multiCursorMode = parseMultiCursorMode(config.get('multiCursorMode', 'primary'));
    const juliaPatterns = getStringArray(juliaConfig, 'cellDelimiters');
    const compiledJulia = compileRegexes(juliaPatterns);
    if (juliaPatterns.length > 0 && compiledJulia.regexes.length === 0) {
        warnOnce('juliaCellDelimiters-invalid', 'Julia Cell Highlighter: julia.cellDelimiters is empty or invalid, falling back to defaults.');
    }
    else if (compiledJulia.invalidCount > 0) {
        warnOnce('juliaCellDelimiters-partial', 'Julia Cell Highlighter: Some julia.cellDelimiters are invalid and were ignored.');
    }
    if (compiledJulia.regexes.length > 0) {
        cachedConfig = {
            enabled,
            codeLensMode,
            backgroundColor,
            borderColor,
            topBorderWidth,
            bottomBorderWidth,
            showDelimiterSeparator,
            delimiterSeparatorColor,
            delimiterSeparatorWidth,
            separatorDelimiterRegexes: separatorDelimiter.regexes,
            separatorDelimiterKey: separatorDelimiter.key,
            excludeMatchers,
            includeDelimiterLine,
            highlightWhenNoDelimiter,
            cursorOnDelimiterBehavior,
            multiCursorMode,
            delimiterRegexes: compiledJulia.regexes,
            delimiterKey: `julia|${juliaPatterns.join(';')}`,
            delimiterSource: 'julia'
        };
        return cachedConfig;
    }
    const defaultSelection = parseDefaultDelimiterOptions(config);
    if (defaultSelection.usedFallback) {
        warnOnce('defaultDelimiters-invalid', 'Julia Cell Highlighter: defaultDelimiters is empty or invalid, falling back to the built-in defaults.');
    }
    const defaultPatterns = defaultSelection.options.map((option) => DEFAULT_DELIMITER_PATTERNS[option]);
    const compiledDefault = compileRegexes(defaultPatterns);
    cachedConfig = {
        enabled,
        codeLensMode,
        backgroundColor,
        borderColor,
        topBorderWidth,
        bottomBorderWidth,
        showDelimiterSeparator,
        delimiterSeparatorColor,
        delimiterSeparatorWidth,
        separatorDelimiterRegexes: separatorDelimiter.regexes,
        separatorDelimiterKey: separatorDelimiter.key,
        excludeMatchers,
        includeDelimiterLine,
        highlightWhenNoDelimiter,
        cursorOnDelimiterBehavior,
        multiCursorMode,
        delimiterRegexes: compiledDefault.regexes,
        delimiterKey: `default|${defaultSelection.options.join(';')}`,
        delimiterSource: 'default'
    };
    return cachedConfig;
}
//# sourceMappingURL=config.js.map