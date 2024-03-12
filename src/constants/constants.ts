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
    export const sepNotesFileName = 'sepNotes.md';
    export const sepNotesFilePath = path.join(workspaceFolder,'.vscode',sepNotesFileName);
    export const sepNotesDiffFileName = 'sepNotes_diff.md';
    export const sepNotesDiffFilePath = path.join(workspaceFolder,'.vscode',sepNotesDiffFileName);
    
    const sepNotesFileHeadFix = `<!-- generated by vscode plugin [separable notes](https://github.com/hashhashu/separable-notes)  `;
    export const sepNotesFileHeadStatus = `attachedFileNum:#attachedFileNum    detachedFileNum:#detachedFileNum    refreshTime:#Time  `;
    export const sepNotesFileHead = sepNotesFileHeadFix +'\n' + sepNotesFileHeadStatus +'\n' + '-->  \n  \n';


    export const keyNotes = 'separableNotes.notesKey';
}

export namespace Commands {
    export const reloadSettings = 'separableNotes.reloadSettings';
    export const test = 'separableNotes.test';
    export const NoteModeSwitch = 'separableNotes.NoteModeSwitch';
    export const detachAll = 'separableNotes.detachAll';
    export const attachAll = 'separableNotes.attachAll';
    export const noteIt = 'separableNotes.NoteIt';
    export const syncMdWithSrc = 'separableNotes.syncMdWithSrc';
    export const openSepNotes = 'separableNotes.openSepNotes';
}
// sepNotes 1234523444  5555 666 7
export enum NoteMode{  Detached = 0,     Attached = 1}

