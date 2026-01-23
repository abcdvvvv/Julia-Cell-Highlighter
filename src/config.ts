import * as vscode from 'vscode';
import { compileExcludeMatchers } from './exclude';

export type HighlightWhenNoDelimiter = 'file' | 'none';
export type CursorOnDelimiterBehavior = 'next' | 'previous' | 'none';
export type MultiCursorMode = 'primary' | 'union' | 'first';
export type CodeLensMode = 'always' | 'current' | 'never';
export type DefaultDelimiterOption = '##' | '#%%' | '# %%';

export interface HighlighterConfig {
    enabled: boolean;
    codeLensMode: CodeLensMode;
    backgroundColor: string;
    borderColor: string;
    topBorderWidth: string;
    bottomBorderWidth: string;
    showDelimiterSeparator: boolean;
    delimiterSeparatorColor: string;
    delimiterSeparatorWidth: string;
    separatorDelimiterRegexes: RegExp[];
    separatorDelimiterKey: string;
    excludeMatchers: RegExp[];
    includeDelimiterLine: boolean;
    highlightWhenNoDelimiter: HighlightWhenNoDelimiter;
    cursorOnDelimiterBehavior: CursorOnDelimiterBehavior;
    multiCursorMode: MultiCursorMode;
    delimiterRegexes: RegExp[];
    delimiterKey: string;
    delimiterSource: 'custom' | 'julia' | 'default';
}

const DEFAULT_DELIMITER_PATTERNS: Record<DefaultDelimiterOption, string> = {
    '##': '^##(?!#)',
    '#%%': '^#%%',
    '# %%': '^#\\s+%%'
};
const DEFAULT_DELIMITER_OPTIONS: DefaultDelimiterOption[] = ['##', '#%%', '# %%'];
const DEFAULT_EXCLUDE_PATTERNS = ['**/src/**', '**/test/**', '**/deps/**', '**/docs/**'];

const warnedKeys = new Set<string>();

function warnOnce(key: string, message: string): void {
    if (warnedKeys.has(key)) return;
    warnedKeys.add(key);
    vscode.window.showWarningMessage(message);
}

function getStringArray(config: vscode.WorkspaceConfiguration, key: string): string[] {
    const raw = config.get<unknown>(key);
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

function isExplicitlySet(config: vscode.WorkspaceConfiguration, key: string): boolean {
    const inspected = config.inspect(key);
    return Boolean(
        inspected?.globalValue !== undefined ||
        inspected?.workspaceValue !== undefined ||
        inspected?.workspaceFolderValue !== undefined
    );
}

function compileRegexes(patterns: string[]): { regexes: RegExp[]; invalidCount: number } {
    const regexes: RegExp[] = [];
    let invalidCount = 0;
    for (const pattern of patterns) {
        try {
            regexes.push(new RegExp(pattern));
        } catch {
            invalidCount += 1;
        }
    }
    return { regexes, invalidCount };
}

function parseDefaultDelimiterOptions(
    config: vscode.WorkspaceConfiguration
): { options: DefaultDelimiterOption[]; usedFallback: boolean } {
    const raw = getStringArray(config, 'defaultDelimiters');
    const filtered = raw.filter((value) => DEFAULT_DELIMITER_OPTIONS.includes(value as DefaultDelimiterOption)) as DefaultDelimiterOption[];
    const explicitlySet = isExplicitlySet(config, 'defaultDelimiters');
    if (!explicitlySet) {
        return { options: DEFAULT_DELIMITER_OPTIONS, usedFallback: false };
    }
    if (filtered.length === 0) {
        return { options: DEFAULT_DELIMITER_OPTIONS, usedFallback: true };
    }
    return { options: filtered, usedFallback: false };
}

function parseSeparatorDelimiters(
    config: vscode.WorkspaceConfiguration
): { regexes: RegExp[]; key: string } {
    const patterns = getStringArray(config, 'separatorDelimiters');
    const explicitlySet = isExplicitlySet(config, 'separatorDelimiters');
    if (patterns.length === 0) {
        if (explicitlySet) {
            warnOnce(
                'separatorDelimiters-empty',
                'Julia Cell Highlighter: separatorDelimiters is empty, falling back to the built-in defaults.'
            );
        }
        const defaultPatterns = DEFAULT_DELIMITER_OPTIONS.map((option) => DEFAULT_DELIMITER_PATTERNS[option]);
        return {
            regexes: compileRegexes(defaultPatterns).regexes,
            key: `separator-default|${DEFAULT_DELIMITER_OPTIONS.join(';')}`
        };
    }

    const compiled = compileRegexes(patterns);
    if (compiled.regexes.length === 0) {
        warnOnce(
            'separatorDelimiters-invalid',
            'Julia Cell Highlighter: separatorDelimiters is invalid, falling back to the built-in defaults.'
        );
        const defaultPatterns = DEFAULT_DELIMITER_OPTIONS.map((option) => DEFAULT_DELIMITER_PATTERNS[option]);
        return {
            regexes: compileRegexes(defaultPatterns).regexes,
            key: `separator-default|${DEFAULT_DELIMITER_OPTIONS.join(';')}`
        };
    }
    if (compiled.invalidCount > 0) {
        warnOnce(
            'separatorDelimiters-partial',
            'Julia Cell Highlighter: Some separatorDelimiters are invalid and were ignored.'
        );
    }
    return {
        regexes: compiled.regexes,
        key: `separator-custom|${patterns.join(';')}`
    };
}

function parseHighlightWhenNoDelimiter(value: unknown): HighlightWhenNoDelimiter {
    return value === 'file' || value === 'none' ? value : 'none';
}

function parseCursorOnDelimiterBehavior(value: unknown): CursorOnDelimiterBehavior {
    return value === 'previous' || value === 'none' || value === 'next' ? value : 'next';
}

function parseMultiCursorMode(value: unknown): MultiCursorMode {
    return value === 'union' || value === 'first' || value === 'primary' ? value : 'primary';
}

function parseCodeLensMode(value: unknown): CodeLensMode {
    return value === 'always' || value === 'current' || value === 'never' ? value : 'always';
}

let cachedConfig: HighlighterConfig | null = null;

export function invalidateConfigCache(): void {
    cachedConfig = null;
}

export function readConfig(): HighlighterConfig {
    if (cachedConfig) {
        return cachedConfig;
    }
    const config = vscode.workspace.getConfiguration('juliaCellHighlighter');
    const juliaConfig = vscode.workspace.getConfiguration('julia');

    const enabled = config.get<boolean>('enabled', true);
    const codeLensModeRaw = config.get<unknown>('codeLensMode');
    const codeLensModeSet = isExplicitlySet(config, 'codeLensMode');
    let codeLensMode = parseCodeLensMode(codeLensModeRaw);
    if (!codeLensModeSet) {
        const legacyEnable = config.get<boolean>('enableCodeLens', true);
        codeLensMode = legacyEnable ? 'always' : 'never';
    }
    const backgroundColor = config.get<string>('backgroundColor', 'rgba(100, 150, 255, 0.06)');
    const borderColor = config.get<string>('borderColor', 'rgba(100, 150, 255, 0.6)');
    const topBorderWidth = config.get<string>('topBorderWidth', '2px');
    const bottomBorderWidth = config.get<string>('bottomBorderWidth', '1px');
    const showDelimiterSeparator = config.get<boolean>('showDelimiterSeparator', true);
    const delimiterSeparatorColor = config.get<string>('delimiterSeparatorColor', '#ffffff');
    const delimiterSeparatorWidth = config.get<string>('delimiterSeparatorWidth', '1px');
    const separatorDelimiter = parseSeparatorDelimiters(config);
    const excludePatterns = config.get<string[]>('excludePatterns', DEFAULT_EXCLUDE_PATTERNS);
    const excludeMatchers = compileExcludeMatchers(excludePatterns);
    const includeDelimiterLine = config.get<boolean>('includeDelimiterLine', true);
    const highlightWhenNoDelimiter = parseHighlightWhenNoDelimiter(
        config.get<unknown>('highlightWhenNoDelimiter', 'none')
    );
    const cursorOnDelimiterBehavior = parseCursorOnDelimiterBehavior(
        config.get<unknown>('cursorOnDelimiterBehavior', 'next')
    );
    const multiCursorMode = parseMultiCursorMode(
        config.get<unknown>('multiCursorMode', 'primary')
    );

    const juliaPatterns = getStringArray(juliaConfig, 'cellDelimiters');
    const compiledJulia = compileRegexes(juliaPatterns);
    if (juliaPatterns.length > 0 && compiledJulia.regexes.length === 0) {
        warnOnce(
            'juliaCellDelimiters-invalid',
            'Julia Cell Highlighter: julia.cellDelimiters is empty or invalid, falling back to defaults.'
        );
    } else if (compiledJulia.invalidCount > 0) {
        warnOnce(
            'juliaCellDelimiters-partial',
            'Julia Cell Highlighter: Some julia.cellDelimiters are invalid and were ignored.'
        );
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
        warnOnce(
            'defaultDelimiters-invalid',
            'Julia Cell Highlighter: defaultDelimiters is empty or invalid, falling back to the built-in defaults.'
        );
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
