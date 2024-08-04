import { getMin } from "../utils/utils";
import { NotesCat } from "./notesCat";

export class NestedTag{
    tags:Array<string>;
    outlines:Array<number>;
    recordOutLine:boolean;
    constructor(tag:string = '',recordOutLine:boolean = false){
        this.tags = NestedTag.convertToTags(tag);
        this.recordOutLine = recordOutLine;
        if(this.recordOutLine){
            this.outlines = [0];
        }
    }

    compareTag(nestedTag2:NestedTag, adjusted:boolean = true):number{
        let tagOrder1:Array<string>;
        let tagOrder2:Array<string>;
        if(adjusted){
            tagOrder1 = NotesCat.getOrder(this);
            tagOrder2 = NotesCat.getOrder(nestedTag2);
        }
        else{
            tagOrder1 = this.tags;
            tagOrder2 = nestedTag2.tags;
        }
        let count = getMin(tagOrder1.length,tagOrder2.length);
        let tag1;
        let tag2;
        for(let i=0;i<count;i++){
            tag1 = tagOrder1[i];
            tag2 = tagOrder2[i];
            if(tag1 < tag2){
                return -1;
            }
            else if(tag1 > tag2){
                return 1;
            }
        }
        return tagOrder1.length - tagOrder2.length;
    }
    compareString(nestedTag2:string, adjusted:boolean = true):number{
        let tags2 = new NestedTag(nestedTag2);
        return this.compareTag(tags2,adjusted);
    }

    needAddOutLine(nestedTag2:string):Array<string>{
        return this.needAddOutLineTag(new NestedTag(nestedTag2));
    }

    needAddOutLineTag(nestedTag2:NestedTag):Array<string>{
        let add = new Array<string>();
        let tags2 = nestedTag2.tags;
        let count = getMin(this.tags.length,tags2.length);
        let i = 0;
        let outline = '#';
        for(i=0;i<count;i++){
            if(tags2[i] != this.tags[i]){
                break;
            }
            outline += '#';
        }
        
        while(i<tags2.length){
            add.push(outline + ' ' + tags2[i]);
            ++i;
            outline += '#';
        }
        return add;
    }
 
    equal(tag:NestedTag):boolean{
        return this.getFullTag() == tag.getFullTag();
    }

    contain(tag:NestedTag):boolean{
        return this.getFullTag().includes(tag.getFullTag());
    }

    update(line:string){
        let outline = NestedTag.getOutLine(line);
        if(outline.length > 0){
            if(!this.recordOutLine){
                this.tags = this.tags.slice(0,outline.length - 1);
            }
            else{
                let i = this.outlines.length - 1;
                while(i >=0 && this.outlines[i] >= outline.length){
                    this.outlines.pop();
                    this.tags.pop();
                    i-=1;
                }
                this.outlines.push(outline.length);
            }
            this.tags.push(NestedTag.getOutLineTag(line));
        }
    }

    setTags(tags:string){
        this.tags = tags.split('/');
    }

    copyTag(tags:NestedTag){
        this.tags = tags.tags.slice();
        this.recordOutLine = tags.recordOutLine;
        if(this.recordOutLine){
            this.outlines = tags.outlines.slice();
        }
    }

    getFullTag(){
        return this.tags.join('/');
    }

    getLevel():number{
        if(!this.recordOutLine){
            return this.tags.length;
        }
        else{
            return this.outlines[this.outlines.length - 1];
        }
    }

    getLastTag(level:number = 1){
        return this.tags[this.tags.length - level];
    }

    getParentTag(level:number = 1):string{
        if(this.tags.length <= level){
            return '';
        }
        else{
            return this.tags.slice(0,this.tags.length - level).join('/');
        }
    }

    includes(keyword:string):boolean{
        return this.getFullTag().includes(keyword);
    }

    static compareNestedTag(a:string, b:string, adjusted:boolean = true):number{
        let c = new NestedTag(a);
        return c.compareString(b,adjusted);
    }

    static getOutLine(line:string){
        const regex = /^(#+)\s+/;   
        const match = line.match(regex);  
        return (match && match.length > 1) ? match[1] : '';
    }

    static getOutLineTag(line:string){
        const regex = /^#+\s+([^\s]+)/;   
        const match = line.match(regex);  
        return (match && match.length > 1) ? match[1] : '';
    }

    static getTag(line:string):Array<string>{
        const regex = /(?:^|\s)#([^\s#]+)/g;   
        let match;
        let tags:Array<string> = new Array<string>();
        while((match = regex.exec(line))!=null){    
            tags.push(match[1]);
        }  
        return tags;
    }

    static convertToTags(tag:string):Array<string>{
        return tag.split('/');
    }

}

