import {ExtensionContext,commands,workspace,window } from 'vscode';
import * as vscode from 'vscode';
import { logger } from "./logging/logger";
import { Constants, NoteMode } from "./constants/constants";
import { getConfiguration, Configuration } from "./configuration";
import { Activatable } from "./activatable";
import { Commands } from "./constants/constants";

import { isConfigurationChangeAware } from "./configurationChangeAware";
import {NoteFile,serializableNoteFile} from './core/note'
import { addEof, splitIntoLines,encode, getLineNumber,extractLinksFromMarkdown } from './utils/utils';
import * as fs from 'fs';

let configuration: Configuration;
let activatables: Array<Activatable> = new Array();
let Notes: Map<string,NoteFile> = new Map<string,NoteFile>();
let serializedNotes :Array<serializableNoteFile> = new Array<serializableNoteFile>() ;
let statusBarItem: vscode.StatusBarItem;
let inAll = false;
let allNotShow = false;

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

    let activeEditor = vscode.window.activeTextEditor;
    // restore state
    serializedNotes = extensionContext.workspaceState.get(Constants.keyNotes)??new Array<serializableNoteFile>();
    for(let note of serializedNotes){
        if(fs.existsSync(note.path)){
            Notes.set(note.path,new NoteFile(note.path,note.noteMode,configuration,statusBarItem,note.blocks));
        }
    }
    extensionContext.subscriptions.push(
        workspace.onDidChangeTextDocument((event)=>{
            if (window.activeTextEditor && event.document === window.activeTextEditor.document) {
                if(event.contentChanges.length > 0){
                    let path = event.document.uri.fsPath;
                    if(!inAll && !allNotShow && Notes.has(path)){
                        let note = Notes.get(path);
                        if(note.afterDetach()){
                            if(note.isAttached()){
                                window.showInformationMessage('attach file: '+path+' over');
                            }
                            else{
                                window.showInformationMessage('detach file: '+ path +' over');
                            }
                        }
                        else if(note.shouldWarn()){
                            window.showInformationMessage('if you want modify this file, please attach it first');
                        }
                    }
                    allNotShow = false;
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
            // let path = activeEditor.document.uri.fsPath;
            // extensionContext.workspaceState.update(Constants.keyNotes,null);
            // let aa = await vscode.languages.getLanguages();
            // for(let a of aa){
            //     logger.info(a);
            // }
            logger.info(JSON.stringify(configuration.associations));
		}));


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
            if(!Notes.has(path)){
                Notes.set(path,new NoteFile(path,NoteMode.Detached,configuration,statusBarItem));
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
                        Notes.get(path).ModeSwitch(selected);
                        updateState(activeEditor,extensionContext);
                    }
                });
            }
        }
	));
	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.attachAll, async () => {
            if(!inAll){
                inAll = true;
                for(let [_,note] of Notes){
                    if(note.notFinished()){
                        window.showInformationMessage('not finished yet');
                    }
                    else{
                        note.attachContent();
                    }
                }
                activeEditor = vscode.window.activeTextEditor;
                updateState(activeEditor,extensionContext);
                window.showInformationMessage('atach all finished');
                inAll = false;
                allNotShow = true;
            }
        }
	));

	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.detachAll, async () => {
            if(!inAll){
                inAll = true;
                for(let [_,note] of Notes){
                    if(note.notFinished()){
                        window.showInformationMessage('not finished yet');
                    }
                    else{
                        note.detachContent();
                    }
                }
                activeEditor = vscode.window.activeTextEditor;
                updateState(activeEditor,extensionContext);
                window.showInformationMessage('detach all finished');
                inAll = false;
                allNotShow = true;
            }
        }
	));

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
            }
            else{
                window.showInformationMessage('please attach it first before add note');
            }
            updateState(activeEditor,extensionContext);
        }
	));
    
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
            content = content.replace(new RegExp(configuration.noteId,'g'),'');
            let mds:vscode.MarkdownString = new vscode.MarkdownString;
            mds.appendText(content);
            return new vscode.Hover(mds,range);
        }
    }
    
	extensionContext.subscriptions.push(
        vscode.languages.registerHoverProvider({ scheme: 'file'},{provideHover})
    );
	extensionContext.subscriptions.push(
		commands.registerCommand(Commands.syncWithMdFile, async () => {
            let now = new Date();
            let content = `
<!-- generated by vscode plugin [separable notes](https://github.com/hashhashu/separable-notes)  
date:{${now.toLocaleDateString()} ${now.toLocaleTimeString()}}  \n
-->  \n`;
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
                fs.writeFileSync(Constants.markdownFilePath, content);
                window.showInformationMessage('sync with file ./vscode/sepNotes.md success');
            }
        }
	));
    
    function provideDefinition(document:vscode.TextDocument, position:vscode.Position, token) {
        const line		= document.lineAt(position);
        let lineNumber = getLineNumber(line.text);
        let filePath = '';
        if(lineNumber > 0){
            for(let i = line.lineNumber - 1; i>=0 ;i--){
                let link = extractLinksFromMarkdown(document.lineAt(i).text);
                if(link.length > 0){
                    filePath = link;
                    break;
                }
            }
            if((filePath != '') && fs.existsSync(filePath)){
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




