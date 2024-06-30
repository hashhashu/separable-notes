import {ExtensionContext,commands,workspace,window } from 'vscode';
import * as vscode from 'vscode';
import { logger } from "./logging/logger";
import { Constants, MdType, NoteMode } from "./constants/constants";
import { getConfiguration, Configuration } from "./configuration";
import { Activatable } from "./activatable";
import { Commands } from "./constants/constants";

import { isConfigurationChangeAware } from "./configurationChangeAware";
import {NoteBlock, NoteFile,serializableNoteFile} from './core/note'
import { addEof, splitIntoLines, getLineNumber,getSrcFileFromMd, getId, RateLimiter, cutNoteId, isSepNotesFile, getAnnoFromMd, rowsChanged, getMdPos, getLineNumberUp, getMdUserRandomNote, decode, getSrcFileFromLine, getMatchLineCount, getLineNumberDown, writeFile, canAttachFile, canSync, isSepNotesCatFile} from './utils/utils';
import * as fs from 'fs';
import { NestedTag } from './core/tag';
import { NotesCat } from './core/notesCat';

let configuration: Configuration;
let activatables: Array<Activatable> = new Array();
let Notes: Map<string,NoteFile> = new Map<string,NoteFile>();
let attachedFileNum = 0;
let detachedFileNum = 0;
let serializedNotes :Array<serializableNoteFile> = new Array<serializableNoteFile>() ;
let statusBarItem: vscode.StatusBarItem;
let inAll = false;
let ratelimiter:RateLimiter;
let ratelimiterSep:RateLimiter;
let ratelimiterUpdate:RateLimiter;
let mdLineChangeCount = 0;

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
        if(fs.existsSync(Constants.sepNotesFileOriPath)){
            fs.copyFileSync(Constants.sepNotesFileOriPath,Constants.sepNotesFilePath);
        }
        else{
            writeFile(Constants.sepNotesFilePath, Constants.sepNotesFileHead);
        }
    }
    if(!fs.existsSync(Constants.sepNotesCategoryFilePath)){
        writeFile(Constants.sepNotesCategoryFilePath, Constants.sepNotesCatDesc);
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

    ratelimiter = new RateLimiter(1,1000);
    ratelimiterSep = new RateLimiter(1,1000);
    ratelimiterUpdate = new RateLimiter(1,2000);
    
// sepNotes sync markdown #abcd/aba/def  with source and vice versa(**test123**)123 @order(13) 
// sepNotes 12312412434 #abcd/abafeccdeff2345212/cde **123** #ddef/d #hhhcde/abc  
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
                        else if(!note.canNoteIt()){
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
                                },1200);
                            }
                        }
                    }
                    function syncSrcWithMdAll(){
                        for(let contentChange of event.contentChanges){
                            mdLineChangeCount -= rowsChanged(contentChange);
                        }
                        for(let contentChange of event.contentChanges){
                            let startpos = contentChange.range.start.line;
                            let srcPath = getSrcFileFromMd(event.document, startpos);
                            logger.debug('changetext:'+contentChange.text);
                            logger.debug('startpos:'+startpos.toString()+' srcpath:'+srcPath+' endpos:'+contentChange.range.end.line.toString()+' mdLineChangeCount:'+mdLineChangeCount.toString());
                            if (fs.existsSync(srcPath)) {
                                let note = Notes.get(srcPath);
                                if (note && note.isAttached()) {
                                    let mdType;
                                    if(isSepNotesFile(event.document.uri.fsPath)){
                                        mdType = MdType.sepNotes;
                                    }
                                    else{
                                        mdType = MdType.sepNotesCat;
                                    }
                                    logger.debug('startpos:' + startpos.toString());
                                    let anno = getAnnoFromMd(event.document, startpos);
                                    logger.debug('text:' + anno.text + ' linenumber:' + anno.linenumber.toString());
                                    let linenumber = anno.linenumber;
                                    if (note.isMdLineChanged(mdType)) {
                                        linenumber = note.getMdLine(linenumber);
                                    }
                                    if(note.isMatch(linenumber,anno.codeBelow)){
                                        note.syncSrcWithMd(anno.text, linenumber,mdType);
                                        note.updateMdLine(anno.linenumber, rowsChanged(contentChange) + mdLineChangeCount, mdType);
                                        updateStateNote(extensionContext);
                                    }
                                    else{
                                        window.showWarningMessage('src file is not matched, need to refresh first');
                                    }
                                    logger.debug('linenumber:' + linenumber.toString() + ' rowschanged:' + rowsChanged(contentChange));
                                }
                                else {
                                    window.showWarningMessage('file:' + srcPath + ' is not attached, changes won\'t sync with src file');
                                }
                            }
                        }
                        mdLineChangeCount = 0;
                    }
                    // sync source with markdown
                    if(canSync(path) && !inAll){
                        for(let contentChange of event.contentChanges){
                            mdLineChangeCount += rowsChanged(contentChange);
                        }
                        if(ratelimiterSep.isAllowed()){
                            syncSrcWithMdAll();
                        }
                        else{
                            setTimeout(function () {
                                if (ratelimiterSep.isAllowed()) {
                                    syncSrcWithMdAll();
                                }
                            }, 1200);
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
            let str = '你好啊#呼呼 #12ab/哈哈哈/ **hello**';
            let matches = NestedTag.fetchTag(str);
            logger.debug(matches);
            logger.debug(NestedTag.fetchOutLineTag('# 123'));
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
      
// sepNotes ### mode switch(**test123**) @label(test123) @order(12.2) #abcd/cdb 
// sepNotes test  for itabc
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
            if(!canAttachFile(path)){
                vscode.window.showInformationMessage('cannot attach '+path);
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
                logger.debug('attachAll-------------------------');
                inAll = true;
                let ret;
                let hasDiff = false;
                attachedFileNum = 0;
                detachedFileNum = 0;
                //clear diff info
                writeFile(Constants.sepNotesDiffFilePath,'');
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

    function detachAll(){
        if (!inAll) {
            logger.debug('detachall executed');
            inAll = true;
            attachedFileNum = 0;
            detachedFileNum = 0;
            for (let [_, note] of Notes) {
                if (note.notFinished()) {
                    window.showInformationMessage('not finished yet');
                }
                else {
                    detachedFileNum += note.detachContent(true);
                }
            }
            activeEditor = vscode.window.activeTextEditor;
            updateState(activeEditor, extensionContext);
            window.showInformationMessage('detach all finished');
            updateMdStatus();
            inAll = false;
        }
    }

	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.detachAll, async () => {
            detachAll();
        }
	));
// sepNotes ### add comment and remove comment
	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.noteIt, async () => {
            activeEditor = vscode.window.activeTextEditor;
            let path = activeEditor.document.uri.fsPath;
            let note = Notes.get(path);
            if(note.canNoteIt() && canAttachFile(note.path)){
                note.noteMode = NoteMode.Attached;
                let start = activeEditor.selection.start.line;
                let end = activeEditor.selection.end.line + 1;
                // info about code below postion precise
                if(end < activeEditor.document.lineCount){
                    let codeBelow = activeEditor.document.lineAt(end).text;
                    if(codeBelow.trim().length == 0){
                        window.showInformationMessage('code below is empty line');
                    }
                    else{
                       let count = getMatchLineCount(activeEditor.document,codeBelow); 
                       if(count > 1){
                            window.showInformationMessage(`code below appears ${count} times in doc, the position can be adjusted appropriately`);
                       }  
                    }
                }
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
            logger.debug('syncMdWithSrc----------------------');
            fs.copyFileSync(Constants.sepNotesFilePath,Constants.sepNotesBakFilePath);
            let contentMd = Constants.sepNotesFileHead + getMdUserRandomNote();
            let contentMdCat = Constants.sepNotesCatDesc;
            let contentByCatAll:Map<string,string> = NotesCat.fetchDesc();
            let contentFetchRet:{"content":string,"contentByCat":Map<string,string>};
            let sortedCat:Array<string>;
            let notAttached = false;
            let lastNestedTag = new NestedTag();
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
                writeFile(Constants.sepNotesFilePath, contentMd);
                sortedCat = Array.from(contentByCatAll.keys());
                sortedCat.sort((a,b)=>NestedTag.compareNestedTag(a,b));
                for(let tag of sortedCat){
                    logger.debug('lastNestedTag:'+lastNestedTag.tags.join('/')+' tag:'+tag);
                    for(let outline of lastNestedTag.needAddOutLine(tag)){
                        contentMdCat += addEof(outline);
                    }
                    contentMdCat += contentByCatAll.get(tag);
                    lastNestedTag.setTags(tag);
                }
                writeFile(Constants.sepNotesCategoryFilePath, contentMdCat); 
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
                let mdType;
                if (isSepNotesFile(document.uri.fsPath)) {
                    mdType = MdType.sepNotes;
                }
                else {
                    mdType = MdType.sepNotesCat;
                }
                if(note && note.isMdLineChanged(mdType)){
                    let blockLineNumber = getLineNumberUp(document,line.lineNumber);
                    logger.debug('blockLineNumber:'+blockLineNumber.toString());
                    lineNumber = note.getMdLine(blockLineNumber);
                    logger.debug('lineNumber:'+lineNumber);
                }
                if(!note.isAttached()){
                    lineNumber = note.getDetachedLine(lineNumber);
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

	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.importNotes, async () => {
            if(!inAll){
                logger.debug('importNotes---------------');
                detachAll();
                inAll = true;
                let ret;
                let hasDiff = false;
                attachedFileNum = 0;
                detachedFileNum = 0;
                Notes.clear();
                let contentLines = splitIntoLines(decode(fs.readFileSync(Constants.sepNotesFilePath),'UTF-8'));
                let srcPath;
                let note:NoteFile;
                let block:NoteBlock;
                let anno = '';
                let fileStart = false;
                let inCode = false;
                let firstLine = true;
                let lineCount = 0;
                // read `sepNotes.md`
                for(let line of contentLines){
                    if(Constants.glineIdentity.isFileStart(line)){
                        srcPath = getSrcFileFromLine(line);
                        note = new NoteFile(srcPath,NoteMode.Detached,configuration,statusBarItem);
                        Notes.set(srcPath,note);
                        fileStart = true;
                        inCode = false;
                    }
                    else if(fileStart){
                        if(Constants.glineIdentity.isCodeStart(line)){
                            if(inCode){
                                inCode = false;
                            }
                            else{
                                inCode = true;
                                firstLine = true;
                            }
                        }
                        else if(!inCode){
                            if(anno.length > 0 || line.trim().length > 0){
                                anno += addEof('//' + configuration.noteId + line);
                                ++lineCount;
                            }
                        }
                        else if(firstLine){
                            let linenumber = getLineNumber(line);
                            block = new NoteBlock(linenumber,anno,lineCount,line.substring(linenumber.toString().length + 2));
                            note.blocks.push(block);
                            logger.debug('codeLine:'+block.codeLine+'\n note'+block.note+'\n codeLine'+block.codeLine+'\n noteLineCount'+block.noteLineCount);
                            firstLine = false;
                            lineCount = 0;
                            anno = '';
                        }
                    }
                }
                // like attach all-------
                //clear diff info
                writeFile(Constants.sepNotesDiffFilePath,'');
                for(let [_,note] of Notes){
                    ret = note.attachContent(true);
                    attachedFileNum += ret.attached;
                    if(ret.hasDiff){
                        hasDiff = true;
                     }
                }
                activeEditor = vscode.window.activeTextEditor;
                window.showInformationMessage('atach all finished');
                updateMdStatus();
                updateState(activeEditor,extensionContext);
                if(hasDiff){
                    vscode.window.showWarningMessage('codes have changed, please see the diff in ' + Constants.sepNotesDiffFileName);
                }
                inAll = false;
            }
        }
	));

	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.syncPos, async () => {
            logger.debug('syncPos start');
            activeEditor = vscode.window.activeTextEditor;
            if(!activeEditor){
                return;
            }
            let editorSepNotes:vscode.TextEditor = null;
            let editorSrc:vscode.TextEditor = null;
            // markdown
            if(canSync(activeEditor.document.uri.fsPath)){
                editorSepNotes = activeEditor;
                let curLine = 0;
                let range = editorSepNotes.selection;
                curLine = Math.floor((range.start.line + range.end.line) / 2);
                let path = getSrcFileFromMd(editorSepNotes.document, curLine);
                for(let editor of vscode.window.visibleTextEditors){
                    if(editor.document.uri.fsPath == path){
                        editorSrc = editor;
                        break;
                    }
                }
                if(!editorSrc){
                    vscode.window.showInformationMessage(path+' not visible');
                }
                else{
                    let srcLine = getLineNumberDown(editorSepNotes.document, curLine);
                    if(srcLine == -1){
                        srcLine = getLineNumberUp(editorSepNotes.document,curLine);
                    }
                    if(srcLine <= 0){
                        vscode.window.showInformationMessage('cannot fetch src line');
                    }
                    else{
                        let srcLineStart = srcLine;
                        let srcLineEnd = srcLine;
                        if (editorSrc.visibleRanges.length > 0) {
                            let range = editorSrc.visibleRanges[0];
                            let visLength = Math.floor((range.end.line - range.start.line) / 2);
                            srcLineStart = srcLine - visLength;
                            srcLineEnd = srcLine + visLength;
                        }
                        logger.debug('srcLine:' + srcLine.toString() + ' start:' + srcLineStart.toString() + ' end:' + srcLineEnd.toString());
                        editorSrc.revealRange(new vscode.Range(srcLineStart, 0, srcLineEnd, 0));
                    }
                }
            }
            // src
            else{
                editorSrc = activeEditor;
                for(let editor of vscode.window.visibleTextEditors){
                    if(editor.document.uri.fsPath.endsWith(Constants.sepNotesFileName)){
                        editorSepNotes = editor;
                        break;
                    }
                }
                if(!editorSepNotes){
                    vscode.window.showInformationMessage(Constants.sepNotesFileName+' is not visible');
                }
                else{
                    let path = editorSrc.document.uri.fsPath;
                    if (Notes.has(path)) {
                        let curLine = 0;
                        let range = editorSrc.selection;
                        logger.debug('src start:'+range.start.line.toString()+' end:'+range.end.line.toString());
                        curLine = Math.floor((range.start.line + range.end.line) / 2);

                        let mdLine = getMdPos(path, curLine);
                        let mdLineStart = mdLine;
                        let mdLineEnd = mdLine;
                        if(editorSepNotes.visibleRanges.length > 0){
                            let range = editorSepNotes.visibleRanges[0];
                            let visLength  = Math.floor((range.end.line - range.start.line)/2);
                            mdLineStart = mdLine - visLength;
                            mdLineEnd = mdLine + visLength; 
                        }
                        logger.debug('mdLine:'+mdLine.toString()+' start:'+mdLineStart.toString()+' end:'+mdLineEnd.toString());
                        editorSepNotes.revealRange(new vscode.Range(mdLineStart, 0, mdLineEnd, 0));
                    }
                    else if(!Notes.has(path) || !Notes.get(path).isAttached()){
                        vscode.window.showInformationMessage(path+' is not attached');
                    }
                }
            }
        }
    ));

    function showAttachStatus(){
        let activeEditor = vscode.window.activeTextEditor;
        if(activeEditor){
            updateState(activeEditor,extensionContext);
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
        }
    }
    setTimeout(showAttachStatus,3000);

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

function updateStateWrap(textEditor:vscode.TextEditor,extensionContext: ExtensionContext){
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

function updateState(textEditor:vscode.TextEditor,extensionContext: ExtensionContext){
    if(ratelimiterUpdate.isAllowed()){
        updateStateWrap(textEditor,extensionContext);
    }
    else{
        setTimeout(function(){
            if(ratelimiterUpdate.isAllowed()){
                updateStateWrap(textEditor,extensionContext);
            }
        },2200);
    }
}

function updateStateNote(extensionContext: ExtensionContext){
    serializedNotes.length = 0;
    for (let [_, note] of Notes) {
        if(note.haveNote()){
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
    writeFile(Constants.sepNotesFilePath,content);
}



