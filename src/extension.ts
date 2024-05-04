import {ExtensionContext,commands,workspace,window } from 'vscode';
import * as vscode from 'vscode';
import { logger } from "./logging/logger";
import { Constants, NoteMode } from "./constants/constants";
import { getConfiguration, Configuration } from "./configuration";
import { Activatable } from "./activatable";
import { Commands } from "./constants/constants";

import { isConfigurationChangeAware } from "./configurationChangeAware";
import {NoteFile,serializableNoteFile} from './core/note'
import { addEof, splitIntoLines, getLineNumber,getSrcFileFromMd, getId, RateLimiter, cutNoteId, isSepNotesFile, getAnnoFromMd, rowsChanged, getLineNumberDown, getLineNumberUp, getMdUserRandomNote, getKeyWordsFromSrc} from './utils/utils';
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
    if(!fs.existsSync(Constants.sepNotesCategoryFilePath)){
        fs.writeFileSync(Constants.sepNotesCategoryFilePath, Constants.sepNotesCatDesc);
    }

    let activeEditor = vscode.window.activeTextEditor;
    // restore state
    serializedNotes = extensionContext.workspaceState.get(Constants.keyNotes)??new Array<serializableNoteFile>();
    for(let note of serializedNotes){
        if(fs.existsSync(note.path)){
            Notes.set(note.path,new NoteFile(note.path,note.noteMode,configuration,statusBarItem,note.blocks,(note.needRefresh == null)?false:note.needRefresh));
        }
    }
    logger.info('workspace state restored');
    for(let [_,note] of Notes){
        if(note.isAttached()){
            attachedFileNum += 1;
            if(note.needRefresh){
                note.refresh(null,fetchMdStatus());
            }
        }
        else{
            detachedFileNum += 1;
        }
    }
    ratelimiter = new RateLimiter(1,200);

// sepNotes ## sync markdown with source and vice versa(**test123**)123
// sepNotes 12312412434
    extensionContext.subscriptions.push(
        workspace.onDidChangeTextDocument((event)=>{
            if (window.activeTextEditor && event.document === window.activeTextEditor.document) {
                if(event.contentChanges.length > 0){
                    let path = event.document.uri.fsPath;
                    if(Notes.has(path)){
                        let note = Notes.get(path);
                        // after detach or attach
                        let ret = note.afterDetachOrAttach();
                        if(ret >= 0){
                            if(ret == 0){
                                if(note.isAttached()){
                                    window.showInformationMessage('attach file: '+path+' over');
                                }
                                else{
                                    window.showInformationMessage('detach file: '+ path +' over');
                                }
                            }
                            if(note.needRefresh){
                                note.refresh(event.document,fetchMdStatus());
                            }
                        }
                        //warn modify
                        else if(note.shouldWarn()){
                            window.showWarningMessage('if you want to modify this file, please attach it first');
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
                                let linenumber = anno.linenumber;
                                if(note.isMdLineChanged()){
                                    linenumber = note.getMdLine(linenumber);
                                }
                                note.syncSrcWithMd(anno.text,linenumber);
                                note.updateMdLine(anno.linenumber,rowsChanged(contentChange));
                                updateStateNote(extensionContext);
                                logger.info('linenumber:'+linenumber.toString()+' rowschanged:'+rowsChanged(contentChange));
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
            let str = '你好啊**呼呼**哈哈哈**hello**';
            let matches = getKeyWordsFromSrc(str);
            logger.info(matches);
            // let path = activeEditor.document.uri.fsPath;
            // extensionContext.workspaceState.update(Constants.keyNotes,null);
            // let aa = await vscode.languages.getLanguages();
            // for(let a of aa){
            //     logger.info(a);
            // }
            // let id = getId('','@id= 123');
            // if(id){
            //     logger.info('id:'+id);
            // }
            // for(let [_,note] of Notes){
            //     logger.info('path:'+note.path);
            //     for(let id of note.ids){
            //         logger.info(id);
            //     }
            // }
            // logger.info(JSON.stringify(configuration.associations));
		}));
      
// sepNotes ### mode switch(**test12**)
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
                        let note = Notes.get(path);
                        let status = note.ModeSwitch(selected,activeEditor.document);
                        attachedFileNum += status;
                        detachedFileNum -= status;
                        updateState(activeEditor,extensionContext);
                        updateMdStatus();
                        if(note.isAttached()){
                            note.refresh(null,fetchMdStatus());
                        }
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
                    vscode.window.showWarningMessage('codes have changed, please see the diff in ' + Constants.sepNotesDiffFileName);
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
// sepNotes ### add comment and remove comment
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
// sepNotes ### hover for inline code
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
            let contentMd = Constants.sepNotesFileHead + getMdUserRandomNote();
            let contentMdCat = Constants.sepNotesCatDesc;
            let contentByCatAll:Map<string,string> = new Map<string,string>();
            let contentFetchRet:{"content":string,"contentByCat":Map<string,string>};
            let notAttached = false;
            for(let [_,note] of Notes){
                if(note.isAttached()){
                    contentFetchRet = note.fetchMdFromSrc();
                    contentMd += contentFetchRet.content;
                    for(let [key,value] of contentFetchRet.contentByCat){
                        if(!contentByCatAll.has(key)){
                            contentByCatAll.set(key,value);
                        }
                        else{
                            contentByCatAll.set(key,contentByCatAll.get(key) + value);
                        }
                    }
                }
                else if(note.blocks.length > 0){
                    notAttached = true;
                    break;
                }
            }
            if(notAttached){
                window.showInformationMessage('there are files not attached'); 
            }
            else{
                fs.writeFileSync(Constants.sepNotesFilePath, contentMd); 
                for(let [key,value] of contentByCatAll){
                    contentMdCat += ('# ' + addEof(key) + '  \n' + value);
                }
                fs.writeFileSync(Constants.sepNotesCategoryFilePath, contentMdCat); 
                window.showInformationMessage('sync with file '+Constants.sepNotesFileName+','+ Constants.sepNotesCategoryFileName +' success');
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
                if(note && isSepNotesFile(document.fileName) && note.isMdLineChanged()){
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

	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.openSepNotesDiff, async () => {
            vscode.workspace.openTextDocument(Constants.sepNotesDiffFilePath).then(document => {  
                vscode.window.showTextDocument(document);  
            }); 
        }
	));

	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.openSepNotesCat, async () => {
            vscode.workspace.openTextDocument(Constants.sepNotesCategoryFilePath).then(document => {  
                vscode.window.showTextDocument(document);  
            }); 
        }
	));    
    logger.debug('rematch:'+(configuration.reMatch?'true':'false'));
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
    updateStateNote(extensionContext);
}

function updateStateNote(extensionContext: ExtensionContext){
    serializedNotes.length = 0;
    for (let [_, note] of Notes) {
        if(note.shouldSave()){
            serializedNotes.push(new serializableNoteFile(note));
        }
    }
    extensionContext.workspaceState.update(Constants.keyNotes,serializedNotes);
}
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



