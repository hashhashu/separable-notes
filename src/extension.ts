import {ExtensionContext,commands,workspace,window } from 'vscode';
import * as vscode from 'vscode';
import { logger } from "./logging/logger";
import { Constants, NoteMode } from "./constants/constants";
import { getConfiguration, Configuration } from "./configuration";
import { Activatable } from "./activatable";
import { Commands } from "./constants/constants";

import { isConfigurationChangeAware } from "./configurationChangeAware";
import {NoteFile,serializableNoteFile} from './core/note'
import { addEof, splitIntoLines, getLineNumber,getSrcFileFromMd, getId, RateLimiter, cutNoteId, isSepNotesFile, getAnnoFromMd, rowsChanged, getLineNumberDown, getLineNumberUp} from './utils/utils';
import * as fs from 'fs';

let configuration: Configuration;
let activatables: Array<Activatable> = new Array();
let Notes: Map<string,NoteFile> = new Map<string,NoteFile>();
let attachedFileNum = 0;
let detachedFileNum = 0;
let serializedNotes :Array<serializableNoteFile> = new Array<serializableNoteFile>() ;
let statusBarItem: vscode.StatusBarItem;
let inAll = false;
let ratelimiter:RateLimiter;

export async function activate(extensionContext: ExtensionContext): Promise<boolean> {
    logger.info(
        `Activating extension ${Constants.extensionName} v${Constants.extensionVersion}...`
    );
	configuration = getConfiguration(extensionContext);
    logger.setLogLevel(configuration.logLevel);

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    extensionContext.subscriptions.push(statusBarItem);
    statusBarItem.command = Commands.NoteModeSwitch;
    statusBarItem.text = 'Detached';
    statusBarItem.show();

    if(!fs.existsSync(Constants.sepNotesFilePath)){
        fs.writeFileSync(Constants.sepNotesFilePath, Constants.sepNotesFileHead);
    }

    let activeEditor = vscode.window.activeTextEditor;
    // restore state
    serializedNotes = extensionContext.workspaceState.get(Constants.keyNotes)??new Array<serializableNoteFile>();
    for(let note of serializedNotes){
        if(fs.existsSync(note.path)){
            Notes.set(note.path,new NoteFile(note.path,note.noteMode,configuration,statusBarItem,note.blocks));
        }
    }
    for(let [_,note] of Notes){
        note.refreshId();
        if(note.isAttached()){
            attachedFileNum += 1;
        }
        else{
            detachedFileNum += 1;
        }
    }
    ratelimiter = new RateLimiter(1,200);

// sepNotes ## sync markdown with source and vice versa
    extensionContext.subscriptions.push(
        workspace.onDidChangeTextDocument((event)=>{
            if (window.activeTextEditor && event.document === window.activeTextEditor.document) {
                if(event.contentChanges.length > 0){
                    let path = event.document.uri.fsPath;
                    if(!inAll && Notes.has(path)){
                        let note = Notes.get(path);
                        let ret = note.afterDetach();
                        if(ret >= 0){
                            if(ret == 0){
                                if(note.isAttached()){
                                    window.showInformationMessage('attach file: '+path+' over');
                                }
                                else{
                                    window.showInformationMessage('detach file: '+ path +' over');
                                }
                            }
                        }
                        else if(note.shouldWarn()){
                            window.showWarningMessage('if you want modify this file, please attach it first');
                        }
                        // sync markdown with source
                        else if(note.isAttached()){
                            if(ratelimiter.isAllowed()){
                                note.refresh(event.document,fetchMdStatus());
                            }
                            else{
                                setTimeout(function(){
                                    if(ratelimiter.isAllowed()){
                                        note.refresh(event.document,fetchMdStatus());
                                    }
                                },500);
                            }
                        }
                    }
                    // sync source with markdown
                    if(isSepNotesFile(path)){
                        for(let contentChange of event.contentChanges){
                            logger.debug(contentChange.text);
                            logger.debug(contentChange.rangeLength.toString());
                            let startpos = contentChange.range.start.line;
                            let srcPath = getSrcFileFromMd(event.document,startpos);
                            let note = Notes.get(srcPath);
                            if(note){
                                logger.debug('startpos:'+startpos.toString());
                                let anno = getAnnoFromMd(event.document,startpos);
                                logger.debug('text:'+anno.text+' linenumber:'+anno.linenumber.toString());
                                note.syncSrcWithMd(anno.text,anno.linenumber);
                                let linenumber = getLineNumberDown(event.document,startpos);
                                logger.debug('getLineNumberDown:'+linenumber);
                                note.updateMdLine(linenumber,rowsChanged(contentChange));
                            }
                        }
                    }
                }
            }
        })
    );
    
    extensionContext.subscriptions.push(
        workspace.onDidDeleteFiles((event)=>{
            for(let file of event.files){
                if(Notes.has(file.fsPath)){
                    Notes.delete(file.fsPath);
                }
            }
        })
    );

    extensionContext.subscriptions.push(
        window.onDidChangeActiveTextEditor((textEditor)=>{
            if (typeof textEditor === "undefined") {
                return;
            }
            updateState(textEditor,extensionContext);
        })
    );
    
    extensionContext.subscriptions.push(
        commands.registerCommand(Commands.reloadSettings, () => {
            for (let activatable of activatables) {
                if (isConfigurationChangeAware(activatable)) {
                    activatable.onConfigurationChange(configuration);
                }
            }
        })
    );
    extensionContext.subscriptions.push(
        workspace.onDidChangeConfiguration(() => {
            commands.executeCommand(Commands.reloadSettings);
        })
    );
    

	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.test, async () => {
			window.showInformationMessage('Hello World from tiger! well well ');
            let path = activeEditor.document.uri.fsPath;
            // extensionContext.workspaceState.update(Constants.keyNotes,null);
            // let aa = await vscode.languages.getLanguages();
            // for(let a of aa){
            //     logger.info(a);
            // }
            // let id = getId('','@id= 123');
            // if(id){
            //     logger.info('id:'+id);
            // }
            for(let [_,note] of Notes){
                logger.info('path:'+note.path);
                for(let id of note.ids){
                    logger.info(id);
                }
            }
            // logger.info(JSON.stringify(configuration.associations));
		}));

// sepNotes ## mode switch
// sepNotes test  for it
	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.NoteModeSwitch, async () => {
            activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return;
            }
            let path = activeEditor.document.uri.fsPath;
            if(!fs.existsSync(path)){
                return;
            }
            if(isSepNotesFile(path)){
                vscode.window.showInformationMessage('cannot attach '+Constants.sepNotesFileName);
                return;
            }
            if(!Notes.has(path)){
                Notes.set(path,new NoteFile(path,NoteMode.Detached,configuration,statusBarItem));
                ++detachedFileNum;
            }
            if(!inAll && Notes.has(path) && !Notes.get(path).notFinished()){
                vscode.window.showQuickPick(
                    Constants.NoteModeItems,
                    {
                        canPickMany: false,
                        matchOnDescription: false,
                        placeHolder: "note mode"
                    }
                ).then(async selected => {
                    if (typeof selected !== "undefined") {
                        let status = Notes.get(path).ModeSwitch(selected,activeEditor.document);
                        attachedFileNum += status;
                        detachedFileNum -= status;
                        updateState(activeEditor,extensionContext);
                        updateMdStatus();
                    }
                });
            }
        }
	));
	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.attachAll, async () => {
            if(!inAll){
                inAll = true;
                let ret;
                let hasDiff = false;
                attachedFileNum = 0;
                detachedFileNum = 0;
                //clear diff info
                fs.writeFileSync(Constants.sepNotesDiffFilePath,'');
                for(let [_,note] of Notes){
                    if(note.notFinished()){
                        window.showInformationMessage('not finished yet');
                    }
                    else{
                        ret = note.attachContent(true);
                        attachedFileNum += ret.attached;
                        if(ret.hasDiff){
                            hasDiff = true;
                        }
                    }
                }
                activeEditor = vscode.window.activeTextEditor;
                updateState(activeEditor,extensionContext);
                window.showInformationMessage('atach all finished');
                updateMdStatus();
                if(hasDiff){
                    const options = ['View Diff File'];
                    switch (await vscode.window.showWarningMessage('codes have changed, please see the diff in ' 
                            + Constants.sepNotesDiffFilePath, ...options)){
                        case 'View Diff File':
                            vscode.workspace.openTextDocument(Constants.sepNotesFilePath);
                    }
                }
                inAll = false;
            }
        }
	));

	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.detachAll, async () => {
            if(!inAll){
                inAll = true;
                attachedFileNum = 0;
                detachedFileNum = 0;
                for(let [_,note] of Notes){
                    if(note.notFinished()){
                        window.showInformationMessage('not finished yet');
                    }
                    else{
                        detachedFileNum += note.detachContent(true);
                    }
                }
                activeEditor = vscode.window.activeTextEditor;
                updateState(activeEditor,extensionContext);
                window.showInformationMessage('detach all finished');
                updateMdStatus();
                inAll = false;
            }
        }
	));
// sepNotes ## add comment and remove comment
	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.noteIt, async () => {
            activeEditor = vscode.window.activeTextEditor;
            updateState(activeEditor,extensionContext);
            let path = activeEditor.document.uri.fsPath;
            if(Notes.get(path).isAttached()){
                let start = activeEditor.selection.start.line;
                let end = activeEditor.selection.end.line + 1;
                let range = new vscode.Range(start,0,end,0);
                let content = activeEditor.document.getText(range);
                let lines = splitIntoLines(content);
                let allAdd = true;
                let noteId = configuration.noteId;
                for(let line of lines){
                    if(!line.includes(noteId)){
                        allAdd = false;
                        break;
                    }
                }
                let contentNew = '';
                if(allAdd){
                    for(let line of lines){
                        contentNew += addEof(line.replace(new RegExp(noteId,'g'),''));
                    }
                }
                else{
                    for(let line of lines){
                        if(!line.includes(noteId)){
                            contentNew += addEof(noteId + line);
                        } 
                        else{
                            contentNew += addEof(line);
                        }
                    }
                }
                let selection = activeEditor.selection;
                activeEditor.edit(editBuilder => {  
                    editBuilder.replace(range,contentNew);  
                }).then(success => {  
                    if (!success) {  
                        logger.error('edit failed');  
                    } 
                });
                // vscode.Selection.apply(range);
                activeEditor.selection = selection;
                if(!allAdd){
                    vscode.commands.executeCommand('editor.action.addCommentLine');
                }
                else{
                    vscode.commands.executeCommand('editor.action.removeCommentLine');
                }
                activeEditor.selection = new vscode.Selection(selection.start.line, Number.MAX_SAFE_INTEGER, selection.start.line, Number.MAX_SAFE_INTEGER);
            }
            else{
                window.showInformationMessage('please attach it first before add note');
            }
            updateState(activeEditor,extensionContext);
        }
	));


// sepNotes ## hover for inline code
    function provideHover(document:vscode.TextDocument, position:vscode.Position, token){
        let path = document.uri.fsPath;
        if(!Notes.has(path) || !Notes.get(path).isAttached()){
            return;
        }
        let curLine = position.line;
        let curContent = document.lineAt(curLine).text;
        if(curContent.includes(configuration.noteId)){
            // 往上
            let lineTop = curLine;
            for(let i = curLine - 1;i >= 0; i--){
                if(!document.lineAt(i).text.includes(configuration.noteId)){
                    lineTop = i + 1;   
                    break;
                }
            }
            // 往下
            let lineDown = curLine + 1;
            for(let i = curLine + 1;i < document.lineCount; i++){
                if(!document.lineAt(i).text.includes(configuration.noteId)){
                    lineDown = i;   
                    break;
                }
            }
            let range = new vscode.Range(new vscode.Position(lineTop,0),new vscode.Position(lineDown,0));
            let content = document.getText(range);
            let lines = splitIntoLines(content);
            let cutContent = '';
            for(let line of lines){
                cutContent += addEof(cutNoteId(line,configuration.noteId));
            }
            let mds:vscode.MarkdownString = new vscode.MarkdownString;
            mds.appendMarkdown(cutContent);
            return new vscode.Hover(mds,range);
        }
    }
    
	extensionContext.subscriptions.push(
        vscode.languages.registerHoverProvider({ scheme: 'file'},{provideHover})
    );
	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.syncMdWithSrc, async () => {
            let content = Constants.sepNotesFileHead;
            let notAttached = false;
            for(let [_,note] of Notes){
                if(note.isAttached())
                    content += note.exportToMd();
                else if(note.blocks.length > 0){
                    notAttached = true;
                    break;
                }
            }
            if(notAttached){
                window.showInformationMessage('there are files not attached'); 
            }
            else{
                fs.writeFileSync(Constants.sepNotesFilePath, content);
                window.showInformationMessage('sync with file ./vscode/'+Constants.sepNotesFileName+' success');
            }
            updateMdStatus();
        }
	));
    
    //markdown definition in src file 
    function provideDefinition(document:vscode.TextDocument, position:vscode.Position, token) {
        const line		= document.lineAt(position);
        let lineNumber = getLineNumber(line.text);
        let filePath = '';
        if(lineNumber > 0){
            filePath = getSrcFileFromMd(document,line.lineNumber);
            if((filePath != '') && fs.existsSync(filePath)){
                let note = Notes.get(filePath);
                if(note && note.isMdLineChanged()){
                    let blockLineNumber = getLineNumberUp(document,line.lineNumber);
                    logger.debug('blockLineNumber:'+blockLineNumber.toString());
                    lineNumber = note.getMdLine(blockLineNumber);
                    logger.debug('lineNumber:'+lineNumber);
                }
                return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(lineNumber - 1, position.character - 2 - lineNumber.toString().length));
            }
        }
        let id = getId(line.text,false,configuration.noteId);
        if(id){
            for(let [_,note] of Notes){
                let ret = note.matchId(id);
                if(ret.line > 0){
                    return new vscode.Location(vscode.Uri.file(note.path), new vscode.Position(ret.line - 1, 0));
                }
            }
        }
    }
    

    extensionContext.subscriptions.push(vscode.languages.registerDefinitionProvider(['markdown'],{
        provideDefinition
        })
    );

    // markdown completion for id in src
    function provideCompletionItems(document:vscode.TextDocument, position:vscode.Position, token, context) {
        let ret: vscode.CompletionItem[] = new Array();
        for (let [_, note] of Notes) {
            for (let id of note.getIds()) {
                logger.debug(id.note);
                ret.push(new vscode.CompletionItem('#'+configuration.noteId+'@refid=' + id.note, vscode.CompletionItemKind.Field));
            }
        }
        return ret;
    }
    extensionContext.subscriptions.push(vscode.languages.registerCompletionItemProvider(['markdown'],{
        provideCompletionItems
        },'@')
    );

    for (let activatable of activatables) {
        activatable.activate(extensionContext);
    }

	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.openSepNotes, async () => {
            vscode.workspace.openTextDocument(Constants.sepNotesFilePath).then(document => {  
                vscode.window.showTextDocument(document);  
            }); 
        }
	));
// sepNotes ## src and markdown file alignment
    extensionContext.subscriptions.push(
        vscode.window.onDidChangeTextEditorVisibleRanges(event => {
            if (event && event.textEditor && event.textEditor.document && fs.existsSync(event.textEditor.document.uri.fsPath)) {
            logger.debug('onDidChangeVisibleTextEditors start');
            // markdown file visible
            let editorSepNotes:vscode.TextEditor = null;
            let editorSrc:vscode.TextEditor = null;
            for(let editor of vscode.window.visibleTextEditors){
                logger.debug('visible doc'+editor.document.uri.fsPath);
                if(editor.document.uri.fsPath.endsWith(Constants.sepNotesFileName)){
                    editorSepNotes = editor;
                    logger.debug('sepnots visible');
                }
                else if(Notes.has(editor.document.uri.fsPath)){
                    editorSrc = editor;
                }
            } 
            if(editorSepNotes && editorSrc){
                let path = event.textEditor.document.uri.fsPath;
                logger.debug('path change:' + path);
                // source changed
                if (!isSepNotesFile(path) && Notes.has(path)) {
                    // logger.info('come here?');
                    // let curLine = 0;
                    // if (event.visibleRanges.length > 0) {
                    //     let range = event.visibleRanges[0];
                    //     curLine = Math.floor((range.start.line + range.end.line) / 2);
                    // }
                    // let mdLine = getMdPos(path, curLine);
                    // let mdLineStart = mdLine;
                    // let mdLineEnd = mdLine;
                    // if(editorSepNotes.visibleRanges.length > 0){
                    //     let range = editorSepNotes.visibleRanges[0];
                    //     let visLength  = Math.floor((range.end.line - range.start.line)/2);
                    //     mdLineStart = mdLine - visLength;
                    //     mdLineEnd = mdLine + visLength; 
                    // }
                    // logger.info('mdLine:'+mdLine.toString()+' start:'+mdLineStart.toString()+' end:'+mdLineEnd.toString());
                    // editorSepNotes.revealRange(new vscode.Range(mdLineStart, 0, mdLineEnd, 0));
                }
                // markdown changed
                else if(isSepNotesFile(path)){
                    let curLine = 0;
                    if (event.visibleRanges.length > 0) {
                        let range = event.visibleRanges[0];
                        curLine = Math.floor((range.start.line + range.end.line) / 2);
                    }
                    let path = getSrcFileFromMd(event.textEditor.document,curLine);
                    let srcLine = getLineNumberUp(event.textEditor.document,curLine);
                    let srcLineStart = srcLine;
                    let srcLineEnd = srcLine;
                    if(path == editorSrc.document.uri.fsPath){
                        if(editorSrc.visibleRanges.length > 0){
                            let range = editorSrc.visibleRanges[0];
                            let visLength  = Math.floor((range.end.line - range.start.line)/2);
                            srcLineStart = srcLine - visLength;
                            srcLineEnd = srcLine + visLength; 
                        }
                        logger.debug('srcLine:'+srcLine.toString()+' start:'+srcLineStart.toString()+' end:'+srcLineEnd.toString());
                        editorSrc.revealRange(new vscode.Range(srcLineStart, 0, srcLineEnd, 0));
                    }
                }
            }
        }
        })
    );

    logger.info(`Extension ${Constants.extensionName} v${Constants.extensionVersion} activated.`);
    return Promise.resolve(true);
}

export function deactivate() {
	for (let activatable of activatables) {
        activatable.deactivate();
    }
    activatables = new Array();
}

function updateState(textEditor:vscode.TextEditor,extensionContext: ExtensionContext){
    if (!textEditor) {
        return;
    }
    let path = textEditor.document.uri.fsPath;
    if(!fs.existsSync(path)){
        return;
    }
    if (!Notes.has(path)) {
        Notes.set(path, new NoteFile(path, NoteMode.Detached, configuration, statusBarItem));
        ++detachedFileNum;
    }
    Notes.get(path).setStatusBarItemText();

    serializedNotes.length = 0;
    for (let [_, note] of Notes) {
        if(note.shouldSave()){
            serializedNotes.push(new serializableNoteFile(note));
        }
    }
    extensionContext.workspaceState.update(Constants.keyNotes,serializedNotes);
}
// sepNotes 12345678
// sepNotes 12345678
function fetchMdStatus():string{
    let status = Constants.sepNotesFileHeadStatus;
    status = status.replace('#attachedFileNum',attachedFileNum.toString());
    status = status.replace('#detachedFileNum',detachedFileNum.toString());

    let now = new Date();
    status = status.replace('#Time',now.toLocaleDateString()+'  '+now.toLocaleTimeString());
    return status;
}

function updateMdStatus(){
    let content = fs.readFileSync(Constants.sepNotesFilePath).toString();
    let status = Constants.sepNotesFileHeadStatus;
    status = status.replace('#attachedFileNum',attachedFileNum.toString());
    status = status.replace('#detachedFileNum',detachedFileNum.toString());

    let now = new Date();
    status = status.replace('#Time',now.toLocaleDateString()+'  '+now.toLocaleTimeString());
    let lines = splitIntoLines(content);
    lines[1] = status;
    content = lines.join('\n');
    logger.debug('updateMdStatus:'+status);
    fs.writeFileSync(Constants.sepNotesFilePath,content);
}



