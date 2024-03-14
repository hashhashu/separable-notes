import { Constants,NoteMode} from "../constants/constants";
import {encode,decode, splitIntoLines, addEof, getLanguageIdetifier, getFileName, getId, cutNoteId, getPrefix, getLineNumber} from '../utils/utils'
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Configuration } from "../configuration";
import { logger } from "../logging/logger";

export class NoteFile{
    path: string;
    noteMode: NoteMode;
    statusbaritem:vscode.StatusBarItem;
    configuration: Configuration;
    blocks: Array<NoteBlock>;
    ids: Array<NoteBlock>;
    mdChangedLine: Array<NoteBlock>;
    respondCount: number;
    inProcess: boolean;
    constructor(filePath:string,noteMode:NoteMode,configuration:Configuration,statusbar:vscode.StatusBarItem,blocks:Array<NoteBlock> = new Array()){
      logger.debug('note file begin');
      this.path = filePath;
      this.configuration = configuration;
      this.statusbaritem = statusbar;
      this.noteMode = noteMode;
      this.blocks = blocks;
      this.respondCount = 0;
      this.inProcess = false;
      this.ids = new Array();
      this.mdChangedLine = new Array();
      logger.debug('note file end');
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
        const content = this.getContent(document);
        const contentLines = splitIntoLines(content);
        let detachedContent = '';
        let block = new NoteBlock();
        let noteLines = 0;
        this.blocks.length = 0;
        for (let i = 0; i < contentLines.length; i++) {
          let curLine = contentLines[i];
          if (curLine.includes(this.configuration.noteId)) {
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
        fs.writeFileSync(this.path, encode(detachedContent, this.configuration.encoding));
        this.noteMode = NoteMode.Detached;
        detached = 1;
      }
      this.inProcess = false;
      logger.debug('detachContent end');
      return detached;
    }

    attachContent(attachAll:boolean = false,document:vscode.TextDocument = null){
      logger.debug('attachContent begin'+this.blocks.length.toString()+'  ,'+this.noteMode.toString());
      let attached = 0;
      let notMatchNum = 0;
      this.inProcess = true;
      if(this.noteMode == NoteMode.Detached){
        if((this.blocks.length > 0)){
          const content = this.getContent(document);
          const contentLines = splitIntoLines(content);
          let attachedContent = '';
          let lastIndex = 0;
          let end = 0;
          notMatchNum = 0;
          for(let block of this.blocks){
            end = block.codeLine;
            logger.debug('lastindex:'+lastIndex.toString()+' end:'+end.toString());
            for(let i = lastIndex; i < end ; i++){
              attachedContent += addEof(contentLines[i]);
            }
            lastIndex = end;
            attachedContent += block.note;
            if(end < contentLines.length && block.codeBelow.trim() != contentLines[end].trim()){
              block.changedLine = 1;
              ++notMatchNum;
            }
            else{
              block.changedLine = 0;
            }
          }
          for(let i = lastIndex; i<contentLines.length ; i++){
            attachedContent += addEof(contentLines[i]);
          }
          // need adjust pos
          if(notMatchNum > 0){
            if(this.configuration.reMatch){
              this.adjustNotePos(contentLines);
              // merge block
              attachedContent = '';
              lastIndex = 0;
              for(let block of this.blocks){
                end = block.codeLine;
                logger.debug('lastindex:'+lastIndex.toString()+' end:'+end.toString());
                for(let i = lastIndex; i < end ; i++){
                  attachedContent += addEof(contentLines[i]);
                }
                lastIndex = end;
                attachedContent += block.note;
              }
              for(let i = lastIndex; i<contentLines.length ; i++){
                attachedContent += addEof(contentLines[i]);
              }
            }
            this.exportToMdDiff(attachAll);
          }
          if(!attachAll){
            this.respondCount = 1;
          }
          else{
            this.respondCount = 2;
          }
          fs.writeFileSync(this.path,encode(attachedContent,this.configuration.encoding));
          this.blocks.length = 0; //clear info
          this.noteMode = NoteMode.Attached;
          attached = 1;
        }
        else if(!attachAll){
          this.noteMode = NoteMode.Attached;
          attached = 1;
        }
      }
      this.inProcess = false;
      logger.debug('attachContent end');
      return {'attached':attached,'hasDiff':(notMatchNum > 0)};
    }
    
    ModeSwitch(selected:string,document:vscode.TextDocument = null):number{
      logger.debug('ModeSwitch begin');
      let status = 0;
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

    shouldWarn():boolean{
      if((this.blocks.length > 0) && (this.noteMode == NoteMode.Detached)){
        return true;
      }
      else{
        return false;
      }
    }
    shouldSave():boolean{
      if((this.blocks.length > 0) || (this.noteMode == NoteMode.Attached)){
        return true;
      }
      else{
        return false;
      }
    }
    toJSON(): any {  
      return {
        path: this.path,  
        noteMode: this.noteMode, // 确保NoteMode可以被序列化  
        blocks: this.blocks.map(block => block.toJSON()) // 对每个NoteBlock实例调用toJSON方法  
      };  
    }
    
    afterDetach():number{
      if(this.respondCount == 2){
        this.respondCount = 0;
        return 1;
      }
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

    exportToMd(document:vscode.TextDocument = null):string{
      let content = this.getContent(document);
      const contentLines = splitIntoLines(content);
      let below = 0;
      let lineCount = 1;
      let contentExport = '';
      let fileName = getFileName(this.path);
      for(let line of contentLines){
        if(line.includes(this.configuration.noteId)){
          if(below > 0 && below < 3){
            contentExport += '```\n';
          }
          contentExport += addEof(cutNoteId(line,this.configuration.noteId));
          below = 3;
        }
        else if(below > 0){
          if(below == 3){
            contentExport += '```'+getLanguageIdetifier(this.configuration.associations,this.path)+'\n';
          }
          contentExport += (lineCount.toString() + '  ' + addEof(line));
          --below;
          if(below == 0){
            contentExport += '```\n';
          }
        }
        ++lineCount;
      }
      if(below > 0 && below < 3){
        contentExport += '```\n';
      }
      if(contentExport.length > 0){
        contentExport = '# ['+ fileName +']'+'(' + this.path +')' + '  \n' + contentExport + '  \n  \n';
      }
      this.mdChangedLine.length = 0;
      logger.debug('from:'+Constants.sepNotesFilePath+'  TO:'+this.path);
      // logger.info('path:' + this.path + ' ' + contentExport);
      return contentExport;
    }

    refreshMd(document:vscode.TextDocument = null, mdStatus:string){
      logger.debug('refreshMd---------------------');
      const content = fs.readFileSync(Constants.sepNotesFilePath).toString();
      let contentLines = splitIntoLines(content);
      contentLines[1] = mdStatus;
      let fileName = getFileName(this.path);
      let contentAll = '';
      const matchFileStart = '# ['+ fileName +']'+'(' + this.path +')';
      const matchFileEnd = '# [';
      let fileStart = false;
      let fileEnd = false;
      for(let line of contentLines){
        if(!fileStart){
          if(line.startsWith(matchFileStart)){
            fileStart = true;
          }
          else{
            contentAll += addEof(line);
          }
        }
        else if(!fileEnd){
          if(line.startsWith(matchFileEnd)){
            fileEnd = true;
            contentAll += this.exportToMd(document);
            contentAll += addEof(line);
          }
        }
        else{
          contentAll += addEof(line);
        }
      }
      if(!fileEnd){
        contentAll += this.exportToMd(document);
      }
      fs.writeFileSync(Constants.sepNotesFilePath, contentAll);
    }    

    refreshId(document:vscode.TextDocument = null){
      if(this.isAttached()){
        this.ids.length = 0;
        let content = this.getContent(document);
        const contentLines = splitIntoLines(content);
        let lineCount = 1;
        for(let line of contentLines){
          if(line.includes(this.configuration.noteId)){
            let id = getId(line);
            if(id){
              logger.debug('id:'+id);
              this.ids.push(new NoteBlock(lineCount,id));
            }
          }
          ++lineCount;
        }
      }
    }

    getIds(){
      return this.ids;
    }

    matchId(ido:string,document:vscode.TextDocument = null){
      if(this.isAttached()){
        for(let idi of this.ids){
          if(idi.note == ido){
            let ret = '';
            let content = this.getContent(document);
            const contentLines = splitIntoLines(content);
            for(let i = idi.codeLine ; i<Math.min(contentLines.length,idi.codeLine+3) ;i++){
              ret += addEof(contentLines[i-1]);
            }
            return {"line":idi.codeLine,"content":ret};
          }
        }
      }
      return {"line":0,"content":''};
    }

    refresh(document:vscode.TextDocument = null, mdStatus:string){
      this.refreshId(document);
      this.refreshMd(document,mdStatus);
    }

    private getContent(document:vscode.TextDocument = null):string{
      let content = '';
      if (document) {
        content = document.getText().toString();
      }
      else {
        content = decode(fs.readFileSync(this.path), this.configuration.encoding);
      }
      return content;
    }

    syncSrcWithMd(text:string,linenumber:number){
      logger.debug('syncSrcWithMd:'+linenumber.toString());
      if(this.isMdLineChanged()){
        linenumber = this.getMdLine(linenumber);
        logger.debug('syncSrcWithMd af:'+linenumber.toString());
      }
      let content = this.getContent();
      const contentLines = splitIntoLines(content);
      const prefix = getPrefix(contentLines[linenumber - 2],this.configuration.noteId);
      const annoLines = splitIntoLines(text);
      let annoConcat ='';
      for(let line of annoLines){
        annoConcat += addEof(prefix + line);
      }
      let start = linenumber - 2;
      for(let i = start;i>=0;i--){
        if(!contentLines[i].includes(this.configuration.noteId)){
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
      for(let i=linenumber - 1;i<contentLines.length;i++){
        ret += addEof(contentLines[i]);
      }
      fs.writeFileSync(this.path, encode(ret, this.configuration.encoding));
    }

    updateMdLine(linenumber:number, changedLine:number){
      if(this.mdChangedLine.length == 0){
        const content = fs.readFileSync(Constants.sepNotesFilePath).toString();
        const contentLines = splitIntoLines(content);
        let fileName = getFileName(this.path);
        const matchFileStart = '# [' + fileName + ']' + '(' + this.path + ')';
        const matchFileEnd = '# [';
        let fileStart = false;
        let fileEnd = false;
        for (let i=0;i<contentLines.length;i++) {
          let line = contentLines[i];
          if (!fileStart) {
            if (line.startsWith(matchFileStart)) {
              fileStart = true;
            }
          }
          else if (!fileEnd) {
            if (line.startsWith(matchFileEnd)) {
              fileEnd = true;
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
      }
      for (let block of this.mdChangedLine) {
        if (block.codeLine == linenumber) {
          block.changedLine += changedLine;
          break;
        }
      }
    }

    isMdLineChanged():boolean{
      return this.mdChangedLine.length != 0;
    }

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
      return 0;
    }

    adjustNotePos(lines:string[]){
      let block:NoteBlock;
      let nextPos;
      let prePos;
      let accuLines = 0;
      for(let blockIndex = 0;blockIndex < this.blocks.length;blockIndex++){
        block = this.blocks[blockIndex];
        // need adjust
        if(block.changedLine == 1){
          let curLineNumber = block.codeLine;
          if((curLineNumber + accuLines) > 0 && (curLineNumber + accuLines) < lines.length){
            if(block.codeBelow.trim() == lines[curLineNumber + accuLines].trim()){
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
            if (((curLineNumber - i) > prePos) && block.codeBelow.trim() == lines[curLineNumber - i].trim()) {
              find = true;
              block.changedLine = curLineNumber - i - block.codeLine;
              block.codeLine = curLineNumber - i;
              accuLines += block.changedLine;
              break;
            }
            if (((curLineNumber + i) < nextPos) && (block.codeBelow.trim() == lines[curLineNumber + i].trim())) {
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
    }

    exportToMdDiff(attachAll:boolean = false){
      let diffNote = '';
      let accuLines = 0;
      for(let block of this.blocks){
        accuLines += block.noteLineCount;
        if(block.changedLine != 0){
          if((!this.configuration.reMatch) || block.changedLine == Number.MAX_SAFE_INTEGER){
            diffNote += 'not matched and stay still \n';
          }
          else{
            diffNote += 'move '+ (block.changedLine > 0) ? 'up':'down' + Math.abs(block.changedLine).toString()+' lines \n';
          }
          diffNote += block.note;
          diffNote += '```'+getLanguageIdetifier(this.configuration.associations,this.path)+'\n';
          diffNote += ((block.codeLine + accuLines + 1).toString()+ '  ' + block.codeBelow);
          diffNote += '```\n';  
        }
      }
      let fileName = getFileName(this.path);
      diffNote = '# [' + fileName + ']' + '(' + this.path + ')' + '  \n' + diffNote + '  \n  \n';
      if (!attachAll) {
        fs.writeFileSync(Constants.sepNotesDiffFilePath, diffNote);
                            const options = ['View Diff File'];
        vscode.window.showWarningMessage('codes have changed, please see the diff in ' + Constants.sepNotesDiffFilePath);
      }
      else {
        fs.appendFileSync(Constants.sepNotesDiffFilePath, diffNote);
      }
    }
}
export class serializableNoteFile{
    path: string;
    noteMode: NoteMode;
    blocks: Array<NoteBlock>;
    constructor(notefile:NoteFile){
      this.path = notefile.path;
      this.noteMode = notefile.noteMode;
      this.blocks = notefile.blocks;
    }

    toJSON(): any {  
      return {
        path: this.path,  
        noteMode: this.noteMode, 
        blocks: this.blocks.map(block => block.toJSON())
      };  
    }  
}

class NoteBlock{
  codeLine: number;
  note: string;
  noteLineCount: number;
  codeBelow: string; //code below(for match)
  changedLine: number;
  constructor(codeLinep: number = -1, notep: string = '', noteLineCountp:number = 0, codeBelowp:string = '', changedline:number = 0){
    this.codeLine = codeLinep;
    this.note = notep;
    this.noteLineCount = noteLineCountp;
    this.codeBelow = codeBelowp;
    this.changedLine = changedline;
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
