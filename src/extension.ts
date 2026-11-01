// The VS Code side of the extension: it decides when to repaint, and draws the
// marks that findMarks.ts finds.

import * as vscode from 'vscode';
import { findMarks, type Mark } from './findMarks.ts';
import { isKitProject } from './kitProject.ts';
import { shouldScan } from './svelteNames.ts';

// The kinds of file that can hold Svelte or SvelteKit code.
const LANGUAGES = ['svelte', 'javascript', 'typescript', 'html'];

// A color people can change in their settings. Its defaults are in package.json:
// violet, #8B5CF6, plus two digits for the opacity. 2E is 18% and 42 is 26%.
// Light themes get the weaker one, because a tint on white makes colored text
// harder to read.
const MARKER_COLOR = new vscode.ThemeColor('svelteMarker.background');

// How long to wait after a keystroke before repainting.
const TYPING_PAUSE_MS = 150;

// VS Code calls this once, the first time a file in one of those languages opens.
export function activate(context: vscode.ExtensionContext) {
  // A decoration type is a reusable style for overlays on the text. It sets a
  // background only, so the theme's text colors stay as they are.
  const marker = vscode.window.createTextEditorDecorationType({
    borderRadius: '3px',
    backgroundColor: MARKER_COLOR,
    // Stops a mark from stretching when you type right at its edge.
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });

  // On or off. globalState survives restarting VS Code.
  let enabled = context.globalState.get('enabled', true);

  // Each file's last complete set of marks. VS Code drops a tab's decorations
  // when it's hidden, so we need these if it comes back with broken code.
  const lastGoodMarks = new Map<string, Mark[]>();

  let typingTimer: NodeJS.Timeout | undefined;

  function paint(editor: vscode.TextEditor, afterEdit: boolean) {
    const { document } = editor;
    if (!LANGUAGES.includes(document.languageId)) return;

    const text = document.getText();
    // Only a file on disk has a package.json to look at.
    const inKitProject = document.uri.scheme !== 'file' || isKitProject(document.fileName);
    if (!enabled || !shouldScan(document.fileName, text, inKitProject)) {
      editor.setDecorations(marker, []);
      return;
    }

    const key = document.uri.toString();
    const { marks, complete } = findMarks(text, document.fileName, inKitProject);
    if (complete) lastGoodMarks.set(key, marks);

    // Mid-typing the code is often half-written. Leave the marks alone: VS Code
    // moves them along with your edits, and we catch up once the code is valid.
    // A file that has never parsed whole, like one with <script lang="coffee">,
    // has nothing to catch up to, so it repaints with what did parse.
    if (!complete && afterEdit && lastGoodMarks.has(key)) return;

    const marksToPaint = complete ? marks : (lastGoodMarks.get(key) ?? marks);
    const ranges = marksToPaint.map(
      (mark) => new vscode.Range(document.positionAt(mark.start), document.positionAt(mark.end)),
    );
    editor.setDecorations(marker, ranges);
  }

  function paintVisibleEditors(afterEdit: boolean) {
    for (const editor of vscode.window.visibleTextEditors) paint(editor, afterEdit);
  }

  async function toggle() {
    enabled = !enabled;
    await context.globalState.update('enabled', enabled);
    paintVisibleEditors(false);
    vscode.window.setStatusBarMessage(`Svelte Marker: ${enabled ? 'on' : 'off'}`, 2000);
  }

  // Everything in this list is cleaned up when the extension shuts down.
  context.subscriptions.push(
    marker,
    vscode.commands.registerCommand('svelteMarker.toggle', toggle),

    // A tab was opened or shown, or an editor was split.
    vscode.window.onDidChangeVisibleTextEditors(() => paintVisibleEditors(false)),

    // Wait for a pause in typing, so we don't reparse on every keystroke.
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!LANGUAGES.includes(event.document.languageId)) return;
      if (event.contentChanges.length === 0) return;
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => paintVisibleEditors(true), TYPING_PAUSE_MS);
    }),

    vscode.workspace.onDidCloseTextDocument((document) => {
      lastGoodMarks.delete(document.uri.toString());
    }),
  );

  paintVisibleEditors(false);
}
