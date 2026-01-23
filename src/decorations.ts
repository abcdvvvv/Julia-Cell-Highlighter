import * as vscode from 'vscode';

let highlightDecoration: vscode.TextEditorDecorationType | null = null;
let highlightKey: string | null = null;
let topBorderDecoration: vscode.TextEditorDecorationType | null = null;
let bottomBorderDecoration: vscode.TextEditorDecorationType | null = null;
let borderKey: string | null = null;
let delimiterSeparatorDecoration: vscode.TextEditorDecorationType | null = null;
let delimiterSeparatorKey: string | null = null;

export function getHighlightDecorationType(backgroundColor: string): vscode.TextEditorDecorationType {
    const key = backgroundColor;
    if (highlightDecoration && highlightKey === key) {
        return highlightDecoration;
    }
    highlightDecoration?.dispose();
    highlightKey = key;
    highlightDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor
    });
    return highlightDecoration;
}

export function getBorderDecorationTypes(
    borderColor: string,
    topBorderWidth: string,
    bottomBorderWidth: string
): { top: vscode.TextEditorDecorationType; bottom: vscode.TextEditorDecorationType } {
    const key = `${borderColor}|${topBorderWidth}|${bottomBorderWidth}`;
    if (topBorderDecoration && bottomBorderDecoration && borderKey === key) {
        return { top: topBorderDecoration, bottom: bottomBorderDecoration };
    }

    topBorderDecoration?.dispose();
    bottomBorderDecoration?.dispose();
    borderKey = key;
    topBorderDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderStyle: 'solid',
        borderColor,
        borderWidth: `${topBorderWidth} 0 0 0`
    });
    bottomBorderDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderStyle: 'solid',
        borderColor,
        borderWidth: `0 0 ${bottomBorderWidth} 0`
    });
    return { top: topBorderDecoration, bottom: bottomBorderDecoration };
}

export function getDelimiterSeparatorDecorationType(
    color: string,
    width: string
): vscode.TextEditorDecorationType {
    const key = `${color}|${width}`;
    if (delimiterSeparatorDecoration && delimiterSeparatorKey === key) {
        return delimiterSeparatorDecoration;
    }
    delimiterSeparatorDecoration?.dispose();
    delimiterSeparatorKey = key;
    delimiterSeparatorDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderStyle: 'solid',
        borderColor: color,
        borderWidth: `${width} 0 0 0`
    });
    return delimiterSeparatorDecoration;
}

export function clearDecorations(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
        return;
    }
    if (highlightDecoration) {
        editor.setDecorations(highlightDecoration, []);
    }
    if (topBorderDecoration) {
        editor.setDecorations(topBorderDecoration, []);
    }
    if (bottomBorderDecoration) {
        editor.setDecorations(bottomBorderDecoration, []);
    }
    if (delimiterSeparatorDecoration) {
        editor.setDecorations(delimiterSeparatorDecoration, []);
    }
}

export function disposeDecorations(): void {
    highlightDecoration?.dispose();
    highlightDecoration = null;
    highlightKey = null;
    topBorderDecoration?.dispose();
    topBorderDecoration = null;
    bottomBorderDecoration?.dispose();
    bottomBorderDecoration = null;
    borderKey = null;
    delimiterSeparatorDecoration?.dispose();
    delimiterSeparatorDecoration = null;
    delimiterSeparatorKey = null;
}
