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
    static descs: Map<string, string> = new Map<string,string>();
    static addedTag = new Set<string>();
    static extensionContext;
    static tagOutLineProvider;
    static refresh(){
      logger.debug('NotesCat refresh start');
      this.contentLines = this.getContentLines();
      this.tagPos.clear();
      this.childrens.clear();
      this.addedTag.clear();
      let headings = new Array<OutLineItem>();
      let curNestedTag = new NestedTag();
      let linenumber = 0;
      this.refreshDesc();
      for(let line of this.contentLines){
        if(Constants.glineIdentity.isTagOutLine(line)){
          curNestedTag.update(line);
          this.tagPos.set(curNestedTag.getFullTag(),linenumber);
          // only first level
          if(NestedTag.getOutLine(line).length == 1){
            let tag = NestedTag.getOutLineTag(line);
            this.addedTag.add(tag);
            headings.push(new OutLineItem(vscode.TreeItemCollapsibleState.Collapsed,new NestedTag(tag),OutLineItemType.Tag));
          }
        }
        linenumber = linenumber + 1;
      }
      this.childrens.set('',headings);
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
    static getChildren(parent:OutLineItem):Array<OutLineItem>{
      let parentTag = parent.tag;
      logger.debug('getChildren start parent:'+ parentTag.getFullTag());
      let children:Array<OutLineItem>;
      if(this.childrens.has(parentTag.getFullTag())){
        children = this.childrens.get(parentTag.getFullTag());
      }
      else if(this.tagPos.has(parentTag.getFullTag())){
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
              this.addedTag.add(curNestedTag.getFullTag());
              let item = new OutLineItem(vscode.TreeItemCollapsibleState.Collapsed,curNestedTag, OutLineItemType.Tag);
              item.parent = parent;
              children.push(item);
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
                tmpOutLineItem.parent = parent;
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
    static rename(tag:NestedTag,newLabel:string):Map<string,NotesSrcChanged>{
      logger.debug('rename start old:'+tag.getFullTag()+' newlabel:'+newLabel);
      let tagStart = this.tagPos.get(tag.getFullTag());
      let contentLines = this.contentLines;
      let curNestedTag = new NestedTag();
      curNestedTag.copyTag(tag);
      let line:string;
      let enterCodeBlock = false;
      let path = '';
      let count = 0;
      let srcChanges = new Map<string,NotesSrcChanged>();
      for(let i = tagStart + 1;i<contentLines.length; i++){
        line = contentLines[i];
        if(Constants.glineIdentity.isTagOutLine(line)){
          curNestedTag.update(line);
          if(curNestedTag.getLevel() <= tag.getLevel())
          {
            break;
          }
        }
        else if(Constants.glineIdentity.isFileStart(line)){
          path = getSrcFileFromLine(line);
          if(!srcChanges.has(path)){
            srcChanges.set(path,new NotesSrcChanged(path,tag.getFullTag(),newLabel));
            logger.debug('src path added:'+path);
          }
          enterCodeBlock = false;
          count = 0;
        }
        else if(Constants.glineIdentity.isCodeStart(line)){
          enterCodeBlock = !enterCodeBlock;
        }
        else if(enterCodeBlock){
          if(count > 0){
            let offset = getLineNumber(line) - i + 1;
            srcChanges.get(path).updateLine(count,offset);
            count = 0;
          }
        }
        else{
          srcChanges.get(path).add(i);
          count += 1;
        } 
      }
      if(this.tagOrder.has(tag.getFullTag())){
        this.tagOrder.set(newLabel,this.tagOrder.get(tag.getFullTag()));
        this.save();
      }
      logger.debug('rename end');
      return srcChanges;
    }

    static getItems():Array<string>{
      return Array.from(this.tagPos.keys());
    }

    static revealItem(sTag:string):OutLineItem{
      logger.debug('revealItem start');
      let tag = new NestedTag(sTag);
      let item:OutLineItem;
      let parentItem:OutLineItem = null;
      let parentTag = '';
      for (let i = tag.getLevel() - 1; i >=0; i--) {
        let curTag = tag.getParentTag(i);
        if (!this.addedTag.has(curTag)) {
          this.getChildren(parentItem);
        }
        // fetch existed item
        let children = this.childrens.get(parentTag);
        for(let child of children){
          if(child.tag.getFullTag() == curTag){
            item = child;
            break;
          }
        }
        parentItem = item;
        parentTag = curTag;
        logger.debug('item:'+item.tag.getFullTag());
      }
      logger.debug(item.tag.getFullTag());
      logger.debug('-------------------');
      if(item.parent){
        logger.debug(item.parent.tag.getFullTag());
      }
      this.tagOutLineProvider.refresh();
      logger.debug('revealItem end');
      return item;
    }
}

export class NotesSrcChanged{
  path:string;
  oriTag:string;
  newTag:string;
  linenumbers:Array<number> = new Array<number>(); 
  constructor(pathp:string,oriTagp:string,newTagp:string){
    this.path = pathp;
    this.oriTag = '#'+oriTagp;
    this.newTag = '#'+newTagp;
  }
  add(linenumber:number){
    this.linenumbers.push(linenumber);
  }
  updateLine(count:number,offset:number){
    logger.debug('offset:'+offset.toString());
    let length = this.linenumbers.length;
    for(let i = 0;i<count;i++){
      logger.debug('ori:'+this.linenumbers[length - i - 1].toString());
      this.linenumbers[length - i - 1] += offset;
    }
  }
  getContent(contentLinesp:Array<String>):string{
    for(let i = 0;i<this.linenumbers.length;i++){
      let regex = new RegExp(this.oriTag,'g');
      contentLinesp[this.linenumbers[i] - 1] = contentLinesp[this.linenumbers[i] - 1].replace(regex,this.newTag);
      logger.debug('number:'+this.linenumbers[i].toString() + '  src:'+contentLinesp[this.linenumbers[i] - 1]);
    }
    return addEof(contentLinesp.join('\n'));
  }
}