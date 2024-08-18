import { Constants, OutLineItemType } from "../constants/constants";
import { logger } from "../logging/logger";
import { addEof, cutOutLineMarker, decode, getLineNumber, splitIntoLines } from "../utils/utils";
import { LineIdentity } from "./LineIdentity";
import { NestedTag } from "./tag";
import { OutLineItem } from "./treeView";
import * as fs from 'fs';
import * as vscode from 'vscode';
export class NoteFileTree{
    static childrens: Map<string,Array<OutLineItem>> = new Map<string,Array<OutLineItem>>();
    static refresh(path:string){
        logger.debug('NoteFileTree refresh start path:'+path);
        this.childrens.clear();
        this.childrens.set('',new Array<OutLineItem>());
        let parents:Array<NestedTag> = [new NestedTag()];
        let contentLines = splitIntoLines(decode(fs.readFileSync(Constants.sepNotesFilePath),'utf-8'));
        let tagPos:Map<string,OutLineItem> = new Map<string,OutLineItem>();
        let item:OutLineItem;
        let fileStart = false;
        let enterCodeBlock = false;
        let lineIdentity = new LineIdentity(path);
        let curNestedTag = new NestedTag('',true);
        let noteContent = '';
        let normalTag = '##################';
        let linenumber = 0;
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
                    if(codeLineNumber >= 0){
                        let code;
                        if(lineIdentity.isTagOutLine(noteContent)){
                            let outline = NestedTag.getOutLine(noteContent);
                            curNestedTag.update(outline + ' ' + codeLineNumber.toString());
                            code = cutOutLineMarker(noteContent);
                        }
                        else{
                            curNestedTag.update(normalTag+' '+codeLineNumber.toString());
                            code = noteContent;
                        }
                        noteContent = '';

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
                        item = new OutLineItem(vscode.TreeItemCollapsibleState.None,curNestedTag,OutLineItemType.TagAndCode,path,code,codeLineNumber,tagPos.get(parents[i].getFullTag()));
                        children.push(item);
                        tagPos.set(item.tag.getFullTag(),item);
                        let tempTag = new NestedTag();
                        tempTag.copyTag(curNestedTag);
                        parents.push(tempTag);
                    }
                }
                else{
                    enterCodeBlock = false;
                }
            }
            else if(!enterCodeBlock && line.trim().length > 0){
                noteContent += addEof(line);
            }
            linenumber += 1;
        }
        for(let [_,children] of this.childrens){
            for(let child of children){
                if(this.childrens.has(child.tag.getFullTag())){
                    child.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                }
            }
        }
        logger.debug('NoteFileTree refresh end -------------------');
    }
    static getTreeViewRoot():Array<OutLineItem>{
        return this.childrens.get('');
    }
    static getChildren(parentTag:NestedTag):Array<OutLineItem>{
        return this.childrens.get(parentTag.getFullTag());
    }
    static getItemByPos(pos:number):OutLineItem{
        let children = this.childrens.get('');
        if(children.length > 0){
            let i = 0;
            let lastItem = children[0];
            while(i <= children.length){
                if(i == children.length ||  Number(children[i].tag.getLastTag()) > pos){
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
                }
                i+=1;
            }
            return lastItem;
        }
        return null;
    } 
}