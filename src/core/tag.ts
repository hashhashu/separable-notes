import { getMin } from "../utils/utils";

export class NestedTag{
    tags:Array<string>;
    constructor(tag:string = ''){
        this.tags = tag.split('/');
    }

    compareTag(nestedTag2:NestedTag):number{
        let tags2 = nestedTag2.tags;
        let count = getMin(this.tags.length,tags2.length);
        let tag1;
        let tag2;
        let order1 = 0;
        let order2 = 0;
        for(let i=0;i<count;i++){
            order1 = Infinity;
            order2 = Infinity;
            tag1 = this.tags[i];
            tag2 = tags2[i];
            if(tag1.includes(':')){
                order1 = Number(tag1.split(':')[0]);
                tag1 = NestedTag.removeTagNumber(tag1);
            }
            if(tag2.includes(':')){
                order2 = Number(tag2.split(':')[0]);
                tag2 = NestedTag.removeTagNumber(tag2);
            }
            if(order1 < order2){
                return -1;
            }
            else if(order1 > order2){
                return 1;
            }
            if(tag1 < tag2){
                return -1;
            }
            else if(tag1 > tag2){
                return 1;
            }
        }
        return this.tags.length - tags2.length;
    }
    compareString(nestedTag2:string):number{
        let tags2 = new NestedTag(nestedTag2);
        return this.compareTag(tags2);
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
            if(NestedTag.removeTagNumber(tags2[i]) != NestedTag.removeTagNumber(this.tags[i])){
                break;
            }
            outline += '#';
        }
        
        while(i<tags2.length){
            add.push(outline + ' ' + NestedTag.removeTagNumber(tags2[i]));
            ++i;
            outline += '#';
        }
        return add;
    }
    
    leafNode(line:string):boolean{
        let outline = NestedTag.fetchOutLine(line);
        if(outline.length > 0){
            if(outline.length <= this.tags.length){
                return true;
            }
            else{
                return false;
            }
        }
        return false;
    }

    update(line:string){
        let outline = NestedTag.fetchOutLine(line);
        if(outline.length > 0){
            this.tags = this.tags.slice(0,outline.length - 1);
            this.tags.push(NestedTag.fetchOutLineTag(line));
        }
    }

    setTags(tags:string){
        this.tags = tags.split('/');
    }

    copyTag(tags:NestedTag){
        this.tags = tags.tags.slice();
    }

    getFullTag(){
        return this.tags.join('/');
    }

    static compareNestedTag(a:string, b:string):number{
        let c = new NestedTag(a);
        return c.compareString(b);
    }

    static fetchOutLine(line:string){
        const regex = /^(#+)\s+/;   
        const match = line.match(regex);  
        return (match && match.length > 1) ? match[1] : '';
    }

    static fetchOutLineTag(line:string){
        const regex = /^#+\s+([^\s]+)/;   
        const match = line.match(regex);  
        return (match && match.length > 1) ? match[1] : '';
    }

    static fetchTag(line:string):Array<string>{
        const regex = /(?:^|\s)#([^\s#]+)/g;   
        let match;
        let tags:Array<string> = new Array<string>();
        while((match = regex.exec(line))!=null){    
            tags.push(match[1]);
        }  
        return tags;
    }

    static removeTagNumber(tag:string):string{
        return tag.substring(tag.indexOf(':')+1);
    }

}

