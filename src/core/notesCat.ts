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
    static descs: Map<string, string> = new Map<string,string>();
    static extensionContext;
    static tagOutLineProvider;
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
      this.refreshDesc();
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
      this.load();
      this.tagOutLineProvider.refresh();
      logger.debug('NotesCat refresh end');
    }
    static load(){
      logger.debug('load start');
      let entries =  this.extensionContext.workspaceState.get(Constants.TagOrder);
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
    static save(){
      let entries = Array.from(this.tagOrder.entries()).map(([key,value])=>({ key, value }));
      this.extensionContext.workspaceState.update(Constants.TagOrder,entries);
    }
    static getOrder(tag:NestedTag, start: number = -1){
      let order:Array<string> = new Array<string>();
      if(start == -1){
        start = tag.getLevel();
      }
      for(let level = start;level>=1;level--){
        let oriNestedTag = tag.getParentTag(level - 1);
        if(this.tagOrder.has(oriNestedTag)){
          order.push(this.tagOrder.get(oriNestedTag));
        } 
        else{
          let orisTag = tag.getLastTag(level);
          order.push(orisTag);
        }
      }
      return order;
    }
    // tag2 --> tag1
    static swapOrder(children:Array<OutLineItem>, index1: number, tagLength1:number,index2:number, tagLength2: number){
      logger.debug('swapOrder start: index1:'+ index1.toString()+' taglength1:'+tagLength1.toString()+" index2:"+index2.toString()) + ' length2:'+tagLength2.toString();
      let tag1 = children[index1].tag;
      let sTag1 = tag1.getFullTag();
      let tag2 = children[index2].tag;
      let sTag2 = tag2.getFullTag();
      let pos1 = this.tagPos.get(sTag1);
      let pos2 = this.tagPos.get(sTag2);
      let order1 = this.getOrder(tag1,1)[0];
      // move down
      if(index1 > index2){
        // swap order
        for(let i = index1;i > index2; i--){
          this.tagOrder.set(children[i].tag.getFullTag(),this.getOrder(children[i - 1].tag,1)[0]);
        }
        // swap content
        this.contentLines = [...this.contentLines.slice(0,pos2),...this.contentLines.slice(pos2+tagLength2,pos1+tagLength1),
                           ...this.contentLines.slice(pos2,pos2+tagLength2), ...this.contentLines.slice(pos1+tagLength1)];
      }
      // move up
      else{
        //swap order
        for(let i = index1;i < index2; i++){
          this.tagOrder.set(children[i].tag.getFullTag(),this.getOrder(children[i + 1].tag,1)[0]);
        }
        // swap content
        this.contentLines = [...this.contentLines.slice(0,pos1),...this.contentLines.slice(pos2,pos2+tagLength2),
                           ...this.contentLines.slice(pos1,pos2), ...this.contentLines.slice(pos2+tagLength2)];
      }
      this.tagOrder.set(tag2.getFullTag(),order1);
      writeFile(Constants.sepNotesCategoryFilePath,addEof(this.contentLines.join('\n')));
      this.save();
      this.refresh();
      logger.debug('swapOrder end');
    }
    static refreshDesc(){
      logger.debug('NotesCat refreshDesc start');
      this.descs.clear();
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
            this.descs.set(curNestedTag.getFullTag(), desc);
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
        this.descs.set(curNestedTag.getFullTag(), desc);
      }
      logger.debug('NotesCat getDesc end');
      return this.descs;
    }
    static getTagDesc(tagp:NestedTag){
      if(this.descs.has(tagp.getFullTag())){
        return this.descs.get(tagp.getFullTag());
      }
      else{
        return '';
      }
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
            if (!curNestedTag.startsWith(parentTag)) {
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
            else{
              if (isFirstCode) {
                tmpOutLineItem.line = getLineNumber(line);
                tmpOutLineItem.code = removeLineNumber(line).trimLeft();
                tmpOutLineItem.label = tmpOutLineItem.code;
                tmpOutLineItem.tag.copyTag(curNestedTag);
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
        this.DrapAndDrop(children[index - 1].tag,tag);
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
    static DrapAndDrop(tag1:NestedTag,tag2:NestedTag){
      logger.debug('DrapAndDrop start');
      // adjust order
      if(tag1.getFullTag()!=tag2.getFullTag() 
         && tag1.getParentTag()==tag2.getParentTag()){
        let children = this.childrens.get(tag1.getParentTag());
        let index1 = children.findIndex(item => item.tag.compareTag(tag1,false) == 0);
        let index2 = children.findIndex(item => item.tag.compareTag(tag2,false) == 0);
        this.swapOrder(children,index1,this.getTagLength(tag1),index2,this.getTagLength(tag2));
      }
      logger.debug('DrapAndDrop end');
    }
    static getContentLines():string[]{
      return splitIntoLines(fs.readFileSync(Constants.sepNotesCategoryFilePath).toString());
    }
    static getTagLength(tag:NestedTag):number{
      let children = this.childrens.get(tag.getParentTag());
      let index = children.findIndex(item => item.tag.compareTag(tag,false) == 0);
      let nextNodePos = this.contentLines.length;
      if (index < (children.length - 1)) {
        nextNodePos = this.tagPos.get(children[index + 1].tag.getFullTag());
      }
      else {
        for (let i = 1; i < tag.getLevel(); i++) {
          let curParent = tag.getParentTag(i);
          let parents = this.childrens.get(tag.getParentTag(i + 1));
          let parentIndex = parents.findIndex(item => item.tag.compareString(curParent, false) == 0);
          if (parentIndex < (parents.length - 1)) {
            nextNodePos = this.tagPos.get(parents[parentIndex + 1].tag.getFullTag());
            break;
          }
        }
      }
      let tagLength = nextNodePos - this.tagPos.get(tag.getFullTag());
      return tagLength;
    }
}