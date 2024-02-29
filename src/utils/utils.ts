import * as iconv from 'iconv-lite';
import * as os from 'os';
import { logger } from '../logging/logger';
import * as vscode from 'vscode';
import path from "path";

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

export function extractLinksFromMarkdown(markdown: string): string {  
    const linkRegex = /\[(.*?)\]\((.*?)\)|<(.*?)>/;  
    const links = markdown.match(linkRegex);  
    
    if(links){
      let link = links[0];
      if (link.startsWith('<') && link.endsWith('>')) {  
        return link.slice(1, -1);  
      } else {  
        return link.split('](')[1].split(')')[0];  
      } 
    }
    else{
      return '';
    }
}  

export function extractId(line:string,idOrRefer:boolean = true,identifier:string=''):string|null{
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