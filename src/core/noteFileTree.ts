import { Constants, MdType, OutLineItemType } from "../constants/constants";
import { logger } from "../logging/logger";
import { addEof, cutOutLineMarker, decode, getAnnoFromMd, getLineNumber, removeLineNumber, splitIntoLines, writeFile, getPrefix } from "../utils/utils";
import { LineIdentity } from "./LineIdentity";
import { NoteBlock, NoteFile } from "./note";
import { NestedTag } from "./tag";
import { OutLineItem } from "./treeView";
import * as fs from 'fs';
import * as vscode from 'vscode';
export class NoteFileTree{
    static childrens: Map<string,Array<OutLineItem>> = new Map<string,Array<OutLineItem>>();
    static noteFileContent: Array<NoteBlock> = new Array<NoteBlock>();
    static note:NoteFile =  null;
    static fileOutLineProvider;
    static refresh(notep:NoteFile){
        let path = notep.path;
        logger.debug('NoteFileTree refresh start path:'+path);
        this.childrens.clear();
        this.childrens.set('',new Array<OutLineItem>());
        this.noteFileContent.length = 0;
        this.note = notep;
        let parents:Array<NestedTag> = [new NestedTag()];
        let contentLines = this.getContentLines();
        let tagPos:Map<string,OutLineItem> = new Map<string,OutLineItem>();
        let item:OutLineItem;
        let fileStart = false;
        let enterCodeBlock = false;
        let lineIdentity = new LineIdentity(path);
        let curNestedTag = new NestedTag('',true);
        let noteContents = new Array<string>();
        let normalTag = '##################';
        let linenumber = 0;
        let noteLineNumber = 0;
        tagPos.set('',null);
        for (let line of contentLines) {
            // skip before file start
            if (!fileStart) {
                if (lineIdentity.isCurFileStart(line)) {
                    fileStart = true;
                }
            }
            // file end
            else if (lineIdentity.isOtherFileStart(line)) {
                break;
            }
            else if(Constants.glineIdentity.isCodeStart(line)){
                if (!enterCodeBlock && (linenumber+1) < contentLines.length) {
                    enterCodeBlock = true;
                    let codeLineNumber = getLineNumber(contentLines[linenumber + 1]);
                    if(codeLineNumber >= 0 && noteContents.length > 0){
                        let noteContent = noteContents[0];
                        let noteStart = linenumber - noteContents.length;
                        let noteLineCount = 1;
                        for(let j = 1;j<=noteContents.length;j++){
                            if(j < noteContents.length && !lineIdentity.isTagOutLine(noteContents[j])){
                                noteContent = addEof(noteContent) + noteContents[j];
                                noteLineCount += 1;
                                continue;
                            }
                            let outline = '';
                            noteLineNumber = codeLineNumber + (noteStart - linenumber);
                            if (lineIdentity.isTagOutLine(noteContent)) {
                                outline = NestedTag.getOutLine(noteContent);
                                curNestedTag.update(outline + ' ' + noteLineNumber.toString());
                                noteContent = cutOutLineMarker(noteContent);
                            }
                            else {
                                curNestedTag.update(normalTag + ' ' + noteLineNumber.toString());
                            }

                            this.noteFileContent.push(new NoteBlock(codeLineNumber,noteContent,noteLineCount,removeLineNumber(contentLines[linenumber + 1]),noteStart,outline,noteLineNumber));

                            let i = parents.length - 1;
                            while (parents[i].getLevel() >= curNestedTag.getLevel()) {
                                parents.pop();
                                i -= 1;
                            }
                            let parent = parents[i].getFullTag();
                            if (!this.childrens.has(parent)) {
                                this.childrens.set(parent, new Array<OutLineItem>());
                            }
                            let children = this.childrens.get(parent);
                            item = new OutLineItem(vscode.TreeItemCollapsibleState.None, curNestedTag, OutLineItemType.TagAndCode, path, noteContent, noteLineNumber, tagPos.get(parents[i].getFullTag()));
                            children.push(item);
                            tagPos.set(item.tag.getFullTag(), item);
                            let tempTag = new NestedTag();
                            tempTag.copyTag(curNestedTag);
                            parents.push(tempTag);
                            if(j < noteContents.length){
                                noteContent = noteContents[j];
                                noteStart = linenumber - noteContents.length + j;
                                noteLineCount = 1;
                            }
                        }
                        noteContents.length = 0;
                    }
                }
                else{
                    enterCodeBlock = false;
                }
            }
            else if(!enterCodeBlock && line.trim().length > 0){
                noteContents.push(line);
            }
            linenumber += 1;
        }
        for(let [_,children] of this.childrens){
            for(let child of children){
                if(this.childrens.has(child.tag.getFullTag())){
                    child.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                }
            }
        }
        this.fileOutLineProvider.refresh();
        logger.debug('NoteFileTree refresh end -------------------');
    }
    static getTreeViewRoot():Array<OutLineItem>{
        return this.childrens.get('');
    }
    static getChildren(parentTag:NestedTag):Array<OutLineItem>{
        return this.childrens.get(parentTag.getFullTag());
    }
    static getItemByPos(pos:number):OutLineItem{
        pos++;
        let children = this.childrens.get('');
        if(children.length > 0){
            let i = 0;
            let lastItem = children[0];
            while(i <= children.length){
                if(i < children.length && children[i].line == pos){
                    return children[i];
                }
                else if(i == children.length ||  children[i].line > pos){
                    if(this.childrens.has(lastItem.tag.getFullTag())){
                        children = this.childrens.get(lastItem.tag.getFullTag());
                        i = 0;
                        lastItem = children[0];
                    }
                    else{
                        return lastItem;
                    }
                }
                else{
                    lastItem = children[i];
                    i+=1;
                }
            }
            return lastItem;
        }
        return null;
    } 
    static checkIsMatch():boolean{
        let contentLines = this.note.getContentLines();
        for(let block of this.noteFileContent){
            if(!this.note.isMatch(-1,block.codeBelow,contentLines[block.codeLine - 1])){
                return false;
            }
        }
        return true;
    }
    static MoveLeft(noteLineNumber:number){
        this.Move(noteLineNumber,true);
    }
    static MoveRight(noteLineNumber:number){
        this.Move(noteLineNumber,false);
    }
    static Move(noteLineNumber:number,left:boolean){
        logger.debug('Move start');
        if(!this.checkIsMatch()){
            vscode.window.showWarningMessage('src file is not matched, need to refresh first');
        }
        else{
            let index = this.noteFileContent.findIndex(item => item.noteLine == noteLineNumber);
            let block = this.noteFileContent[index];
            let contentLines = this.getContentLines();
            if((left && (block.outline == '' || block.outline.length >= 3)
               || (!left && block.outline != ''))){
                let satisfyOutLine = new Array<string>();
                let tempOutline = '';
                for(let j = index - 1;j <= (index +1); j++){
                    if(j< 0 || j == index || j >= this.noteFileContent.length){
                        continue;
                    }
                    if(this.noteFileContent[j].outline != ''){
                        tempOutline = this.noteFileContent[j].outline;
                        if((left && (block.outline == '' || block.outline.length > tempOutline.length))
                           || (!left && (block.outline.length < tempOutline.length))){
                            satisfyOutLine.push(tempOutline);
                        }
                    }
                }

                if(satisfyOutLine.length == 1){
                    block.outline = satisfyOutLine[0];
                }
                else if(satisfyOutLine.length == 2){
                    if((left && satisfyOutLine[0].length > satisfyOutLine[1].length)
                       || (!left && satisfyOutLine[0].length < satisfyOutLine[1].length)){
                        block.outline = satisfyOutLine[0];
                    }
                    else{
                        block.outline = satisfyOutLine[1];
                    }
                }
                else if(satisfyOutLine.length == 0){
                    if(left && block.outline != ''){
                        block.outline = block.outline.substring(0,block.outline.length - 1);
                    }
                    else if(!left){
                        block.outline = '';
                    }
                }
                if (left && block.outline == '') {
                    block.outline = '###';
                }
                block.note = block.outline +' ' + block.note;
                contentLines = [...contentLines.slice(0,block.changedLine),...splitIntoLines(block.note),...contentLines.slice(block.changedLine + block.noteLineCount)];
                writeFile(Constants.sepNotesFilePath,addEof(contentLines.join('\n')));
                let anno = getAnnoFromMd(null, block.changedLine, contentLines);
                let linenumber = anno.linenumber;
                if (linenumber >= 0) {
                    this.note.syncSrcWithMd(anno.text, linenumber, MdType.sepNotes);
                }
            }
        }
        logger.debug('Move end');
    }
    static DrapAndDrop(destNoteLine:number,destOutline:string,noteLineNumbers:Array<number>){
        logger.debug('DrapAndDrop start');
        if(!this.checkIsMatch()){
            vscode.window.showWarningMessage('src file is not matched, need to refresh first');
        }
        else if(!(noteLineNumbers.includes(destNoteLine))){
            let mdContentLines = this.getContentLines();
            let newMdContentLines = [];
            let srcContentLines = this.note.getContentLines();
            let noteIndex = 0;
            let lastMdIndex = 0;
            noteLineNumbers.push(destNoteLine);
            noteLineNumbers.sort((a,b)=> a - b);
            if(destOutline == ''){
                destOutline = '###';
            }
            let childOutline = destOutline + '#';
            for(let noteLineNumber of noteLineNumbers){
                logger.debug('notelinenumber:'+noteLineNumber.toString());
                while(noteIndex < this.noteFileContent.length
                      && this.noteFileContent[noteIndex].noteLine < noteLineNumber){
                        noteIndex += 1;
                }
                let block = this.noteFileContent[noteIndex];
                if(noteLineNumber == destNoteLine || block.outline == childOutline){
                    block.outline = destOutline;
                }
                else{
                    block.outline = childOutline;
                }
                block.note = block.outline +' ' + block.note;
                let blockNote = splitIntoLines(block.note);
                for(let i = 0;i<blockNote.length;i++){
                    const prefix = getPrefix(srcContentLines[block.noteLine - 1 + i],this.note.configuration.noteId)
                    srcContentLines[block.noteLine - 1 + i] = prefix + blockNote[i];
                }
                newMdContentLines = [...newMdContentLines,...mdContentLines.slice(lastMdIndex,block.changedLine),...blockNote];
                lastMdIndex = block.changedLine + block.noteLineCount;
            }
            newMdContentLines = [...newMdContentLines, ...mdContentLines.slice(lastMdIndex)];
            writeFile(Constants.sepNotesFilePath,addEof(newMdContentLines.join('\n')));
            this.note.writeFile(addEof(srcContentLines.join('\n')));
            this.note.refreshMdCat();
            this.refresh(this.note);
        }
        logger.debug('DrapAndDrop end');
    }
    static getContentLines(){
        return splitIntoLines(decode(fs.readFileSync(Constants.sepNotesFilePath),'utf-8'));
    }
    static getMdPos(srcPos:number){
        let ret = 0;
        let item = this.getItemByPos(srcPos);
        if(item){
            for(let noteblock of this.noteFileContent){
                if(noteblock.noteLine == item.line){
                    ret = noteblock.changedLine;
                    break;
                }
            }
        }
        return ret;
    }
}