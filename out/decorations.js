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
exports.getHighlightDecorationType = getHighlightDecorationType;
exports.getBorderDecorationTypes = getBorderDecorationTypes;
exports.getDelimiterSeparatorDecorationType = getDelimiterSeparatorDecorationType;
exports.clearDecorations = clearDecorations;
exports.disposeDecorations = disposeDecorations;
const vscode = __importStar(require("vscode"));
let highlightDecoration = null;
let highlightKey = null;
let topBorderDecoration = null;
let bottomBorderDecoration = null;
let borderKey = null;
let delimiterSeparatorDecoration = null;
let delimiterSeparatorKey = null;
function getHighlightDecorationType(backgroundColor) {
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
function getBorderDecorationTypes(borderColor, topBorderWidth, bottomBorderWidth) {
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
function getDelimiterSeparatorDecorationType(color, width) {
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
function clearDecorations(editor) {
    if (!editor)
        return;
    if (highlightDecoration)
        editor.setDecorations(highlightDecoration, []);
    if (topBorderDecoration)
        editor.setDecorations(topBorderDecoration, []);
    if (bottomBorderDecoration)
        editor.setDecorations(bottomBorderDecoration, []);
    if (delimiterSeparatorDecoration)
        editor.setDecorations(delimiterSeparatorDecoration, []);
}
function disposeDecorations() {
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
//# sourceMappingURL=decorations.js.map