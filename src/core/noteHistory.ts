import { Constants, OutLineItemType } from "../constants/constants";
import { logger } from "../logging/logger";
import { NoteId } from "./noteId";
import { NestedTag } from "./tag";
import { OutLineItem } from "./treeView";
import * as vscode from 'vscode'; 

export class NoteHistory{
    static childrens:Map<string,Array<OutLineItem>> = new Map<string,Array<OutLineItem>>();
    static noteHistoryProvider;
    static refresh(){
        logger.debug('NoteHistory refresh start');
        this.childrens.clear();
        let items = new Array<OutLineItem>();
        let lineAccessHistory = NoteId.lineAccessHistory.slice();
        let length = lineAccessHistory.length;
        for(let i = length - 1;i >= Math.max(0,length - Constants.lineHistoryMaxNum); i--){
            let block = lineAccessHistory[i];
            items.push(new OutLineItem(vscode.TreeItemCollapsibleState.None,new NestedTag(),OutLineItemType.NoteHistory,block.path,block.note,Number(block.id)));
        }
        this.childrens.set('',items);
        this.noteHistoryProvider.refresh();
        logger.debug('NoteHistory refresh end');
    }
    static getTreeViewRoot():Array<OutLineItem>{
        return this.childrens.get('');
    }
    static getChildren(parentTag:NestedTag):Array<OutLineItem>{
        logger.debug('parent:'+parentTag.getFullTag()+' length:'+this.childrens.get(parentTag.getFullTag()).length.toString());
        return this.childrens.get(parentTag.getFullTag());
    }    
}

export class NoteHistoryBlock{
    path: string;
    id: string;
    note: string;
    constructor(pathp:string, idp:string, notep:string){
        this.path = pathp;
        this.id = idp;
        this.note = NoteId.cutOutLineMarker(NoteId.cutNoteId(notep));
    }
    toJSON(): any {  
      return {
        path: this.path,
        id: this.id,
        note: this.note
      };  
    } 
}
