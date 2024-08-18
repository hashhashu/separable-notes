import * as vscode from 'vscode';
import { OutLineItemType } from "../constants/constants";
import { NestedTag } from "./tag";
import { NotesCat } from './notesCat';
import { NoteFileTree } from './noteFileTree';

export  class OutLineItem extends vscode.TreeItem{  
    tag: NestedTag = new NestedTag();
    itemType: OutLineItemType;
    path: string;
    code: string;
    line: number;
	parent: OutLineItem;
    constructor(collapsibleState: vscode.TreeItemCollapsibleState,tagp:NestedTag = new NestedTag(),itemTypep:OutLineItemType = OutLineItemType.codeBlock,pathp:string = '',codep:string = '',linep:number = -1,parent = null){
		let label;
		if(itemTypep == OutLineItemType.TagAndCode){
			label = codep;
		}
		else{
			label = tagp.getLastTag();
		}
        super(label, collapsibleState);
		this.tag.copyTag(tagp);
        this.itemType = itemTypep;
        this.path = pathp;
        this.code = codep;
        this.line = linep;

        if(this.itemType == OutLineItemType.codeBlock || this.itemType == OutLineItemType.TagAndCode){
            this.command = {
                "title": "jump to noteLine",
                "command": "separableNotes.jumpToNoteLine",
                "arguments": [this]
            }
        }
        else{
            this.tooltip = NotesCat.getTagDesc(tagp);
            this.description = NotesCat.getTagDesc(tagp);
        }
		this.parent = parent;
    }
}


export class TagOutLineProvider implements vscode.TreeDataProvider<OutLineItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<OutLineItem | undefined | void> = new vscode.EventEmitter<OutLineItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<OutLineItem | undefined | void> = this._onDidChangeTreeData.event;

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
			return Promise.resolve(NotesCat.getChildren(element.tag));
		} else {
            return Promise.resolve(NotesCat.getTreeViewRoot());
		}
	}
}

export class FileOutLineProvider implements vscode.TreeDataProvider<OutLineItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<OutLineItem | undefined | void> = new vscode.EventEmitter<OutLineItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<OutLineItem | undefined | void> = this._onDidChangeTreeData.event;

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
			return Promise.resolve(NoteFileTree.getChildren(element.tag));
		} else {
            return Promise.resolve(NoteFileTree.getTreeViewRoot());
		}
	}

	getItemByPos(pos:number):OutLineItem{
		return NoteFileTree.getItemByPos(pos);
	}

	getParent(element: OutLineItem): vscode.ProviderResult<OutLineItem> {
		return element.parent;
	}
}