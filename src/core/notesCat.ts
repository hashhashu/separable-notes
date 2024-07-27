import * as vscode from 'vscode';
import { Constants, OutLineItemType } from "../constants/constants";
import { addEof, getLineNumber, getSrcFileFromLine, removeLineNumber, splitIntoLines,writeFile } from "../utils/utils";
import { NestedTag } from "./tag";
import { OutLineItem } from "./treeView";
import * as fs from 'fs';
import { logger } from '../logging/logger';

export class NotesCat{
    static contentLines: string[];
    static tagPos: Map<string,number> = new Map<string,number>();
    static tagOrder: Map<string,string>;
    static childrens: Map<string,Array<OutLineItem>> = new Map<string,Array<OutLineItem>>();
    static searchTag: string = '';
    static refresh(searchTagp:string = ''){
      logger.debug('NotesCat refresh start');
      this.searchTag = searchTagp;
      this.contentLines = this.getContentLines();
      this.tagPos.clear();
      this.childrens.clear();
      let headings = new Array<OutLineItem>();
      let curNestedTag = new NestedTag();
      let tempTags = new Array<NestedTag>();
      let linenumber = 0;
      for(let line of this.contentLines){
        if(Constants.glineIdentity.isTagOutLine(line)){
          curNestedTag.update(line);
          this.tagPos.set(curNestedTag.getFullTag(),linenumber);
          if(this.searchTag == '' || curNestedTag.includes(this.searchTag)){
            if(this.searchTag != ''){
              tempTags.push(new NestedTag(curNestedTag.getFullTag()));
            }
            // only first level
            else if(NestedTag.getOutLine(line).length == 1){
              let tag = NestedTag.getOutLineTag(line);
              headings.push(new OutLineItem(vscode.TreeItemCollapsibleState.Collapsed,new NestedTag(tag),OutLineItemType.Tag));
            }
          }
        }
        linenumber = linenumber + 1;
      }
      if(this.searchTag == ''){
        this.childrens.set('',headings);
      }
      else{
        let added = new Set<string>();
        for(let index = tempTags.length - 1;index>=0;index--){
          curNestedTag = tempTags[index];
          // all levels
          let skipNotConKey = true;
          for (let i = 0; i < curNestedTag.getLevel(); i++) {
            if (skipNotConKey) {
              if (!curNestedTag.getLastTag(i + 1).includes(this.searchTag)) {
                continue;
              }
              else {
                skipNotConKey = false;
              }
            }

            let tag = curNestedTag.getParentTag(i);
            if (!added.has(tag)) {
              added.add(tag);
              let item = new OutLineItem(vscode.TreeItemCollapsibleState.Expanded, new NestedTag(tag), OutLineItemType.Tag);
              let parent = curNestedTag.getParentTag(i + 1);
              if (!this.childrens.has(parent)) {
                let children = new Array<OutLineItem>();
                this.childrens.set(parent, children);
              }
              this.childrens.get(parent).push(item);
            }
          }
        }
      }
      logger.debug('NotesCat refresh end');
    }
    static load(extensionContext){
      logger.debug('load start');
      let entries =  extensionContext.workspaceState.get(Constants.TagOrder);
      if(entries){
        this.tagOrder = new Map(entries.map(entry => [entry.key, entry.value]));
      }
      else{
        this.tagOrder = new Map<string,string>();
      }
      let toDelete = [];
      for(let [key,_] of this.tagOrder){
        if(!this.tagPos.has(key)){
          toDelete.push(key);
        }
      }
      for(let ele of toDelete){
        this.tagOrder.delete(ele);
      }
      logger.debug('load end');
    }
    static save(extensionContext){
      let entries = Array.from(this.tagOrder.entries()).map(([key,value])=>({ key, value }));
      extensionContext.workspaceState.update(Constants.TagOrder,entries);
    }
    static getOrder(tag:string){
      if(this.tagOrder.has(tag)){
        return this.tagOrder.get(tag);
      }
      else{
        return tag;
      }
    }
    // tag2 --> tag1
    static swapOrder(children:Array<OutLineItem>, index: number, tagLength:number){
      logger.debug('swapOrder start');
      let tag1 = children[index - 1].tag.getFullTag();
      let tag2 = children[index].tag.getFullTag();
      // swap order
      this.tagOrder.set(tag1,this.getOrder(tag2));
      this.tagOrder.set(tag2,this.getOrder(tag1));
      let pos1 = this.tagPos.get(tag1);
      let pos2 = this.tagPos.get(tag2);
      // swap content
      this.contentLines = [...this.contentLines.slice(0,pos1),...this.contentLines.slice(pos2,pos2+tagLength),
                           ...this.contentLines.slice(pos1,pos2),...this.contentLines.slice(pos2+tagLength)];
      writeFile(Constants.sepNotesCategoryFilePath,addEof(this.contentLines.join('\n')));
      // swap children pos
      [children[index - 1], children[index]] = [children[index], children[index - 1]];
      // adjust tagpos
      let curNestedTag = new NestedTag(tag2);
      for(let i = pos1;i < pos2 + tagLength; i++){
        let line = this.contentLines[i];
        if(Constants.glineIdentity.isTagOutLine(line)){
          curNestedTag.update(line);
          this.tagPos.set(curNestedTag.getFullTag(),i);
        }
      }
      logger.debug('swapOrder end');
    }
    static getDesc(){
      logger.debug('NotesCat getDesc start');
      let descs: Map<string, string> = new Map<string, string>();
      let contentLines = this.getContentLines();
      let curNestedTag = new NestedTag();
      let desc = '';
      let tagStart = false;
      let crossDesc = false;
      for (let line of contentLines) {
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
        else if (Constants.glineIdentity.isTagOutLine(line)) {
          if (desc.trim().length > 0) {
            descs.set(curNestedTag.getFullTag(), desc);
          }
          desc = '';
          crossDesc = false;
          curNestedTag.update(line);
        }
        else if (!crossDesc) {
          if (Constants.glineIdentity.isFileStart(line)) {
            crossDesc = true;
          }
          else {
            desc += addEof(line);
          }
        }
      }
      if (desc.trim().length > 0) {
        descs.set(curNestedTag.getFullTag(), desc);
      }
      logger.debug('NotesCat getDesc end');
      return descs;
    }
    static getTreeViewRoot():Array<OutLineItem>{
      return this.childrens.get('');
    }
    static getChildren(parentTag:NestedTag):Array<OutLineItem>{
      logger.debug('getChildren start parent:'+ parentTag.getFullTag());
      let children:Array<OutLineItem>;
      if(!this.childrens.get(parentTag.getFullTag())){
        let startpos = this.tagPos.get(parentTag.getFullTag());
        logger.debug('startpos:'+startpos.toString());
        let contentLines = this.contentLines.slice(startpos);
        children = new Array<OutLineItem>();
        let curNestedTag = new NestedTag(parentTag.getFullTag());
        let tmpOutLineItem = new OutLineItem(vscode.TreeItemCollapsibleState.None);
        let enterOutLine = false;
        let enterCodeBlock = false;
        let isFirstCode = false;
        for (let line of contentLines) {
          if (Constants.glineIdentity.isTagOutLine(line)) {
            curNestedTag.update(line);
            if (!curNestedTag.contain(parentTag)) {
              break;
            }
            if (curNestedTag.getLevel() == (parentTag.getLevel() + 1)) {
              children.push(new OutLineItem(vscode.TreeItemCollapsibleState.Collapsed,curNestedTag, OutLineItemType.Tag));
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
        this.childrens.set(parentTag.getFullTag(),children);
      }
      else{
        children = this.childrens.get(parentTag.getFullTag());
      }
      logger.debug('getChildren end');
      return children;
    }
    static moveUp(tag:NestedTag){
      logger.debug('moveUp start ');
      let children = this.childrens.get(tag.getParentTag());
      let index = children.findIndex(item => item.tag.compareTag(tag,false) == 0);
      if(index > 0){
        let nextNodePos = this.contentLines.length;
        if(index < (children.length - 1)){
          nextNodePos = this.tagPos.get(children[index + 1].tag.getFullTag());
        }
        else if(tag.getLevel() > 1){
          let curParent = tag.getParentTag();
          let parents = this.childrens.get(tag.getParentTag(2));
          let parentIndex = parents.findIndex(item => item.tag.compareString(curParent,false) == 0);
          if(parentIndex < (parents.length - 1)){
            nextNodePos = this.tagPos.get(parents[parentIndex + 1].tag.getFullTag());
          }
        }
        let tagLength = nextNodePos - this.tagPos.get(tag.getFullTag());
        this.swapOrder(children,index,tagLength);
      }
      logger.debug('moveUp end ');
    }
    static moveDown(tag:NestedTag){
      logger.debug('moveDown start ');
      let children = this.childrens.get(tag.getParentTag());
      let index = children.findIndex(item => item.tag.compareTag(tag,false) == 0);
      if(index < (children.length - 1)){
        this.moveUp(children[index + 1].tag);
      }
      logger.debug('moveDown end ');
    }
    static getContentLines():string[]{
      return splitIntoLines(fs.readFileSync(Constants.sepNotesCategoryFilePath).toString());
    }
}