import { Constants } from "../constants/constants";
import { addEof, splitIntoLines } from "../utils/utils";
import { NestedTag } from "./tag";
import * as fs from 'fs';

export class NotesCat{
    static fetchDesc(){
        let descs:Map<string,string> = new Map<string,string>();
        let contentLines = splitIntoLines(fs.readFileSync(Constants.sepNotesCategoryFilePath).toString());
        let curNestedTag = new NestedTag();
        let desc = '';
        let tagStart = false;
        let crossDesc = false;
        for(let line of contentLines){
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
          else if(Constants.glineIdentity.isTagOutLine(line)){
            if(desc.trim().length > 0){
                descs.set(curNestedTag.getFullTag(),desc);
            }
            desc = '';
            crossDesc = false;
            curNestedTag.update(line);
          }
          else if(!crossDesc){
            if(Constants.glineIdentity.isFileStart(line)){
                crossDesc = true;
            }
            else{
               desc += addEof(line); 
            }
          }
        }
        if(desc.trim().length > 0){
            descs.set(curNestedTag.getFullTag(),desc);
        }
        return descs;
    }
}