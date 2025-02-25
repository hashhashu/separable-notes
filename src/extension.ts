import {ExtensionContext,commands,workspace,window } from 'vscode';
import * as vscode from 'vscode';
import { logger } from "./logging/logger";
import { Constants, MdType, NoteMode, OutLineItemType, RenameType } from "./constants/constants";
import { getConfiguration, Configuration } from "./configuration";
import { Activatable } from "./activatable";
import { Commands } from "./constants/constants";

import { isConfigurationChangeAware } from "./configurationChangeAware";
import {NoteBlock, NoteFile,serializableNoteFile} from './core/note'
import { addEof, splitIntoLines, getLineNumber,getSrcFileFromMd, RateLimiter, isSepNotesFile, getAnnoFromMd, rowsChanged, getLineNumberUp, getMdUserRandomNote, decode, getSrcFileFromLine, getMatchLineCount, getLineNumberDown, writeFile, canAttachFile, canSync, getRelativePath, isSepNotesCatFile, joinEof} from './utils/utils';
import * as fs from 'fs';
import { NestedTag } from './core/tag';
import { NotesCat } from './core/notesCat';
import { FileOutLineDragAndDrop, FileOutLineProvider, OutLineItem, TagOutLineDragAndDrop, TagOutLineProvider } from './core/treeView';
import { NoteFileTree } from './core/noteFileTree';
import { NoteId, TimeType } from './core/noteId';

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
let ratelimiterChangeSelection:RateLimiter;
let mdLineChangeCount = 0;
let tagOutLineProvider:TagOutLineProvider;
let tagOutLineTreeView:vscode.TreeView<OutLineItem>;
let tagOutLineDragAndDrop:TagOutLineDragAndDrop;
let fileOutLineProvider:FileOutLineProvider;
let fileOutLineTreeView:vscode.TreeView<OutLineItem>;
let fileOutLineDragAndDrop:FileOutLineDragAndDrop;
let tagJumpPos:number = 0;
let Jumped:boolean = false;

export async function activate(extensionContext: ExtensionContext): Promise<boolean> {
    logger.info(
        `Activating extension ${Constants.extensionName} v${Constants.extensionVersion}...`
    );
	configuration = getConfiguration(extensionContext);
    logger.setLogLevel(configuration.logLevel);

    if(!fs.existsSync(Constants.sepNotesFilePath)){
        writeFile(Constants.sepNotesFilePath, Constants.sepNotesFileHead);
    }
    if(!fs.existsSync(Constants.sepNotesCategoryFilePath)){
        writeFile(Constants.sepNotesCategoryFilePath, Constants.sepNotesCatDesc);
    }

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    extensionContext.subscriptions.push(statusBarItem);
    statusBarItem.command = Commands.NoteModeSwitch;
    statusBarItem.text = 'Detached';
    statusBarItem.show();

    tagOutLineProvider = new TagOutLineProvider();
    tagOutLineDragAndDrop = new TagOutLineDragAndDrop();
    tagOutLineTreeView = vscode.window.createTreeView('tagOutLine', {
        treeDataProvider: tagOutLineProvider, showCollapseAll: true, manageCheckboxStateManually:true,
        dragAndDropController:tagOutLineDragAndDrop
    });
    vscode.commands.registerCommand(Commands.refresh, () => {
        vscode.commands.executeCommand(Commands.syncMdWithSrc);
    });
    NotesCat.extensionContext = extensionContext;
    NotesCat.tagOutLineProvider = tagOutLineProvider;
    NotesCat.refresh();

    NoteId.extensionContext = extensionContext;
    NoteId.load();

    fileOutLineProvider = new FileOutLineProvider();
    fileOutLineDragAndDrop = new FileOutLineDragAndDrop();
    fileOutLineTreeView = vscode.window.createTreeView('fileOutLine', {
        treeDataProvider: fileOutLineProvider, showCollapseAll: true, manageCheckboxStateManually:true,
        dragAndDropController:fileOutLineDragAndDrop, canSelectMany: true
    });
    NoteFileTree.fileOutLineProvider = fileOutLineProvider;
    vscode.commands.registerCommand(Commands.refreshSepNotes, () => {
       vscode.commands.executeCommand(Commands.syncMdWithSrc); 
    });

    NoteId.noteId = configuration.noteId;

    let activeEditor = vscode.window.activeTextEditor;
    // restore state
    serializedNotes = extensionContext.workspaceState.get(Constants.keyNotes)??new Array<serializableNoteFile>();
    for(let note of serializedNotes){
        if(fs.existsSync(note.path)){
            Notes.set(note.path,new NoteFile(note.path,note.noteMode,configuration,statusBarItem,note.blocks,(note.needRefresh == null)?false:note.needRefresh,
                                        (note.noteLineIdMax == null)?0:note.noteLineIdMax));
        }
    }
    logger.info('workspace state restored');

    ratelimiter = new RateLimiter(1,1000);
    ratelimiterSep = new RateLimiter(1,1000);
    ratelimiterUpdate = new RateLimiter(1,2000);
    ratelimiterChangeSelection = new RateLimiter(1,1000);
    
    extensionContext.subscriptions.push(
// sepNotes@id80 ### sync markdown with source and vice versa #changeEvent/content
        workspace.onDidChangeTextDocument((event)=>{
            if (window.activeTextEditor && event.document === window.activeTextEditor.document) {
                if(event.contentChanges.length > 0){
                    // sync markdown with source files
                    let path = event.document.uri.fsPath;
                    if(Notes.has(path)){
                        let note = Notes.get(path);
                        // after detach or attach
                        let ret = note.afterDetachOrAttach();
                        if(ret >= 0){
                            if(ret == 0){
                                path = getRelativePath(path);
                                if(note.isAttached()){
                                    window.showInformationMessage('attach file: '+path+' over');
                                }
                                else{
                                    window.showInformationMessage('detach file: '+ path +' over');
                                }
                            }
                            if(note.needRefresh){
                                note.refresh(event.document,getMdStatus());
                            }
                        }
                        //warn modify
                        else if(!note.canNoteIt()){
                            window.showWarningMessage('if you want to modify this file, please attach it first');
                        }
                        // sync markdown with source
                        else if(note.isAttached()){
                            if(ratelimiter.isAllowed()){
                                syncMdWithSrcOnChange(note);
                            }
                            else{
                                setTimeout(function(){
                                    if(ratelimiter.isAllowed()){
                                        syncMdWithSrcOnChange(note);
                                    }
                                },1200);
                            }
                        }
                    }
                    // sync markdown with source
                    function syncMdWithSrcOnChange(note:NoteFile){
                        note.refresh(event.document,getMdStatus());
                        let lines = splitIntoLines(event.document.getText());
                        for(let contentChange of event.contentChanges){
                            let startpos = contentChange.range.start.line;
                            let line = lines[startpos];
                            let id = NoteId.getId(line);
                            NoteId.updateTime(path,id,TimeType.modify);
                        }
                    }
                    // sync source files with markdown
                    function syncSrcWithMdAllOnChange(){
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
                                    if(linenumber >= 0){
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
                                }
                                else {
                                    window.showWarningMessage('file:' + getRelativePath(srcPath) + ' is not attached, changes won\'t sync with src file');
                                }
                            }
                            else if(isSepNotesCatFile(event.document.uri.fsPath)){
                                NotesCat.refresh(splitIntoLines(event.document.getText()));
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
                            syncSrcWithMdAllOnChange();
                        }
                        else{
                            setTimeout(function () {
                                if (ratelimiterSep.isAllowed()) {
                                    syncSrcWithMdAllOnChange();
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
            let path = textEditor.document.uri.fsPath;
            if(Notes.has(path) && canAttachFile(path)){
                NoteFileTree.refresh(Notes.get(path));
            }
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
            let matches = NestedTag.getTag(str);
            logger.debug(matches);
            logger.debug(NestedTag.getOutLineTag('# 123'));
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
      
	extensionContext.subscriptions.push(
// sepNotes@id81 #### notemode switch  #command/statusbar/notemode
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
                vscode.window.showInformationMessage('cannot attach '+getRelativePath(path));
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
                            note.refresh(null,getMdStatus());
                        }
                    }
                });
            }
        }
	));
	extensionContext.subscriptions.push(
// sepNotes@id82 ### attach all #command/global/attachall
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
// sepNotes@id83 ### detach all #command/global/detachall
		commands.registerCommand(Commands.detachAll, async () => {
            detachAll();
        }
	));
	extensionContext.subscriptions.push(
// sepNotes@id84 ### add comment and remove comment #command/menu/noteit
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
                for(let line of lines){
                    if(!NoteId.includesNoteId(line)){
                        allAdd = false;
                        break;
                    }
                }
                let contentNew = '';
                if(allAdd){
                    for(let line of lines){
                        contentNew += addEof(NoteId.cutNoteId(line));
                    }
                }
                else{
                    let id = note.generateLineId();
                    for(let line of lines){
                        if(!NoteId.includesNoteId(line)){
                            contentNew += addEof(NoteId.addNoteId(id) + line);
                        } 
                        else{
                            contentNew += addEof(line);
                        }
                    }
                    NoteId.updateTime(note.path,id,TimeType.create);
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
// sepNotes@id15 ### hover for inline code #hover
    function provideHover(document:vscode.TextDocument, position:vscode.Position, token){
        let path = document.uri.fsPath;
        if(!Notes.has(path) || !Notes.get(path).isAttached()){
            return;
        }
        let curLine = position.line;
        let curContent = document.lineAt(curLine).text;
        if(NoteId.includesNoteId(curContent)){
            let id = NoteId.getId(curContent);
            // 往上
            let lineTop = curLine;
            for(let i = curLine - 1;i >= 0; i--){
                if(!NoteId.includesNoteId(document.lineAt(i).text)){
                    lineTop = i + 1;   
                    break;
                }
            }
            // 往下
            let lineDown = curLine + 1;
            for(let i = curLine + 1;i < document.lineCount; i++){
                if(!NoteId.includesNoteId(document.lineAt(i).text)){
                    lineDown = i;   
                    break;
                }
            }
            let range = new vscode.Range(new vscode.Position(lineTop,0),new vscode.Position(lineDown,0));
            let content = document.getText(range);
            let lines = splitIntoLines(content);
            let cutContent = '';
            for(let line of lines){
                cutContent += addEof(NoteId.cutNoteId(line));
            }
            let mds:vscode.MarkdownString = new vscode.MarkdownString;
            mds.appendText(cutContent);
            let extraInfo = NoteId.printId(path,id); 
            if(extraInfo != ''){
                mds.appendText(extraInfo);
            }
            return new vscode.Hover(mds,range);
        }
    }
    
	extensionContext.subscriptions.push(
        vscode.languages.registerHoverProvider({ scheme: 'file'},{provideHover})
    );
	extensionContext.subscriptions.push(
// sepNotes@id85 ### sync markdown files  #command/global/syncmdwith
		commands.registerCommand(Commands.syncMdWithSrc, async () => {
            logger.debug('syncMdWithSrc----------------------');
            fs.copyFileSync(Constants.sepNotesFilePath,Constants.sepNotesBakFilePath);
            let contentMd = Constants.sepNotesFileHead + getMdUserRandomNote();
            let contentgetRet:{"content":string,"contentByCat":Map<string,string>};
            let notAttached = false;
            // to avoid something wrong with notescat file
            NotesCat.removeNotes();
            for(let [_,note] of Notes){
                if(note.isAttached()){
                    contentgetRet = note.getMdFromSrc();
                    contentMd += contentgetRet.content;
                    NotesCat.updateNote(contentgetRet.contentByCat,note.path);
                }
                else if(note.blocks.length > 0){
                    notAttached = true;
                    break;
                }
            }
            if(notAttached){
                window.showWarningMessage('there are files not attached'); 
            }
            else{
                writeFile(Constants.sepNotesFilePath, contentMd);
                NotesCat.writeFileAccodingNodes();
                for(let [_,note] of Notes){
                    note.clearCache();
                }
                window.showInformationMessage('sync with file '+Constants.sepNotesFileName+','+ Constants.sepNotesCategoryFileName +' success');
            }
            NotesCat.refresh();
            activeEditor = vscode.window.activeTextEditor;
            NoteFileTree.refresh(Notes.get(activeEditor.document.uri.fsPath));
            updateMdStatus();
        }
	));
    
    //markdown definition in src file 
// sepNotes@id86 ### #definition
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
    }
    

    extensionContext.subscriptions.push(vscode.languages.registerDefinitionProvider(['markdown'],{
        provideDefinition
        })
    );

    for (let activatable of activatables) {
        activatable.activate(extensionContext);
    }

	extensionContext.subscriptions.push(
// sepNotes@id87 #command/view/openSepNotes
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
// sepNotes@id88 ### #command/global/importnotes
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
// sepNotes@id89 ### #changeEvent/cursor
        window.onDidChangeTextEditorSelection((event)=>{
            if(!ratelimiterChangeSelection.isAllowed()){
                return;
            }
            let path = event.textEditor.document.uri.fsPath;
            if(!fs.existsSync(path)){
                return;
            }
            let curLine = event.selections[0].active.line;
            // -------------markdown src pos match
            activeEditor = vscode.window.activeTextEditor;
            if(!activeEditor){
                return;
            }
            // logger.debug('onDidChangeTextEditorSelection start');
            if(Jumped){
                logger.debug('jumped');
            }
            let editorSepNotes:vscode.TextEditor = null;
            let editorSrc:vscode.TextEditor = null;
            // markdown
            if(canSync(activeEditor.document.uri.fsPath)){
                editorSepNotes = activeEditor;
                let path = getSrcFileFromMd(editorSepNotes.document, curLine);
                for(let editor of vscode.window.visibleTextEditors){
                    if(editor.document.uri.fsPath == path){
                        editorSrc = editor;
                        break;
                    }
                }
                if(editorSrc){
                    let srcLine = getLineNumberDown(editorSepNotes.document, curLine);
                    if(srcLine == -1){
                        srcLine = getLineNumberUp(editorSepNotes.document,curLine);
                    }
                    if(srcLine <= 0){
                        vscode.window.showInformationMessage('cannot get src line');
                    }
                    else{
                        logger.debug('srcLine:' + srcLine.toString());
                        editorSrc.revealRange(new vscode.Range(srcLine, 0, srcLine, 0),vscode.TextEditorRevealType.AtTop);
                    }
                }
            }
            // src
            else{
                // update access time
                let lineContent = activeEditor.document.lineAt(curLine).text;
                if(NoteId.includesNoteId(lineContent)){
                    let id = NoteId.getId(lineContent);
                    NoteId.updateTime(path,id,TimeType.access);
                }
                // postion align
                editorSrc = activeEditor;
                for(let editor of vscode.window.visibleTextEditors){
                    path = editor.document.uri.fsPath; 
                    if(isSepNotesFile(path) || (Jumped && isSepNotesCatFile(path))){
                        editorSepNotes = editor;
                        break;
                    }
                }
                if(editorSepNotes){
                    path = editorSrc.document.uri.fsPath;
                    if (Notes.has(path)) {
                        let mdLine;
                        if(isSepNotesFile(editorSepNotes.document.uri.fsPath)){
                            mdLine = NoteFileTree.getMdPos(curLine);
                        } 
                        else{
                            mdLine = tagJumpPos;
                        }
                        logger.debug('mdLine:'+mdLine.toString());
                        editorSepNotes.revealRange(new vscode.Range(mdLine, 0, mdLine, 0),vscode.TextEditorRevealType.AtTop);
                    }
                    else if(!Notes.has(path) || !Notes.get(path).isAttached()){
                        vscode.window.showInformationMessage(getRelativePath(path)+' is not attached');
                    }
                }
            }

            // `sepnotes` tree view item show
            let item = fileOutLineProvider.getItemByPos(curLine);
            if(item){
                if(fileOutLineTreeView.visible && !Jumped){
                    fileOutLineTreeView.reveal(item, { focus: false, select: true });
                }
                //update access time
                if(Math.abs(item.line - curLine) < 10){
                    let lineContent = activeEditor.document.lineAt(item.line - 1).text;
                    if(NoteId.includesNoteId(lineContent)){
                        let id = NoteId.getId(lineContent);
                        NoteId.updateTime(path,id,TimeType.access);
                    }
                }
            }

            //`sepnotes_category` tree view(if tag num is 1)
            let lineContent = activeEditor.document.lineAt(curLine).text;
            let tags =  NestedTag.getTag(lineContent);
            if(tags.length == 1 && tagOutLineTreeView.visible){
                let item = NotesCat.revealItem(tags[0]);
                if(item){
                    tagOutLineTreeView.reveal(item, { focus: true, select: true, expand: true }); 
                }             
            }

            Jumped = false;
            // logger.debug('onDidChangeTextEditorSelection end');
        }));

    extensionContext.subscriptions.push(
// sepNotes@id90 ### #command/view/jumptoline
        commands.registerCommand(Commands.jumpToNoteLine, async (item: OutLineItem) => {
            let path = item.path;
            if(item.itemType == OutLineItemType.Tag){
                path = Constants.sepNotesCategoryFilePath;
            }
            vscode.window.showTextDocument(vscode.Uri.file(path), { preview: true, preserveFocus: true }).then(
                textEditor => {
                    try {
                        let line = item.line;
                        if(item.itemType != OutLineItemType.Tag){
                            let note = Notes.get(item.path);
                            if(note){
                                if(!note.isAttached()){
                                    line = note.getDetachedLine(line);
                                }
                                // when click from sepnotes_category, update time (click from sepnotes doesn't need it(onDidChangeTextEditorSelection will do it))
                                else if(item.itemType == OutLineItemType.codeBlock){
                                    if(!note.isMatch(line,item.code)){
                                        vscode.window.showWarningMessage("src file not matched ");
                                    }
                                    else{
                                        let noteLine = line - 1;
                                        let document = textEditor.document;
                                        if(!NoteId.includesNoteId(document.lineAt(noteLine).text)){
                                            noteLine -= 1;
                                        }
                                        let lineContent = document.lineAt(noteLine).text;
                                        if(NoteId.includesNoteId(lineContent)){
                                            let id = NoteId.getId(lineContent);
                                            NoteId.updateTime(item.path,id,TimeType.access);
                                        }
                                    }
                                }
                            }
                            line = line - 1;
                        }
                        let range = new vscode.Range(
                            line,
                            0,
                            line,
                            0
                        );
                        if(item.itemType == OutLineItemType.codeBlock){
                            if(NotesCat.hasTag(item.tag.getFullTag())){
                                tagJumpPos = NotesCat.getTagPos(item.tag.getFullTag());
                            }
                            Jumped = true;
                            logger.debug('tagjumppos:'+tagJumpPos.toString());
                        }
                        textEditor.selection = new vscode.Selection(range.start, range.start);
                        textEditor.revealRange(range,vscode.TextEditorRevealType.AtTop);
                    } catch (e) {
                        vscode.window.showWarningMessage("Failed to jump: " + e);
                        return;
                    }
                }
            );
        }));

    extensionContext.subscriptions.push(
// sepNotes@id91 ### #command/view/moveup
        commands.registerCommand(Commands.MoveUp, async (item: OutLineItem) => {
           NotesCat.moveUp(item.tag);
        }));

    extensionContext.subscriptions.push(
// sepNotes@id92 ### #command/view/movedown
        commands.registerCommand(Commands.MoveDown, async (item: OutLineItem) => {
           NotesCat.moveDown(item.tag);
        }));

    extensionContext.subscriptions.push(
// sepNotes@id93 ### #command/view/moveleft
        commands.registerCommand(Commands.MoveLeft, async (item: OutLineItem) => {
           NoteFileTree.MoveLeft(item);
           updateStateNote(extensionContext);
           NoteFileTree.refresh(Notes.get(item.path));
        }));

    extensionContext.subscriptions.push(
// sepNotes@id94 ### #command/view/moveRight
        commands.registerCommand(Commands.MoveRight, async (item: OutLineItem) => {
           NoteFileTree.MoveRight(item);
           updateStateNote(extensionContext);
           NoteFileTree.refresh(Notes.get(item.path));
        }));

    extensionContext.subscriptions.push(
// sepNotes@id95 ### #command/view/copytag
        commands.registerCommand(Commands.copyTag, async (item: OutLineItem) => {
            vscode.env.clipboard.writeText('#' + item.tag.getFullTag());
            window.showInformationMessage(item.tag.getFullTag()+' copied');
        }));

    extensionContext.subscriptions.push(
// sepNotes@id96 ### #command/view/copyOutline
        commands.registerCommand(Commands.copyOutline, async (item: OutLineItem) => {
            vscode.env.clipboard.writeText(item.tag.getLastOutline());
            window.showInformationMessage(item.tag.getLastOutline()+' copied');
        }));

    extensionContext.subscriptions.push(
// sepNotes@id97 ### #command/view/filtertag
        commands.registerCommand(Commands.filterTag, async () => {
            const pick = await window.showQuickPick(NotesCat.getItems());
            if(pick){
                let item = NotesCat.revealItem(pick); 
                if(item){
                    tagOutLineTreeView.reveal(item, { focus: true, select: true, expand: true }); 
                }
            }
        }));

    extensionContext.subscriptions.push(
// sepNotes@id98 ### #command/view/rename
        commands.registerCommand(Commands.rename, async (item: OutLineItem) => {
            rename(RenameType.renameTag,item);
        }));

    extensionContext.subscriptions.push(
// sepNotes@id99 ### #command/view/addHeader
        commands.registerCommand(Commands.addHeader, async (item: OutLineItem) => {
            rename(RenameType.addHeader,item);
        }));

    extensionContext.subscriptions.push(
// sepNotes@id100 ### #command/view/removeHeader
        commands.registerCommand(Commands.removeHeader, async (item: OutLineItem) => {
            rename(RenameType.removeHeader,item);
        }));

    async function rename(renameType:RenameType, item:OutLineItem){
        let sValue = '';
        let sHint = '';
        let canContinue = false;
        if(renameType == RenameType.renameTag){
            sHint = 'new name';
            sValue = item.tag.getLastTag();
        }
        else if(renameType == RenameType.addHeader){
            sHint = 'header name';
        }
        if(isAllAttached()){
            let newLabel = '';
            let newTag:string = '';
            if(renameType != RenameType.removeHeader){
                newLabel = await window.showInputBox({
                    value: sValue,
                    placeHolder: sHint,
                });
                if(newLabel && newLabel.length > 0){
                    newTag = item.tag.getParentTag();
                    if(newTag.length > 0){
                        newTag += '/';
                    }
                    if(renameType == RenameType.renameTag){
                        newTag += newLabel;
                    }
                    else if(renameType == RenameType.addHeader){
                        newTag += (newLabel + '/' + item.tag.getLastTag());
                    }
                    canContinue = true;
                }
            }
            else if(renameType == RenameType.removeHeader){
                newTag = item.tag.getParentTag();
                if(newTag.length > 0){
                    newTag = item.tag.getParentTag(2);
                    if(newTag.length > 0){
                        newTag += '/';
                    }
                    newTag += item.tag.getLastTag();
                    canContinue = true;
                }
            }
            if(canContinue){
                commands.executeCommand(Commands.syncMdWithSrc);
                let srcChanges = NotesCat.rename(item.tag,newTag);
                for(let srcchange of srcChanges.values()){
                    let note = Notes.get(srcchange.path);
                    note.writeFile(srcchange.getContent(note.getContentLines()));
                    logger.debug('write path:'+note.path);
                }
                setTimeout(()=>{
                    commands.executeCommand(Commands.syncMdWithSrc);
                },500);
            }
        }
        else{
            window.showWarningMessage('src file is not matched, need to refresh first'); 
        }
    }

    extensionContext.subscriptions.push(
// sepNotes@id16 ### #command/view/fillLostId
        commands.registerCommand(Commands.fillLostId, async () => {
            for (let [_, note] of Notes) {
                note.fillLostId();
            }
            window.showInformationMessage('fillLostId over');
        }));

    function showAttachStatus(){
        let activeEditor = vscode.window.activeTextEditor;
        if(activeEditor){
            updateState(activeEditor,extensionContext);
            for(let [_,note] of Notes){
                if(note.isAttached()){
                    attachedFileNum += 1;
                    if(note.needRefresh){
                        note.refresh(null,getMdStatus());
                    }
                }
                else{
                    detachedFileNum += 1;
                }
            }
            let path = activeEditor.document.uri.fsPath;
            if(Notes.has(path)){
                NoteFileTree.refresh(Notes.get(path));
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
function getMdStatus():string{
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
    content = joinEof(lines);
    logger.debug('updateMdStatus:'+status);
    writeFile(Constants.sepNotesFilePath,content);
}

function isAllAttached():boolean{
    for(let [_,note] of Notes){
        if((!note.isAttached()) && note.blocks.length > 0){
            return false;
        }
    }
    return true;
}


