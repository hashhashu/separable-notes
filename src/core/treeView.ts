import * as vscode from 'vscode';
import { OutLineItemType } from "../constants/constants";
import { NestedTag } from "./tag";
import { NotesCat } from './notesCat';

export  class OutLineItem extends vscode.TreeItem{  
    tag: NestedTag;
    itemType: OutLineItemType;
    path: string;
    code: string;
    line: number;
    constructor(readonly collapsibleState: vscode.TreeItemCollapsibleState,label:string = '',tagp:NestedTag = new NestedTag(),itemTypep:OutLineItemType = OutLineItemType.codeBlock,pathp:string = '',codep:string = '',linep:number = -1){
        super(label, collapsibleState);
        this.tag = new NestedTag(tagp.getFullTag());
        this.itemType = itemTypep;
        this.path = pathp;
        this.code = codep;
        this.line = linep;
        this.tooltip = label;
        this.description = label;
        if(this.itemType == OutLineItemType.codeBlock){
            this.command = {
                "title": "jump to noteLine",
                "command": "separableNotes.jumpToNoteLine",
                "arguments": [this]
            }
        }
    }
    getLabel():string{
        if(this.itemType == OutLineItemType.Tag){
            return this.tag.getLastTag();
        }
        else{
            return this.code;
        }
    }
}


export class TagOutLineProvider implements vscode.TreeDataProvider<OutLineItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<OutLineItem | undefined | void> = new vscode.EventEmitter<OutLineItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<OutLineItem | undefined | void> = this._onDidChangeTreeData.event;
    tagPos: Map<string,number>;
    contentLines: string[];

	constructor() {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: OutLineItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: OutLineItem): Thenable<OutLineItem[]> {
		if (element) {
			return Promise.resolve(NotesCat.getChildren(element.tag,this.tagPos.get(element.tag.getFullTag()),this.contentLines));
		} else {
            this.contentLines = NotesCat.getContentLines();
            let ret = NotesCat.getTreeViewRoot(this.contentLines);
            this.tagPos = ret.tagPos;
            return Promise.resolve(ret.item);
		}
	}
}