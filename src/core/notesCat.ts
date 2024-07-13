import * as vscode from 'vscode';
import { Constants, OutLineItemType } from "../constants/constants";
import { addEof, getLineNumber, getSrcFileFromLine, removeLineNumber, splitIntoLines } from "../utils/utils";
import { NestedTag } from "./tag";
import { OutLineItem } from "./treeView";
import * as fs from 'fs';
import { logger } from '../logging/logger';

export class NotesCat{
    static getDesc(){
        let descs:Map<string,string> = new Map<string,string>();
        let contentLines = this.getContentLines();
        let curNestedTag = new NestedTag();
        let desc = '';
        let tagStart = false;
        let crossDesc = false;
        for(let line of contentLines){
          if (!tagStart) {
            if (!Constants.glineIdentity.isTagOutLine(line)) {
              continue;
            }
            else {
              curNestedTag.update(line);
              tagStart = true;
              crossDesc = false;
            }
          }
          else if(Constants.glineIdentity.isTagOutLine(line)){
            if(desc.trim().length > 0){
                descs.set(curNestedTag.getFullTag(),desc);
            }
            desc = '';
            crossDesc = false;
            curNestedTag.update(line);
          }
          else if(!crossDesc){
            if(Constants.glineIdentity.isFileStart(line)){
                crossDesc = true;
            }
            else{
               desc += addEof(line); 
            }
          }
        }
        if(desc.trim().length > 0){
            descs.set(curNestedTag.getFullTag(),desc);
        }
        return descs;
    }
    static getTreeViewRoot(contentLines:string[]):{"item":Array<OutLineItem>,"tagPos":Map<string,number>}{
      logger.debug('getTreeViewRoot start');
      let headings = new Array<OutLineItem>();
      let curNestedTag = new NestedTag();
      let tagPos = new Map<string,number>();
      let linenumber = 0;
      for(let line of contentLines){
        if(Constants.glineIdentity.isTagOutLine(line)){
          curNestedTag.update(line);
          tagPos.set(curNestedTag.getFullTag(),linenumber);
          if(NestedTag.getOutLine(line).length == 1){
            let tag = NestedTag.getOutLineTag(line);
            headings.push(new OutLineItem(vscode.TreeItemCollapsibleState.Collapsed,tag,new NestedTag(tag),OutLineItemType.Tag));
          }
        }
        linenumber = linenumber + 1;
      }
      logger.debug('getTreeViewRoot end');
      return {"item":headings,"tagPos":tagPos};
    }
    static getChildren(parentTag:NestedTag,startPos:number,contentLines:string[]):Array<OutLineItem>{
      logger.debug('getChildren start parent:'+ parentTag.getFullTag() + 'startpos:'+startPos.toString());
      contentLines = contentLines.slice(startPos);
      let children = new Array<OutLineItem>();
      let curNestedTag = new NestedTag(parentTag.getFullTag());
      let tmpOutLineItem = new OutLineItem(vscode.TreeItemCollapsibleState.None);
      let enterOutLine = false;
      let enterCodeBlock = false;
      let isFirstCode = false;
      for(let line of contentLines){
        if (Constants.glineIdentity.isTagOutLine(line)) {
          curNestedTag.update(line);
          if (!curNestedTag.contain(parentTag)) {
            break;
          }
          if (curNestedTag.getLevel() == (parentTag.getLevel() + 1)) {
            children.push(new OutLineItem(vscode.TreeItemCollapsibleState.Collapsed, curNestedTag.getLastTag(), curNestedTag, OutLineItemType.Tag));
            enterOutLine = true;
          }
        }
        else if ((!enterOutLine)) {
          if (Constants.glineIdentity.isFileStart(line)) {
            tmpOutLineItem.path = getSrcFileFromLine(line);
          }
          else if (!enterCodeBlock) {
            if (Constants.glineIdentity.isCodeStart(line)) {
              enterCodeBlock = true;
              isFirstCode = true;
            }
          }
          else if (enterCodeBlock) {
            if (isFirstCode) {
              tmpOutLineItem.line = getLineNumber(line);
              tmpOutLineItem.code = removeLineNumber(line);
              tmpOutLineItem.label = tmpOutLineItem.code;
              children.push(tmpOutLineItem);
              tmpOutLineItem = new OutLineItem(vscode.TreeItemCollapsibleState.None);
              isFirstCode = false;
            }
            if (Constants.glineIdentity.isCodeEnd(line)) {
              enterCodeBlock = false;
            }
          }
        }
      }
      logger.debug('getChildren end');
      return children;
    }
    static getContentLines():string[]{
      return splitIntoLines(fs.readFileSync(Constants.sepNotesCategoryFilePath).toString());
    }
}