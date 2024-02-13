import * as iconv from 'iconv-lite';
import * as os from 'os';
import { logger } from '../logging/logger';

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

