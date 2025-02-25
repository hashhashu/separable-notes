import * as vscode from 'vscode';
import { Constants, OutLineItemType } from "../constants/constants";
import { NestedTag } from "./tag";
import { NotesCat } from './notesCat';
import { NoteFileTree } from './noteFileTree';
import { logger } from '../logging/logger';

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
			label = tagp.getLastTag().trim();
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
			this.tooltip = label + '  line:' + linep.toString();
        }
        else{
            this.tooltip = NotesCat.getTagDesc(tagp.getFullTag());
            this.description = this.tooltip;
        }
		this.parent = parent;
    }

	updateTagDesc(){
		if(this.itemType == OutLineItemType.Tag){
			this.tooltip = NotesCat.getTagDesc(this.tag.getFullTag());
			this.description = this.tooltip;
		}
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
			return Promise.resolve(NotesCat.getChildren(element));
		} else {
            return Promise.resolve(NotesCat.getTreeViewRoot());
		}
	}

	getParent(element: OutLineItem): vscode.ProviderResult<OutLineItem> {
		return element.parent;
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

export class FileOutLineDragAndDrop implements vscode.TreeDragAndDropController<OutLineItem>{
	dropMimeTypes = ['application/vnd.code.tree.fileOutLine'];
	dragMimeTypes = [];
	handleDrag?(source: readonly OutLineItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Thenable<void> | void {
		logger.debug('drag start');
		let noteLineNumbers = [];
		for(let item of source){
			noteLineNumbers.push(item.line);
		}
		dataTransfer.set('application/vnd.code.tree.fileOutLine', new vscode.DataTransferItem(noteLineNumbers));
	}
	handleDrop?(target: OutLineItem, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Thenable<void> | void {
		logger.debug('drop start:line'+target.line);
		const transferItem = dataTransfer.get('application/vnd.code.tree.fileOutLine');
		if (!transferItem) {
			return;
		}
		const noteLineNumbers: number[] = transferItem.value;
		let destOutline = '###';
		if(target.tag.getLastOutline() != Constants.normalTag){
			destOutline = target.tag.getLastOutline();
		}
		else if(target.parent){
			destOutline = target.parent.tag.getLastOutline()+'#';
		}
		NoteFileTree.DrapAndDrop(target.line,destOutline,noteLineNumbers);
		
	}

}

export class TagOutLineDragAndDrop implements vscode.TreeDragAndDropController<OutLineItem>{
	dropMimeTypes = ['application/vnd.code.tree.tagOutLine'];
	dragMimeTypes = [];
	handleDrag?(source: readonly OutLineItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Thenable<void> | void {
		logger.debug('drag start');
		dataTransfer.set('application/vnd.code.tree.tagOutLine', new vscode.DataTransferItem(source[0].tag));
	}
	handleDrop?(target: OutLineItem, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Thenable<void> | void {
		logger.debug('drop start:line'+target.line);
		const transferItem = dataTransfer.get('application/vnd.code.tree.tagOutLine');
		if (!transferItem) {
			return;
		}
		const srcTag = transferItem.value;
		NotesCat.DrapAndDrop(target.tag,srcTag);
		
	}

}