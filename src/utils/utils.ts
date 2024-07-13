import * as iconv from 'iconv-lite';
import * as os from 'os';
import { logger } from '../logging/logger';
import * as vscode from 'vscode';
import path from "path";
import { Constants } from '../constants/constants';
import * as fs from 'fs'; 
import { LineIdentity } from '../core/LineIdentity';

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

export function getRelativePath(filePath:string):string{
  filePath = filePath.replace(/\\/g,'\\\\',);
  filePath = path.relative(Constants.workspaceFolder,filePath);
  return filePath;
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

export function removeLineNumber(line:string):string{
  let number = getLineNumber(line);
  if(number >= 0){
    return line.substring(number.toString().length + 2);
  }
  else{
    return line;
  }
}

export function getKeywordFromMd(line:string):string{
  return line.substring(2).trim();
}

export function getLineNumberDown(documment:vscode.TextDocument, startpos:number):number{
  let content = documment.getText();
  let lines = splitIntoLines(content);
  let line = '';
  let ret = -1;
  for(let i=startpos;i<lines.length;i++){
    line = lines[i];
    // code block end
    if(line.trim() == '```'){
      ret = getLineNumber(lines[i - 1]);
      if (ret > 0) {
        return ret;
      }
    }
    // code block start
    else if(line.startsWith('```')){
      if((i+1)<lines.length){
        ret = getLineNumber(lines[i+1]);
        if(ret > 0){
          return ret;
        }
      }
    }
    // file end
    else if(Constants.glineIdentity.isFileStart(line)){
      break;
    }
  }
  return -1;
}

export function getLineNumberUp(documment:vscode.TextDocument,startpos:number){
  let content = documment.getText();
  let lines = splitIntoLines(content);
  let line = '';
  let ret = -1;
  for(let i=startpos-1; i>=0 ;i--){
    line = lines[i];
    // code block end
    if(line.trim() == '```'){
      if((i-1) > 0){
        ret = getLineNumber(lines[i-1]);
        if(ret > 0){
          return ret;
        }
      }
    }
    // code block start
    else if(line.startsWith('```')){
      ret = getLineNumber(lines[i+1]);
      if(ret > 0){
        return ret;
      }
    }
    // file end
    else if(Constants.glineIdentity.isFileStart(line)){
      break;
    }
  }
  return -1;
}

export function getSrcFileFromMd(documment:vscode.TextDocument,startpos:number): string {  
  let content = documment.getText();
  let notCrossTag = isSepNotesCatFile(documment.uri.fsPath);
  let lines = splitIntoLines(content);
  let ret = '';  
  for(let i=startpos;i>=0;i--){
    let line = lines[i];
    if(notCrossTag && Constants.glineIdentity.isTagOutLine(line)){
      break;
    }
    if(Constants.glineIdentity.isFileStart(line)){
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
      ret = path.join(Constants.workspaceFolder,ret);
      return ret;
    }
  }
  return '';
}

export function getAnnoFromMd(documment:vscode.TextDocument,startpos:number){
  logger.debug('getAnnoFromMd------------------');
  let content = documment.getText();
  let sepNotesCat = isSepNotesCatFile(documment.uri.fsPath);
  let lines = splitIntoLines(content);
  let ret = '';
  let start = startpos - 1;
  let line = '';
  // search forward
  for(let i = start; i>=0 ;i--){
    line = lines[i];
    if(Constants.glineIdentity.isCodeStart(line) 
      || Constants.glineIdentity.isFileStart(line)){
      start = i+1;
      break;
    }
  }
  let end = startpos;
  // search backward
  for(let i = end;i<lines.length;i++){
    line = lines[i];
    if(line.startsWith('```')){
      end = i - 1;
      break;
    }
  }
  for(let i=start;i<=end;i++){
    line = lines[i];
    // syncMdWithSrc maybe cause some irregular changes
    if(sepNotesCat 
      && (Constants.glineIdentity.isFileStart(line)
          || Constants.glineIdentity.isTagOutLine(line))){
            return {"text":'',"linenumber":-1,"codeBelow":''};
          }
    if(isSepNotesCatFile(documment.uri.fsPath)){
      ret += addEof(recoverOutlineMarker(line));
    }
    else{
      ret += addEof(line);
    }
    
  }
  logger.debug('start:'+start.toString()+' end:'+end.toString());
  return {"text":ret,"linenumber":getLineNumber(lines[end+2]),"codeBelow":removeLineNumber(lines[end+2])};
}

export function getMatchLineCount(documment:vscode.TextDocument,matchText:string):number{
  let content = documment.getText();
  let lines = splitIntoLines(content);
  let count = 0;
  for(let line of lines){
    if(isEqual(matchText,line)){
      ++count;
    }
  }
  return count;
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

export function removeOutlineMarker(line:string):string{
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

export function recoverOutlineMarker(line:string):string{
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

export function isSepNotesCatFile(path:string):boolean{
  if(path.endsWith(Constants.sepNotesCategoryFileName)){
    return true;
  }
  else{
    return false;
  }
}

export function canSync(path:string):boolean{
  if(isSepNotesFile(path)
    || isSepNotesCatFile(path)){
    return true;
  }
  else{
    return false;
  }
}

export function canAttachFile(path:string):boolean{
  if(isSepNotesFile(path)
    || isSepNotesCatFile(path)
    || path.endsWith(Constants.sepNotesDiffFileName)){
    return false;
  }
  else{
    return true;
  }
}

export function getMdPos(srcPath:string,srcPos:number){
    let content = fs.readFileSync(Constants.sepNotesFilePath).toString();
    let lines = splitIntoLines(content);
    let lineIdentity = new LineIdentity(srcPath);
    let inCode = false;
    let fileStart = false;
    let lineNumber = 0;
    for(let line of lines){
      if (!fileStart) {
        if (lineIdentity.isCurFileStart(line)) {
          fileStart = true;
          inCode = false;
        }
      }
      else if(!inCode){
        if(lineIdentity.isCodeStart(line)){
          inCode = true;
        }
      }
      else {
        if(lineIdentity.isCodeEnd(line)){
          inCode = false;
        }
        else{
          if((getLineNumber(line) >= srcPos) || lineIdentity.isFileStart(line)) {
            break;
          }
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

export function writeFile(path:string,content:string){
  try{
    logger.debug('write file: '+path);
    fs.writeFileSync(path,content);
  }catch(error){
    logger.error('write file error');
    vscode.window.showErrorMessage('write file error '+path);
  }
}

export function getMax(a:number,b:number):number{
  return a > b? a:b;
}
export function getMin(a:number,b:number):number{
  return a < b? a:b;
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