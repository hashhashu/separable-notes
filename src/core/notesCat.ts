import * as vscode from 'vscode';
import { Constants, OutLineItemType } from "../constants/constants";
import { addEof, getLineNumber, getSrcFileFromLine, joinEof, removeLineNumber, splitIntoLines,writeFile } from "../utils/utils";
import { NestedTag } from "./tag";
import { OutLineItem } from "./treeView";
import * as fs from 'fs';
import { logger } from '../logging/logger';
import { NoteId, TimeType } from './noteId';

export class NotesCat{
    static contentLines: string[];
    static notesCatNodes:Map<string,NotesCatNode> = new Map<string,NotesCatNode>();
    static tagOrder: Map<string,string>;
    static childrens: Map<string,Array<OutLineItem>> = new Map<string,Array<OutLineItem>>();
    static addedTag = new Set<string>();
    static extensionContext;
    static tagOutLineProvider;
    static refresh(contentLines = this.getContentLines()){
      logger.debug('NotesCat refresh start');
      this.contentLines = contentLines;
      this.childrens.clear();
      this.addedTag.clear();
      this.notesCatNodes.clear();
      let headings = new Array<OutLineItem>();
      let curNestedTag = new NestedTag();
      let linenumber = -1;
      let notesCatNode;
      let crossDesc = false;
      let tagStart = false;
      let path = '';
      let tmpOutLineItem:OutLineItem;
      let firstLevel = false;
      for(let line of this.contentLines){
        linenumber = linenumber + 1;
        // skip the beginning
        if (!tagStart && !Constants.glineIdentity.isTagOutLine(line)) {
          continue;
        }
        else{
          tagStart = true;
        }
        if(Constants.glineIdentity.isTagOutLine(line)){
          curNestedTag.update(line);
          notesCatNode = new NotesCatNode(linenumber);
          this.notesCatNodes.set(curNestedTag.getFullTag(),notesCatNode);
          crossDesc = false;
          firstLevel = false;
          // only first level
          if(NestedTag.getOutLine(line).length == 1){
            let tag = NestedTag.getOutLineTag(line);
            this.addedTag.add(tag);
            tmpOutLineItem = new OutLineItem(vscode.TreeItemCollapsibleState.Collapsed,new NestedTag(tag),OutLineItemType.Tag,'','',linenumber); 
            headings.push(tmpOutLineItem);
            firstLevel = true;
          }
        }
        else if (Constants.glineIdentity.isFileStart(line)) {
            path = getSrcFileFromLine(line);
            notesCatNode.addNotes(path,addEof(line));
            crossDesc = true;
        }
        else if(!crossDesc) {
            notesCatNode.tagDescs += addEof(line);
            if(firstLevel){
              tmpOutLineItem.updateTagDesc();
            }
        }
        else{
          notesCatNode.addNotes(path,addEof(line));
        }
      }
      this.childrens.set('',headings);
      this.load();
      this.tagOutLineProvider.refresh();
      logger.debug('NotesCat refresh end');
    }
    static load(){
      logger.debug('load start');
      let entries;
      if(fs.existsSync(Constants.sepNotesMetadataPath)){
        let content = fs.readFileSync(Constants.sepNotesMetadataPath,'utf8');
        let jsonObj = JSON.parse(content);
        entries = jsonObj.tagOrder;
      }
      if(!entries){
        entries =  this.extensionContext.workspaceState.get(Constants.TagOrder);
      }
      if(entries){
        this.tagOrder = new Map(entries.map(entry => [entry.key, entry.value]));
      }
      else{
        this.tagOrder = new Map<string,string>();
      }
      let toDelete = [];
      for(let [key,value] of this.tagOrder){
        if((!this.notesCatNodes.has(key))
          || (key == value))
        {
          toDelete.push(key);
        }
      }
      for(let ele of toDelete){
        this.tagOrder.delete(ele);
      }
      // avoid abnormal situation(tag lost) that tow value correspond to same value
      let anchorValue = new Map<string,Array<string>>();
      for(let [key,_] of this.notesCatNodes){
        if(!this.tagOrder.has(key)){
          if(anchorValue.has(key)){
            anchorValue.get(key).push(key);
          }
          else{
            anchorValue.set(key,[key]);
          }
        }
      }
      for(let [key,value] of this.tagOrder){
        value = (new NestedTag(key).getParentTag())+'/'+value;
        if(anchorValue.has(value)){
          anchorValue.get(value).push(key);
        }
        else{
          anchorValue.set(value,[key]);
        }
      }
      for(let [_,values] of anchorValue){
        if(values.length > 1){
          for(let value of values){
            this.tagOrder.delete(value);
          }
        }
      }
      this.save();
      logger.debug('load end');
    }
    static save(){
      let entries = Array.from(this.tagOrder.entries()).map(([key,value])=>({ key, value }));
      this.extensionContext.workspaceState.update(Constants.TagOrder,entries);
      let jsonStr = JSON.stringify({"tagOrder":entries});
      fs.writeFileSync(Constants.sepNotesMetadataPath,jsonStr,"utf8");
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
      let pos1 = this.getTagPos(sTag1);
      let pos2 = this.getTagPos(sTag2);
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
      writeFile(Constants.sepNotesCategoryFilePath,joinEof(this.contentLines));
      this.save();
      this.refresh();
      logger.debug('swapOrder end');
    }
    static hasTagDesc(tag:string){
      return this.getTagDesc(tag) != '';
    }
    static getTagDesc(tag:string){
      if(this.hasTag(tag)){
        return this.notesCatNodes.get(tag).tagDescs;
      }
      else{
        return '';
      }
    }
    static removeTagDesc(tag:string){
      if(this.hasTagDesc(tag)){
        this.notesCatNodes.get(tag).removeDesc();
      }
    }
    static getTreeViewRoot():Array<OutLineItem>{
      return this.childrens.get('');
    }
    static getChildren(parent:OutLineItem):Array<OutLineItem>{
      let parentTag = parent.tag;
      // logger.debug('getChildren start parent:'+ parentTag.getFullTag());
      let children:Array<OutLineItem>;
      if(this.childrens.has(parentTag.getFullTag())){
        children = this.childrens.get(parentTag.getFullTag());
      }
      else if(this.hasTag(parentTag.getFullTag())){
        let startpos = this.getTagPos(parentTag.getFullTag());
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
              let item = new OutLineItem(vscode.TreeItemCollapsibleState.Collapsed,curNestedTag, OutLineItemType.Tag,'','',this.getTagPos(curNestedTag.getFullTag()));
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
      // logger.debug('getChildren end');
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
        nextNodePos = this.getTagPos(children[index + 1].tag.getFullTag());
      }
      else {
        for (let i = 1; i < tag.getLevel(); i++) {
          let curParent = tag.getParentTag(i);
          let parents = this.childrens.get(tag.getParentTag(i + 1));
          let parentIndex = parents.findIndex(item => item.tag.compareString(curParent, false) == 0);
          if (parentIndex < (parents.length - 1)) {
            nextNodePos = this.getTagPos(parents[parentIndex + 1].tag.getFullTag());
            break;
          }
        }
      }
      let tagLength = nextNodePos - this.getTagPos(tag.getFullTag());
      return tagLength;
    }
    static rename(tag:NestedTag,newLabel:string):Map<string,NotesSrcChanged>{
      logger.debug('rename start old:'+tag.getFullTag()+' newlabel:'+newLabel);
      let tagFullTag = tag.getFullTag();
      let tagStart = this.getTagPos(tagFullTag);
      let contentLines = this.contentLines;
      let curNestedTag = new NestedTag();
      curNestedTag.copyTag(tag);
      let line:string;
      let enterCodeBlock = false;
      let path = '';
      let count = 0;
      let srcChanges = new Map<string,NotesSrcChanged>();
      for(let i = tagStart;i<contentLines.length; i++){
        line = contentLines[i];
        if(Constants.glineIdentity.isTagOutLine(line)){
          curNestedTag.update(line);
          if(i > tagStart && curNestedTag.getLevel() <= tag.getLevel())
          {
            break;
          }
          path = '';
          // replace desc tag
          let curFullTag = curNestedTag.getFullTag();
          if(this.hasTagDesc(curFullTag)){
            let tagDesc = this.getTagDesc(curFullTag);
            this.removeTagDesc(curFullTag);
            let newFullTag = ('#'+curFullTag).replace('#'+tagFullTag,newLabel);
            let newNode:NotesCatNode;
            if(!this.hasTag(newFullTag)){
              newNode = new NotesCatNode(0,tagDesc);
              this.notesCatNodes.set(newFullTag,newNode);
            }
            else{
              this.notesCatNodes.get(newFullTag).tagDescs = tagDesc;
            }
          }
        }
        else if(Constants.glineIdentity.isFileStart(line)){
          path = getSrcFileFromLine(line);
          if(!srcChanges.has(path)){
            srcChanges.set(path,new NotesSrcChanged(path,tagFullTag,newLabel));
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
        // inline notes
        else if(path != ''){
          srcChanges.get(path).add(i);
          count += 1;
        } 
      }
      if(this.tagOrder.has(tagFullTag)){
        this.tagOrder.set(newLabel,this.tagOrder.get(tagFullTag));
        this.save();
      }
      logger.debug('rename end');
      return srcChanges;
    }

    static getItems():Array<string>{
      return Array.from(this.notesCatNodes.keys());
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
    static hasTag(tag:string){
      return this.notesCatNodes.has(tag);
    }
    static getTagPos(tag:string){
      return this.notesCatNodes.get(tag).tagPos;
    }

    static writeFileAccodingNodes(){
      logger.debug('writeFileAccodingNodes start');
      let contentByCatAll:Map<string,string> = new Map<string,string>();
      for(let [tag,node] of this.notesCatNodes){
        contentByCatAll.set(tag,node.getContent());
      }
      let sortedCat:Array<string>;
      let lastNestedTag = new NestedTag();
      let contentMdCat = Constants.sepNotesCatDesc;
      sortedCat = Array.from(contentByCatAll.keys());
      sortedCat.sort((a,b)=>NestedTag.compareNestedTag(a,b));
      for(let tag of sortedCat){
          // logger.debug('lastNestedTag:'+lastNestedTag.tags.join('/')+' tag:'+tag);
          for(let outline of lastNestedTag.needAddOutLine(tag)){
              contentMdCat += addEof(outline);
          }
          contentMdCat += contentByCatAll.get(tag);
          lastNestedTag.setTags(tag);
      }
      writeFile(Constants.sepNotesCategoryFilePath, contentMdCat);       
      logger.debug('writeFileAccodingNodes end');
    }

    static updateNote(srcNotes:Map<string,string>, path:string){
      logger.debug('updateNote start');
      // remove
      let toDeleteTag = new Array<string>();
      for(let [tag,node] of this.notesCatNodes){
        node.removeNotes(path);
        if(node.isEmpty()){
          toDeleteTag.push(tag);
        }
      }
      for(let tag of toDeleteTag){
        this.notesCatNodes.delete(tag);
      }
      // add
      for(let [tag,content] of srcNotes){
        let node:NotesCatNode;
        if(this.notesCatNodes.has(tag)){
          node = this.notesCatNodes.get(tag);
        }
        else{
          node = new NotesCatNode();
          this.notesCatNodes.set(tag,node);
        }
        node.addNotes(path,content);
      }
      logger.debug('updateNote end');
    }

    static isModified(srcNotes:Map<string,string>, path:string){
      logger.debug('isModified start');
      for(let [tag,node] of this.notesCatNodes){
        if(node.isModified(path,srcNotes.get(tag) || '')){
          return true;
        }
      }
      for(let [tag,content] of srcNotes){
        let hasTag = this.notesCatNodes.has(tag);
        if(!hasTag && content != ''){
          return true;
        }
        else if(hasTag && this.notesCatNodes.get(tag).isModified(path,content)){
          return true;
        }
      }
      logger.debug('isModified end');
      return false;
    }

    static removeNotes(){
      let toDeleteTag = new Array<string>();
      for(let [tag,node] of this.notesCatNodes){
        if(!node.hasDesc()){
          toDeleteTag.push(tag);
        }
      }
      for(let tag of toDeleteTag){
        this.notesCatNodes.delete(tag);
      }
    }

    // add $ after #   (#)->(#$)
    static removeOutlineMarker(line:string):string{
      const regex = /^\s*#+\s+/;   
      const match = line.match(regex);
      if(match){
        return line.replace(/^(\s*#+)(.*)/,(match, prefix, suffix) => {
          return prefix + '$' + suffix;  
        }); 
      }
      else{
        return line;
      }  
    }

    // remove $ after #  (#$)->(#)
    static recoverOutlineMarker(line:string):string{
      const regex = /^\s*#+\$\s+/;   
      const match = line.match(regex);
      if(match){
        return line.replace(/^(\s*#+\$)(.*)/, (match, prefix, suffix) => {
          return prefix.substring(0,prefix.length - 1) + suffix;  
        });
      }
      else{
        return line;
      }  
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
  getContent(contentLinesp:Array<string>):string{
    for(let i = 0;i<this.linenumbers.length;i++){
      let regex = new RegExp(this.oriTag,'g');
      contentLinesp[this.linenumbers[i] - 1] = contentLinesp[this.linenumbers[i] - 1].replace(regex,this.newTag);
      let content = contentLinesp[this.linenumbers[i] - 1];
      NoteId.updateTime(this.path,NoteId.getId(content),TimeType.modify,content);
      logger.debug('number:'+this.linenumbers[i].toString() + '  src:'+contentLinesp[this.linenumbers[i] - 1]);
    }
    return joinEof(contentLinesp);
  }
}

export class NotesCatNode{
  tagPos:number;
  tagDescs:string;
  codeNotes:Map<string,string>; //path,content
  constructor(tagPosp = 0, tagDescsp = ''){
    this.tagPos = tagPosp;
    this.tagDescs = tagDescsp;
    this.codeNotes = new Map<string,string>();
  }
  removeDesc(){
    this.tagDescs = '';
  }
  hasDesc():boolean{
    return this.tagDescs != '';
  }
  getContent(){
    let content = this.tagDescs;
    for(let [_,codeNote] of this.codeNotes){
      content += codeNote;
    }
    return content;
  }
  addNotes(path:string,content:string){
    let oriContent = '';
    if(this.codeNotes.has(path)){
      oriContent = this.codeNotes.get(path);
    }
    this.codeNotes.set(path,oriContent + content);
  }
  removeNotes(path:string){
    this.codeNotes.delete(path);
  }
  isEmpty(){
    return this.tagDescs == '' && this.codeNotes.size == 0;
  }
  isModified(path:string,content:string){
    let oriContent = '';
    if(this.codeNotes.has(path)){
      oriContent = this.codeNotes.get(path);
    }
    return oriContent != content;
  }
}