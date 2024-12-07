const pkg = require('../../package.json');
import envPaths from 'env-paths';
import fs from 'fs';
import * as mkdir from 'make-dir';
import path from 'path';
import * as vscode from 'vscode'
import { LineIdentity } from '../core/LineIdentity';

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
    const sepNotesRootPath = path.join(workspaceFolder,'.vscode','sepNotes');
    if(!fs.existsSync(sepNotesRootPath)){
      mkdir.sync(sepNotesRootPath);
    }
    export const sepNotesFileName = 'sepNotes.md';
    export const sepNotesFilePath = path.join(sepNotesRootPath,sepNotesFileName);
    export const sepNotesFileOriPath = path.join(workspaceFolder,'.vscode',sepNotesFileName);
    export const sepNotesDiffFileName = 'sepNotes_diff.md';
    export const sepNotesDiffFilePath = path.join(sepNotesRootPath,sepNotesDiffFileName);
    export const sepNotesCategoryFileName = 'sepNotes_category.md';
    export const sepNotesCategoryFilePath = path.join(sepNotesRootPath,sepNotesCategoryFileName);
    export const sepNotesBakFileName = 'sepNotes_bak.md';
    export const sepNotesBakFilePath = path.join(sepNotesRootPath,sepNotesBakFileName);
    
    const sepNotesFileHeadFix = `<!-- generated by vscode plugin [separable notes](https://github.com/hashhashu/separable-notes)  `;
    export const sepNotesFileHeadStatus = `attachedFileNum:#attachedFileNum    detachedFileNum:#detachedFileNum    refreshTime:#Time  `;
    export const sepNotesFileHead = sepNotesFileHeadFix +'\n' + sepNotesFileHeadStatus +'\n' + '-->  \n  \n';
    export const sepNotesUserNote = '# userContent\n  ';
    export const sepNotesCatDesc = sepNotesFileHeadFix + '  \n' + 'notes can be categorized as (#xxx/abc) like other nested tags, order can be adjusted via tree view in the sidebar  )' + '-->  \n  \n';

    export const keyNotes = 'separableNotes.notesKey';
    export const TagOrder = 'separableNotes.tagOrder';

    export const glineIdentity = new LineIdentity();

    export const normalTag = '##################';
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
    export const openSepNotesDiff = 'separableNotes.openSepNotesDiff';
    export const openSepNotesCat = 'separableNotes.openSepNotesCat';
    export const importNotes = 'separableNotes.importNotes';
    export const jumpToNoteLine = 'separableNotes.jumpToNoteLine';
    export const refresh = 'separableNotes.refresh';
    export const refreshSepNotes = 'separableNotes.refreshSepNotes';
    export const MoveUp = 'separableNotes.MoveUp';
    export const MoveDown = 'separableNotes.MoveDown';
    export const filterTag = 'separableNotes.filterTag';
    export const MoveLeft = 'separableNotes.MoveLeft';
    export const MoveRight = 'separableNotes.MoveRight';
    export const copyTag = 'separableNotes.copyTag'; 
    export const copyOutline = 'separableNotes.copyOutline'; 
    export const rename = 'separableNotes.rename'; 
}
export enum NoteMode{  Detached = 0,     Attached = 1}
export enum MdType{ None = 0, sepNotes = 1, sepNotesCat = 2 }
export enum OutLineItemType{Tag = 0, codeBlock = 1, TagAndCode = 2}
