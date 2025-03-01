import { Constants,MdType,NoteMode} from "../constants/constants";
import {encode,decode, splitIntoLines, addEof, getLanguageIdetifier, getLineNumber, isEqual, writeFile, canAttachFile} from '../utils/utils'
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Configuration } from "../configuration";
import { logger } from "../logging/logger";
import { NestedTag} from "./tag";
import { LineIdentity } from "./LineIdentity";
import { NotesCat } from "./notesCat";
import { NoteFileTree } from "./noteFileTree";
import { NoteId, TimeType } from "./noteId";

export class NoteFile{
    path: string;
    noteMode: NoteMode;
    statusbaritem:vscode.StatusBarItem;
    configuration: Configuration;
    blocks: Array<NoteBlock>;
    mdChangedLine: Array<NoteBlock>;
    respondCount: number;
    inProcess: boolean;
    needRefresh: boolean;
    mdChangeType: MdType;
    lineIdentity: LineIdentity;
    noteLineIdMax: number;
    constructor(filePath:string,noteMode:NoteMode,configuration:Configuration,statusbar:vscode.StatusBarItem,blocks:Array<NoteBlock> = new Array(),needrefresh:boolean = false,
            noteLineIdMax:number = 1){
      this.path = filePath;
      this.configuration = configuration;
      this.statusbaritem = statusbar;
      this.noteMode = noteMode;
      this.blocks = blocks;
      this.respondCount = 0;
      this.inProcess = false;
      this.mdChangedLine = new Array();
      this.needRefresh = needrefresh;
      this.mdChangeType = MdType.None;
      this.lineIdentity = new LineIdentity(this.path);
      this.noteLineIdMax = noteLineIdMax;
    }

    setStatusBarItemText(noteMode:NoteMode = this.noteMode){
      this.statusbaritem.text = Constants.NoteModeItems[noteMode];
      this.noteMode = noteMode;
    }
    detachContent(detachAll:boolean = false,document:vscode.TextDocument = null):number{
      logger.debug('detachContent begin'+this.blocks.length.toString()+'  ,'+this.noteMode.toString());
      let detached = 0;
      this.inProcess = true;
      if (this.noteMode == NoteMode.Attached) {
        const contentLines = this.getContentLines(document);
        let detachedContent = '';
        let block = new NoteBlock();
        let noteLines = 0;
        this.blocks.length = 0;
        for (let i = 0; i < contentLines.length; i++) {
          let curLine = contentLines[i];
          if (NoteId.includesNoteId(curLine)) {
            if(block.noteLineCount <= 0){
              block.note += addEof(contentLines[i]);
              block.noteLineCount += 1;
            }
            else{
              block.note += addEof(contentLines[i]);
              block.noteLineCount += 1;
            }
            ++noteLines;
          }
          else {
            if(block.noteLineCount > 0 && block.codeLine < 0){
              block.codeLine = i - noteLines;
              block.codeBelow = addEof(contentLines[i]);
              this.blocks.push(block);
              block = new NoteBlock();
            }
            detachedContent += addEof(contentLines[i]);
          }
        }
        if(block.noteLineCount > 0 && block.codeLine < 0){
          block.codeLine = contentLines.length - noteLines;
          this.blocks.push(block);
        }
        if(!detachAll){
          this.respondCount = 1;
        }
        else{
          this.respondCount = 2;
        }
        try{
          logger.debug('detachContent writefile:'+this.path);
          fs.writeFileSync(this.path, encode(detachedContent, this.configuration.encoding));
          this.noteMode = NoteMode.Detached;
          detached = 1;
        }catch(error){
          logger.error('something wrong when detach file');
          vscode.window.showErrorMessage('something wrong when detach file:'+this.path);
          this.blocks.length = 0;
        }
      }
      this.inProcess = false;
      logger.debug('detachContent end');
      return detached;
    }
   
    private getAttachContent(contentLines:string[],beforeAdjust:boolean = true):{"content":string,"notMatchNum":number}{
      logger.debug('getAttachContent start--------------------');
      let attachedContent = '';
      let blockIndex = this.blocks.length;
      let block:NoteBlock;
      let lastIndex = 0;
      let end = 0;
      let notMatchNum = 0;
      this.blocks.sort((a,b) =>  a.codeLine - b.codeLine);
      for (let i = 0; i < this.blocks.length; i++) {
        block = this.blocks[i];
        end = block.codeLine;
        if (end >= contentLines.length) {
          blockIndex = i;
          break;
        }
        for (let j = lastIndex; j < end; j++) {
          attachedContent += addEof(contentLines[j]);
        }
        lastIndex = end;
        attachedContent += block.note;
        if(beforeAdjust){
          if (end < contentLines.length && !isEqual(block.codeBelow, contentLines[end])) {
            block.changedLine = 1;
            ++notMatchNum;
          }
          else {
            block.changedLine = 0;
          }
        }
      }
      for (let i = lastIndex; i < contentLines.length; i++) {
        attachedContent += addEof(contentLines[i]);
      }
      for (let i = blockIndex; i < this.blocks.length; i++) {
        block = this.blocks[i];
        attachedContent += block.note;
        if(beforeAdjust){
          block.changedLine = 1;
          ++notMatchNum;
        }
      }
      logger.debug('getAttachContent end--------------------');
      return {"content":attachedContent,"notMatchNum":notMatchNum};
    }
     
    attachContent(attachAll:boolean = false,document:vscode.TextDocument = null){
      logger.debug('attachContent begin'+this.blocks.length.toString()+'  ,'+this.noteMode.toString());
      let attached = 0;
      let notMatchNum = 0;
      this.inProcess = true;
      if(this.noteMode == NoteMode.Detached){
        if((this.blocks.length > 0)){
          const contentLines = this.getContentLines(document);
          let attachedContent = '';
          let getAttachContentRet = this.getAttachContent(contentLines);
          notMatchNum = getAttachContentRet.notMatchNum;
          attachedContent = getAttachContentRet.content;
          // need adjust pos
          if(notMatchNum > 0){
            logger.debug('need rematch--------------');
            if(this.configuration.reMatch){
              logger.debug('user setting need rematch---------');
              this.adjustNotePos(contentLines);
              // merge block
              attachedContent = this.getAttachContent(contentLines,false).content;
            }
            this.exportToMdDiff(attachAll);
          }
          if(!attachAll){
            this.respondCount = 1;
          }
          else{
            this.respondCount = 2;
          }
          try{
            logger.debug('attachContent writefile:'+this.path);
            fs.writeFileSync(this.path,encode(attachedContent,this.configuration.encoding));
            this.blocks.length = 0; //clear info
            this.noteMode = NoteMode.Attached;
            attached = 1;
          }catch(error){
            logger.error('something wrong when atach file');
            vscode.window.showErrorMessage('something wrong when atach file '+this.path);
          }          
        }
        else if(!attachAll){
          this.noteMode = NoteMode.Attached;
          attached = 1;
        }
      }
      else{
        attached = 1;
      }
      this.inProcess = false;
      logger.debug('attachContent end');
      return {'attached':attached,'hasDiff':(notMatchNum > 0)};
    }
    
    ModeSwitch(selected:string,document:vscode.TextDocument = null):number{
      logger.debug('ModeSwitch begin');
      let status = 0;
      // if(document.getText().includes(this.configuration.noteId)){
      //   this.noteMode = NoteMode.Attached;
      // }
      // else{
      //   this.noteMode = NoteMode.Detached;
      // }
      if(selected != Constants.NoteModeItems[this.noteMode]){
        if(selected == Constants.NoteModeItems[NoteMode.Attached]){
          status = this.attachContent(false,document).attached;
        }
        else{
          status = -1 * this.detachContent(false,document);
        }
      }
      logger.debug('ModeSwitch end');
      return status;
    }

    isAttached():boolean{
      return this.noteMode != NoteMode.Detached;
    }

    canNoteIt():boolean{
      if((this.blocks.length > 0) && (this.noteMode == NoteMode.Detached)){
        return false;
      }
      else{
        return true;
      }
    }
    haveNote():boolean{
      if(((this.blocks.length > 0) || (this.noteMode == NoteMode.Attached)) && canAttachFile(this.path)){
        return true;
      }
      else{
        return false;
      }
    }
    
    afterDetachOrAttach():number{
      //all files
      if(this.respondCount == 2){
        this.respondCount = 0;
        return 1;
      }
      // single file
      else if(this.respondCount == 1){
        this.respondCount = 0;
        return 0;
      }
      else{
        return -1;
      }
    }

    notFinished():boolean{
      return this.inProcess;
    }

    getMdFromSrc(document:vscode.TextDocument = null):{"content":string,"contentByCat":Map<string,string>}{
      logger.debug('getMdFromSrc----start-------------------------------');
      const contentLines = this.getContentLines(document);
      let below = 0;  //code block max lines below note
      let lineCount = 1;
      let contentExport = '';
      let contentcatblock = new ContentCatBlock();
      let contentcatblocks = new Array<ContentCatBlock>();
      let tempContent = '';
      let contentByCat:Map<string,string> = new Map<string,string>();
      for(let line of contentLines){
        // new start
        if(NoteId.includesNoteId(line)){
          if(below > 0 && below < 3){
            contentcatblock.addCodeEnd();
            contentcatblocks.push(contentcatblock);
            contentcatblock = new ContentCatBlock();
          }
          tempContent = NoteId.cutNoteId(line);
          contentcatblock.addNote(tempContent);
          below = 3;
        }
        else if(below > 0){
          if(below == 3){
            contentcatblock.addCodeBegin(getLanguageIdetifier(this.configuration.associations,this.path));
          }
          contentcatblock.addCode(lineCount, line);
          --below;
          if(below == 0){
            contentcatblock.addCodeEnd();
            contentcatblocks.push(contentcatblock);
            contentcatblock = new ContentCatBlock();
          }
        }
        ++lineCount;
      }
      if(below > 0 && below < 3){
        contentcatblock.addCodeEnd();
        contentcatblocks.push(contentcatblock);
        contentcatblock = new ContentCatBlock();
      }
      for(let ele of contentcatblocks){
        contentExport += ele.content;
        if(ele.hasKeyword()){
          for(let keyword of ele.tags){
            if(contentByCat.has(keyword)){
              contentByCat.set(keyword,contentByCat.get(keyword) + '  \n' + this.lineIdentity.curFileStartAnno +'  \n' + ele.contentCat);
            }
            else{
              contentByCat.set(keyword,this.lineIdentity.curFileStartAnno + '  \n' + ele.contentCat);
            }
          }
        }
      }
      if(contentExport.length > 0){
        contentExport = this.lineIdentity.curFileStart + '  \n' + contentExport + '  \n  \n';
      }
      logger.debug('from:'+Constants.sepNotesFilePath+'  TO:'+this.path);
      logger.debug('getMdFromSrc----end-------------------------------');
      return {"content":contentExport,"contentByCat":contentByCat};
    }

    //`sepNotes.md`
    refreshMd(document:vscode.TextDocument = null, mdStatus:string = ''){
      if(this.isAttached()){
        logger.debug('refreshMd----start-----------------');
        let contentLines = this.getContentLines(null,Constants.sepNotesFilePath);
        if(mdStatus != ''){
          contentLines[1] = mdStatus;
        }
        let contentAll = '';
        let fileStart = false;
        let fileEnd = false;
        for(let line of contentLines){
          if(!fileStart){
            if(this.lineIdentity.isCurFileStart(line)){
              fileStart = true;
            }
            else{
              contentAll += addEof(line);
            }
          }
          else if(!fileEnd){
            if(this.lineIdentity.isOtherFileStart(line)){
              fileEnd = true;
              contentAll += this.getMdFromSrc(document).content;
              contentAll += addEof(line);
            }
          }
          else{
            contentAll += addEof(line);
          }
        }
        if(!fileEnd){
          contentAll += this.getMdFromSrc(document).content;
        }
        fs.copyFileSync(Constants.sepNotesFilePath,Constants.sepNotesBakFilePath);
        writeFile(Constants.sepNotesFilePath, contentAll);
        if(this.mdChangeType == MdType.sepNotes){
          this.mdChangedLine.length = 0;
        }
        NoteFileTree.refresh(this);
        logger.debug('refreshMd---end------------------');
      }
    }    

    // `sepNotes_category.md`
    refreshMdCat(document:vscode.TextDocument = null){
      if(this.isAttached()){
        logger.debug('refreshMdCat  start-------------------');
        let ret = this.getMdFromSrc(document);
        let contentByCat = ret.contentByCat;
        if(NotesCat.isModified(contentByCat,this.path)){
          NotesCat.updateNote(contentByCat,this.path);
          NotesCat.writeFileAccodingNodes();
          NotesCat.refresh();
        }
        if (this.mdChangeType == MdType.sepNotesCat) {
          this.mdChangedLine.length = 0;
        }
        logger.debug('refreshMdCat  end-------------------');
      }
    }

    refresh(document:vscode.TextDocument = null, mdStatus:string){
      this.refreshMd(document,mdStatus);
      this.refreshMdCat(document);
      this.needRefresh = false;
    }

    clearCache(){
      this.mdChangedLine.length = 0;
      this.needRefresh = false;
    }

    getContentLines(document:vscode.TextDocument = null, path:string = ''):string[]{
      let content = '';
      let encoding = 'UTF-8';
      let tmpPath = path;
      if (document) {
        content = document.getText().toString();
      }
      else {
        if(path.trim().length == 0){
          tmpPath = this.path;   
          encoding = this.configuration.encoding;
        }
        content = decode(fs.readFileSync(tmpPath), encoding);
      }
      return splitIntoLines(content);
    }

    syncSrcWithMd(text:string,linenumber:number,mdType:MdType){
      if(this.isAttached()){
        logger.debug('syncSrcWithMd: start'+linenumber.toString());
        const contentLines = this.getContentLines();
        // can consider another way to add anno(now prefix + content)
        let line = contentLines[linenumber - 2];
        const prefix = NoteId.getPrefix(line);
        let id = NoteId.getId(line);
        NoteId.updateTime(this.path,id,TimeType.modify,line);
        const annoLines = splitIntoLines(text);
        let annoConcat ='';
        for(let line of annoLines){
          annoConcat += addEof(prefix + line);
        }
        let start = 0;
        for(let i = (linenumber - 2);i >= 0;i--){
          if(!NoteId.includesNoteId(contentLines[i])){
            start = i + 1;
            break;
          }
        }
        let ret = '';
        for(let i=0;i<start;i++){
          ret += addEof(contentLines[i]);
        }
        ret += annoConcat;
        logger.debug('syncSrcWithMd:'+annoConcat);
        start = linenumber - 1;
        for(let i = (linenumber -1);i<contentLines.length;i++){
          if(!NoteId.includesNoteId(contentLines[i])){
            start = i;
            break;
          }
        }
        for(let i=start;i<contentLines.length;i++){
          ret += addEof(contentLines[i]);
        }
        try{
          logger.debug('syncSrcWithMd writefile:'+this.path);
          fs.writeFileSync(this.path, encode(ret, this.configuration.encoding));
          if(mdType == MdType.sepNotes){
            this.refreshMdCat();
          }
          else{
            this.refreshMd();
          }
        }catch(error){
          logger.error('something wrong when syncSrcWithMd writefile');
          vscode.window.showErrorMessage('something wrong when syncSrcWithMd writefile '+this.path);
        }
        logger.debug('syncSrcWithMd: end'+linenumber.toString());
      }
    }

    //linenumber:note block first code line 
    //changedLine: note block move lines 
    updateMdLine(linenumber:number, changedLine:number, mdType:MdType){
      if(changedLine != 0){
        logger.debug('updateMdLine start----------------');
        if(mdType != this.mdChangeType){
          this.mdChangedLine.length = 0;
        }
        if(this.mdChangedLine.length == 0){
          this.mdChangeType = mdType;
          let contentLines;
          if(mdType == MdType.sepNotes){
            contentLines = this.getContentLines(null,Constants.sepNotesFilePath);
          }
          else{
            contentLines = NotesCat.contentLines;
          }
          let fileStart = false;
          for (let i=0;i<contentLines.length;i++) {
            let line = contentLines[i];
            if (!fileStart) {
              if (this.lineIdentity.isCurFileStart(line)) {
                fileStart = true;
              }
            }
            else {
              if (this.lineIdentity.isOtherFileStart(line)) {
                fileStart = false;
                if(mdType == MdType.sepNotes)
                  break;
              }
              else if(line.startsWith('```'+getLanguageIdetifier(this.configuration.associations,this.path))
                  && (i+1) < (contentLines.length)){
                let lineprefix = getLineNumber(contentLines[i+1]);
                let noteblock = new NoteBlock(lineprefix,'',1);
                this.mdChangedLine.push(noteblock)  
              }
            }
          }
          this.mdChangedLine.sort((a,b)=> a.codeLine - b.codeLine);
        }
        for (let block of this.mdChangedLine) {
          if (block.codeLine == linenumber) {
            block.changedLine += changedLine;
            break;
          }
        }
        this.needRefresh = true;
        logger.debug('updateMdLine end----------------');
      }
    }

    isMdLineChanged(mdType:MdType):boolean{
      return this.mdChangedLine.length != 0 && mdType == this.mdChangeType;
    }

    // linenumber: block first code line
    getMdLine(linenumber:number){
      let accuLines = 0;
      for (let block of this.mdChangedLine) {
        if (block.codeLine == linenumber) {
          return block.codeLine + block.changedLine + accuLines;
        }
        else{
          accuLines += block.changedLine;
        }
      }
      return linenumber;
    }

    getDetachedLine(linenumber:number){
      if(!this.isAttached()){
        let noteLines = 0;
        for(let block of this.blocks){
          if((block.codeLine + block.noteLineCount + noteLines + 1) > linenumber){
            break;
          }
          noteLines += block.noteLineCount;
        }
        return linenumber - noteLines;
      }
      return linenumber; 
    }

    adjustNotePos(lines:string[]){
      logger.debug('adjustNotePos start');
      let block:NoteBlock;
      let nextPos;
      let prePos;
      let accuLines = 0;
      for(let blockIndex = 0;blockIndex < this.blocks.length;blockIndex++){
        block = this.blocks[blockIndex];
        // need adjust
        if(block.changedLine == 1){
          let curLineNumber = block.codeLine;
          if(curLineNumber >= lines.length){
            curLineNumber = lines.length - 1;
          }
          if((curLineNumber + accuLines) > 0 && (curLineNumber + accuLines) < lines.length){
            if(isEqual(block.codeBelow,lines[curLineNumber + accuLines])){
              block.codeLine = curLineNumber + accuLines;
              block.changedLine = 0;
              continue;
            }
          }
          nextPos = lines.length;
          prePos = 0;
          if(blockIndex > 0){
            prePos = this.blocks[blockIndex - 1].codeLine;
          }
          let find = false;
          for (let i = 0; i < lines.length; i++) {
            if (((curLineNumber + i)>=nextPos) && ((curLineNumber - i)<=prePos)) {
              break;
            }
            if (((curLineNumber - i) > prePos) && isEqual(block.codeBelow,lines[curLineNumber - i])) {
              find = true;
              block.changedLine = curLineNumber - i - block.codeLine;
              block.codeLine = curLineNumber - i;
              accuLines += block.changedLine;
              break;
            }
            if (((curLineNumber + i) < nextPos) && isEqual(block.codeBelow,lines[curLineNumber + i])) {
              find = true;
              block.changedLine = curLineNumber + i - block.codeLine;
              block.codeLine = curLineNumber + i;
              accuLines += block.changedLine;
              break;
            }
          }
          if (!find) {
            block.changedLine = Number.MAX_SAFE_INTEGER;
          }
        }
      }
      logger.debug('adjustNotePos end');
    }

    exportToMdDiff(attachAll:boolean = false){
      logger.debug('exportToMdDiff start-------------');
      let diffNote = '';
      let accuLines = 0;
      this.needRefresh = true;
      for(let block of this.blocks){
        accuLines += block.noteLineCount;
        if(block.changedLine != 0){
          if((!this.configuration.reMatch) || block.changedLine == Number.MAX_SAFE_INTEGER){
            diffNote += 'not matched and stay still \n';
            this.needRefresh = false;
          }
          else{
            diffNote += 'move'+ (block.changedLine > 0 ? ' up ':' down ') + Math.abs(block.changedLine).toString()+' lines \n';
          }
          diffNote += block.note;
          diffNote += '```'+getLanguageIdetifier(this.configuration.associations,this.path)+'\n';
          diffNote += ((block.codeLine + accuLines + 1).toString()+ '  ' + block.codeBelow);
          diffNote += '```\n';  
        }
      }
      diffNote = this.lineIdentity.curFileStart + '  \n' + diffNote + '  \n  \n';
      if (!attachAll) {
        logger.debug('exportToMdDiff writefile:'+Constants.sepNotesDiffFilePath);
        try{
          fs.writeFileSync(Constants.sepNotesDiffFilePath, diffNote);
          vscode.window.showWarningMessage('codes have changed, please see the diff in ' + Constants.sepNotesDiffFileName);
        }catch(error){
          logger.error('something wrong when exportToMdDiff writefile');
          vscode.window.showErrorMessage('something wrong when exportToMdDiff writefile');
        }
      }
      else {
        fs.appendFileSync(Constants.sepNotesDiffFilePath, diffNote);
      }
      logger.debug('exportToMdDiff end-------------');
    }

    isMatch(lineNumber:number,code:string,contentLine:string = ''):boolean{
      if(lineNumber > 0){
        contentLine = this.getContentLines()[lineNumber-1];
      }
      if(contentLine.trim() != code.trim()){
        return false;
      }
      else{
        return true;
      }
    }
    writeFile(content:string){
      fs.writeFileSync(this.path, encode(content, this.configuration.encoding));
    }
    generateLineId():string{
      this.noteLineIdMax += 1;
      return this.noteLineIdMax.toString();
    }
    fillLostId(){
      logger.debug('fillLostId start');
      if (this.noteMode == NoteMode.Attached) {
        const contentLines = this.getContentLines();
        let filledContent = '';
        let needChange = true;
        let id = '';
        let containNote = true;
        for (let i = 0; i < contentLines.length; i++) {
          let curLine = contentLines[i];
          if(NoteId.includesNoteId(curLine)){
            containNote = true;
          }
          else{
            containNote = false;
          }
          if (containNote && NoteId.getId(curLine) == ''){
            if(needChange){
              id = this.generateLineId();
              needChange = false;
            }
            curLine = NoteId.fillLostNoteId(id,curLine);
            NoteId.updateTime(this.path,id,TimeType.create,curLine);
          }
          if(!containNote){
            needChange = true;
          }
          filledContent += addEof(curLine);
        }
        fs.writeFileSync(this.path, encode(filledContent, this.configuration.encoding));
      }
      logger.debug('fillLostId end');
    }
    getLineFromId(id:string):number{
      if(this.isAttached()){
        const contentLines = this.getContentLines();
        for (let i = 0; i < contentLines.length; i++) {
          let curLine = contentLines[i];
          if (NoteId.includesNoteId(curLine)
              && NoteId.getId(curLine) == id) {
            return i;
          }
        }
      }
      else{
        for(let block of this.blocks){
          if(NoteId.getId(block.note) == id){
            return block.codeLine;
          }
        } 
      }
      return 0;
    }
    getNoteFromNoteLine(noteLine:number):string{
      noteLine = this.getDetachedLine(noteLine);
      let lastNote = '';
      if(!this.isAttached()){
        for(let block of this.blocks){
          if(block.codeLine <= noteLine){
            lastNote = block.note;
          }
          else{
            break;
          }
        } 
      }
      logger.debug('noteline:'+noteLine+' '+lastNote);
      return lastNote;
    }
}
export class serializableNoteFile{
    path: string;
    noteMode: NoteMode;
    blocks: Array<NoteBlock>;
    needRefresh?: boolean;
    noteLineIdMax?: number;
    constructor(notefile:NoteFile){
      this.path = notefile.path;
      this.noteMode = notefile.noteMode;
      this.blocks = notefile.blocks;
      this.needRefresh = notefile.needRefresh;
      this.noteLineIdMax = notefile.noteLineIdMax;
    }

    toJSON(): any {  
      return {
        path: this.path,  
        noteMode: this.noteMode, 
        blocks: this.blocks,
        needRefresh: this.needRefresh,
        noteLineIdMax: this.noteLineIdMax
      };  
    }  
}

export class NoteBlock{
  codeLine: number;      //zero based index
  note: string;          // note block content
  noteLineCount: number; // note block lines count
  codeBelow: string; //code below(for match)
  changedLine: number;
  outline: string;  //outline such as ###
  noteLine: number; //line number for note(notes maybe multiple lines and cannot be distinguished by codeLine)
  constructor(codeLinep: number = -1, notep: string = '', noteLineCountp:number = 0, codeBelowp:string = '', changedline:number = 0, outlinep:string = '',notelinep:number = 0){
    this.codeLine = codeLinep;
    this.note = notep;
    this.noteLineCount = noteLineCountp;
    this.codeBelow = codeBelowp;
    this.changedLine = changedline;
    this.outline = outlinep;
    this.noteLine = notelinep;
  }
  toJSON(): any {  
    return {  
      codeLine: this.codeLine,  
      note: this.note,
      noteLineCount: this.noteLineCount,
      codeBelow: this.codeBelow,
      changedLine: this.changedLine   
    }; 
  }
}

class ContentCatBlock{
  tags: Set<string>;
  content: string;
  contentCat: string;
  constructor(keywordp = new Set<string>(), contentp = '', contentCatp = ''){
    this.tags = keywordp;
    this.content = contentp;
    this.contentCat = contentCatp;
  }
  addNote(contentP:string){
    this.content += addEof(contentP);
    this.contentCat += addEof(NotesCat.removeOutlineMarker(contentP));
    this.addKeywords(NestedTag.getTag(contentP));
  }
  addCodeBegin(identifier:string){
    let contentp = '```'+identifier+'\n';
    this.content += contentp;
    this.contentCat += contentp;
  }
  addCode(lineCount:number,line:string){
    let contentp = lineCount.toString() + '  ' + addEof(line); 
    this.content += contentp;
    this.contentCat += contentp;
  }
  addCodeEnd(){
    let contentp = '```\n';
    this.content += contentp;
    this.contentCat += contentp;
  }
  private addKeywords(eles:Array<string>){
    for(let ele of eles){
      this.tags.add(ele);
    }
  }
  hasKeyword(){
    return this.tags.size > 0;
  }
}
