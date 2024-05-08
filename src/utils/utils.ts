import * as iconv from 'iconv-lite';
import * as os from 'os';
import { logger } from '../logging/logger';
import * as vscode from 'vscode';
import path from "path";
import { Constants } from '../constants/constants';
import * as fs from 'fs'; 

export function randomString(length: number, extended: boolean = false) {
    let text = "";
    let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    if (extended) possible += "èé+*][ò@à#°ù§-_!£$%&/()=<>^ì?";

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}

export function decode(buffer:Buffer,encoding:string){
    return iconv.decode(buffer,encoding);
  }
  
export function encode(content:string,encoding:string){
    return iconv.encode(content,encoding);
  }
  
export function getNewLineCharacter(): string {  
    if (os.type() === 'Windows_NT') {  
      return '\r\n';   
    } else {  
      return '\n';  
    }  
}

export function splitIntoLines(s:string):string[]{
  const lines = s.split('\n');
  if(s.endsWith('\n')){
    lines.pop();
  }
  return lines;
}

export function addEof(s:string):string{
  return s + '\n';
}

export function addMdEof(s:string):string{
  return s + '  \n';
}

export function getFileExt(filePath:string):string{
  return filePath.split('.').pop();
}

export function getFileName(filePath:string):string{
  return path.basename(filePath);
}

export function getLanguageIdetifier(associations:{ [extension: string]: string },filePath:string):string{
  for(const extension in associations){
    if(getFileExt(extension) == getFileExt(filePath)){
      return associations[extension];
    }
  }
  let ext = getFileExt(filePath);
  if(ext == 'pas'){
    return 'pascal';
  }
  else{
    return ext;
  }
}

export function getLineNumber(line:string):number{
  const regex = /^\d+/;   
  const match = line.match(regex);  
  return match ? parseInt(match[0], 10) : -1;
}

export function getKeyWordsFromSrc(line:string):Array<string>{
  let matches = new Array();
  let keyIden = '**';
  let index = line.indexOf(keyIden);
  let endIndex = 0;
  while(index >= 0){
    endIndex = line.indexOf(keyIden,index+3);
    if(endIndex >= index){
      matches.push(line.substring(index+2,endIndex));
      index = line.indexOf(keyIden,endIndex+3);
    }
    else{
      break;
    }
  }  
  return matches;
}

export function getKeywordFromMd(line:string):string{
  return line.substring(2).trim();
}

export function getLineNumberDown(documment:vscode.TextDocument, startpos:number):number{
  let content = documment.getText();
  let lines = splitIntoLines(content);
  for(let i=startpos;i<lines.length;i++){
    let line = lines[i];
    if(line.startsWith('```')){
      return getLineNumber(lines[i+1]);
    }
  }
  return -1;
}

export function getLineNumberUp(documment:vscode.TextDocument,startpos:number){
  let content = documment.getText();
  let lines = splitIntoLines(content);
  let line = '';
  for(let i=startpos-1; i>=0 ;i--){
    line = lines[i];
    if(line.startsWith('```')){
      return getLineNumber(lines[i+1]);
    }
  }
  return -1;
}

export function getSrcFileFromMd(documment:vscode.TextDocument,startpos:number): string {  
  let content = documment.getText();
  let lines = splitIntoLines(content);
  let ret = '';  
  for(let i=startpos - 1;i>=0;i--){
    let line = lines[i];
    if(line.startsWith(matchFilePathEnd())
      || line.startsWith(matchFilePathEnd(true))){
        ret = getSrcFileFromLine(line);
        if(ret.length > 0){
          return ret;
        }
    }
  }
  return '';
}
export function getSrcFileFromLine(line:string){
  const linkRegex = /\[(.*?)\]\((.*?)\)/;
  const links = line.match(linkRegex);
  let ret = ''; 

  if (links) {
    let link = links[0];
    if (link.startsWith('<') && link.endsWith('>')) {
      ret = link.slice(1, -1);
    } else {
      ret = link.split('](')[1].split(')')[0];
    }
    if (ret.length > 0) {
      return ret;
    }
  }
  return '';
}

export function getAnnoFromMd(documment:vscode.TextDocument,startpos:number){
  logger.debug('getAnnoFromMd------------------');
  let content = documment.getText();
  let lines = splitIntoLines(content);
  let ret = '';
  let start = startpos - 1;
  let line = '';
  for(let i = start; i>=0 ;i--){
    line = lines[i];
    if(line.startsWith('```') || line.startsWith('# [')){
      start = i+1;
      break;
    }
  }
  let end = startpos;
  for(let i = end;i<lines.length;i++){
    line = lines[i];
    if(line.startsWith('```')){
      end = i - 1;
      break;
    }
  }
  for(let i=start;i<=end;i++){
    ret += addEof(lines[i]);
  }
  logger.debug('start:'+start.toString()+' end:'+end.toString());
  return {"text":ret,"linenumber":getLineNumber(lines[end+2])};
}



export function getId(line:string,idOrRefer:boolean = true,identifier:string=''):string|null{
  let regex;
  if(idOrRefer){
    regex = new RegExp(`@id\\s*=\\s*([^\\s]+)`) ;  
  }
  else{
    regex = new RegExp(`${identifier}@refid\\s*=\\s*([^\\s]+)`) ;  
  }
  
  const match = line.match(regex);  
  
  return match ? match[1] : null;  
}

export function cutNoteId(line:string,noteId:string):string{
  return line.substring(line.indexOf(noteId)+noteId.length).trimLeft();
}

export function getPrefix(line:string,noteId:string):string{
  return line.substring(0,line.indexOf(noteId)+noteId.length);
}

export function isSepNotesFile(path:string):boolean{
  if(path.endsWith(Constants.sepNotesFileName)){
    return true;
  }
  else{
    return false;
  }
}

export function getMdPos(srcPath:string,srcPos:number){
    let content = fs.readFileSync(Constants.sepNotesFilePath).toString();
    let lines = splitIntoLines(content);
    const matchFileStart = matchFilePathStart(srcPath);
    const matchFileEnd = matchFilePathEnd();
    let fileStart = false;
    let lineNumber = 0;
    for(let line of lines){
      if (!fileStart) {
        if (line.startsWith(matchFileStart)) {
          fileStart = true;
        }
      }
      else {
        if((getLineNumber(line) >= srcPos) || line.startsWith(matchFileEnd)) {
          break;
        }
      }
      ++lineNumber;
    }
    return lineNumber;
}

export function getMdUserRandomNote():string{
    let content = fs.readFileSync(Constants.sepNotesFilePath).toString();
    let lines = splitIntoLines(content);
    const matchFileStart = /^#\s*[^\[]/
    const matchFileEnd = /^#\s*\[/
    let contentUser = '';
    let fileStart = false;
    for(let line of lines){
      if (!fileStart) {
        if (line.match(matchFileStart)) {
          fileStart = true;
          contentUser += addEof(line);
        }
      }
      else{
        if(line.match(matchFileEnd)){
          break;
        }
        contentUser += addEof(line);
      }
    }
    logger.debug('contentusr:'+contentUser);
    return contentUser;
}

export function rowsChanged(change: vscode.TextDocumentContentChangeEvent):number {
  let oriLineCount = change.range.end.line - change.range.start.line + 1;
  let curLineCount = change.text.split('\n').length;
  return curLineCount - oriLineCount;
}
// suppose str1 is substring of str2
export function isEqual(str1:string,str2:string){
  str1 = str1.trim();
  str2 = str2.trim();
  if(str1 == str2 || 
    ((str1.length != 0) && (str2.length != 0)
      && (str2.startsWith(str1) || str2.endsWith(str1)))){
    return true;
  }
  else{
    return false;
  }
}

export function matchFilePathStart(path:string,isAnno = false){
  let fileName = getFileName(path);
  let fileIden = '# ['+ fileName +']'+'(' + path +')' ;
  if(isAnno){
    return '<!-- ' + fileIden +' -->';
  }
  else{
    return fileIden;
  }
}

export function matchFilePathEnd(isAnno = false){
  let iden = '# [';
  if(isAnno){
    return '<!-- ' + iden;
  }
  else{
    return iden;
  }
}

export class RateLimiter {  
  private tokens: number;  
  private lastRefillTime: number;  
  private maxTokens: number;  
  private refillRate: number; // tokens per second  
  
  constructor(maxTokens: number, refillRate: number) {  
    this.tokens = maxTokens;  
    this.lastRefillTime = Date.now();  
    this.maxTokens = maxTokens;  
    this.refillRate = refillRate;  
  }  
  
  private refillTokens(): void {  
    const now = Date.now();  
    const timeSinceLastRefill = now - this.lastRefillTime;  
    const newTokens = timeSinceLastRefill / this.refillRate;  
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);  
    this.lastRefillTime = now;
  }  
  
  isAllowed(): boolean {  
    this.refillTokens();  
    if (this.tokens > 0) {  
      this.tokens--;  
      return true;  
    }  
    return false;  
  }  
} 