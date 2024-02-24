import { Constants,NoteMode} from "../constants/constants";
import {encode,decode, splitIntoLines, addEof, addMdEof, getLanguageIdetifier, getFileName} from '../utils/utils'
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Configuration } from "../configuration";
import { logger } from "../logging/logger";
import path from "path";

export class NoteFile{
    path: string;
    noteMode: NoteMode;
    statusbaritem:vscode.StatusBarItem;
    configuration: Configuration;
    blocks: Array<NoteBlock>;
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
      logger.debug('note file end');
    }

    setStatusBarItemText(noteMode:NoteMode = this.noteMode){
      this.statusbaritem.text = Constants.NoteModeItems[noteMode];
      this.noteMode = noteMode;
    }
    detachContent(){
      logger.debug('detachContent begin'+this.blocks.length.toString()+'  ,'+this.noteMode.toString());
      this.inProcess = true;
      if (this.noteMode == NoteMode.Attached) {
        const content = decode(fs.readFileSync(this.path), this.configuration.encoding);
        const contentLines = splitIntoLines(content);
        let detachedContent = '';
        this.blocks.length = 0;
        for (let i = 0; i < contentLines.length; i++) {
          let curLine = contentLines[i];
          if (curLine.includes(this.configuration.noteId)) {
            this.blocks.push(new NoteBlock(i, contentLines[i]));
          }
          else {
            detachedContent += addEof(contentLines[i]);
          }
        }
        ++this.respondCount;
        fs.writeFileSync(this.path, encode(detachedContent, this.configuration.encoding));
      }
      this.noteMode = NoteMode.Detached;
      this.inProcess = false;
      logger.debug('detachContent end');
    }

    attachContent(){
      logger.debug('attachContent begin'+this.blocks.length.toString()+'  ,'+this.noteMode.toString());
      this.inProcess = true;
      if((this.blocks.length > 0) && (this.noteMode == NoteMode.Detached)){
        const content = decode(fs.readFileSync(this.path),this.configuration.encoding);
        const contentLines = splitIntoLines(content);
        let attachedContent = '';
        let lastIndex = 0;
        let attachedLength = 0;
        for(let block of this.blocks){
          let end = lastIndex + (block.line - attachedLength);
          for(let i = lastIndex; i < end ; i++){
            attachedContent += addEof(contentLines[i]);
            ++attachedLength;
          }
          lastIndex = end;
          attachedContent += addEof(block.content);
          ++attachedLength;
        }
        for(let i = lastIndex; i<contentLines.length ; i++){
          attachedContent += addEof(contentLines[i]);
        }
        ++this.respondCount;
        fs.writeFileSync(this.path,encode(attachedContent,this.configuration.encoding));
        this.blocks.length = 0; //clear info
      }
      this.noteMode = NoteMode.Attached;
      this.inProcess = false;
      logger.debug('attachContent end');
    }
    
    async ModeSwitch(selected:string){
      logger.debug('ModeSwitch begin');
      if(selected != Constants.NoteModeItems[this.noteMode]){
        if(selected == Constants.NoteModeItems[NoteMode.Attached]){
          this.attachContent();
        }
        else{
          this.detachContent();
        }
      }
      logger.debug('ModeSwitch end');
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
    
    afterDetach():boolean{
      if(this.respondCount > 0){
        this.respondCount = 0;
        return true;
      }
      else{
        return false;
      }
    }

    notFinished():boolean{
      return this.inProcess;
    }

    exportToMd():string{
      const content = decode(fs.readFileSync(this.path),this.configuration.encoding);
      const contentLines = splitIntoLines(content);
      let below = 0;
      let lineCount = 1;
      let lastLineCount = -1;
      let contentExport = '';
      let fileName = getFileName(this.path);
      for(let line of contentLines){
        if(line.includes(this.configuration.noteId)){
          // add seperator
          if(below == 0 && lastLineCount >=0 && (lastLineCount+1) != lineCount ){
            contentExport += '  \n';
          }
          if(contentExport.length == 0){
            contentExport += '```'+getLanguageIdetifier(this.configuration.associations,this.path)+'\n';
          }
          contentExport += (lineCount.toString() + '  ' + addEof(line.replace(new RegExp(this.configuration.noteId,'g'),'')));
          below = 3;
        }
        else if(below > 0){
          contentExport += (lineCount.toString() + '  ' + addEof(line));
          --below;
          if(below == 0){
            lastLineCount = lineCount;
          }
        }
        ++lineCount;
      }
      if(contentExport.length > 0){
        contentExport = '['+ fileName +']'+'(' + this.path +')' + '  \n' + contentExport + '```\n';
      }
      logger.info('from:'+Constants.markdownFilePath+'  TO:'+this.path);
      logger.info('path:' + this.path + ' ' + contentExport);
      return contentExport;
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
        noteMode: this.noteMode, // 确保NoteMode可以被序列化  
        blocks: this.blocks.map(block => block.toJSON()) // 对每个NoteBlock实例调用toJSON方法  
      };  
    }  
}
// sddw
class NoteBlock{
  line: number;
  content: string;
  constructor(linep: number, contentp: string){
    this.line = linep;
    this.content = contentp;
  }
  toJSON(): any {  
    return {  
      line: this.line,  
      content: this.content  
    };  
  }
}
