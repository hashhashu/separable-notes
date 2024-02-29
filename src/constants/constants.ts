const pkg = require('../../package.json');
import envPaths from 'env-paths';
import fs from 'fs';
import * as mkdir from 'make-dir';
import path from 'path';
import * as vscode from 'vscode'

export namespace Constants {
    /* extension */
    export const extensionName = pkg.name;
    export const extensionDisplayName = pkg.displayName;
    export const extensionVersion = pkg.version;

    /* output channel */
    export const outputChannelName: string = `${extensionDisplayName}`;
    export const NoteModeItems = ["Detached","Attached"];
    
    export const workspaceFolder = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) ?
    vscode.workspace.workspaceFolders[0].uri.fsPath:'';

    const separableNotes_paths = envPaths(`vscode-${process.env.EXT_NAMESPACE || 'separableNotes'}`, { suffix: null });
    if (!fs.existsSync(separableNotes_paths.data)) {
      mkdir.sync(separableNotes_paths.data);
    }
// sepNotes   @id = test1    // 222
    export const markdownFilePath = path.join(workspaceFolder,'.vscode','sepNotes.md');

    export const noteId = 'sepNotes ';

    export const keyNotes = 'separableNotes.notesKey';
}

export namespace Commands {
    export const reloadSettings = 'separableNotes.reloadSettings';
    export const test = 'separableNotes.test';
    export const NoteModeSwitch = 'separableNotes.NoteModeSwitch';
    export const detachAll = 'separableNotes.detachAll';
    export const attachAll = 'separableNotes.attachAll';
    export const noteIt = 'separableNotes.NoteIt';
    export const syncWithMdFile = 'separableNotes.syncWithMdFile';
}

export enum NoteMode{
  Detached = 0,   
  Attached = 1
}