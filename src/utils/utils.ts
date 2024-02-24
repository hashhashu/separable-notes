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
  return getFileExt(filePath);
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