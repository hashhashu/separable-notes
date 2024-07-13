import { getFileName, getRelativePath } from "../utils/utils";
import { NestedTag } from "./tag"
export class LineIdentity{
    path:string;
    curFileStart:string;
    fileStart:string;
    curFileStartAnno:string;
    fileStartAnno:string;
    constructor(patha:string = ''){
        this.path = patha;
        this.fileStart = this.matchFilePathEnd();
        this.curFileStart = this.matchFilePathStart(this.path);
        this.fileStartAnno = this.matchFilePathEnd(true);
        this.curFileStartAnno = this.matchFilePathStart(this.path,true);
    }
    // (# abc)  
    isTagOutLine(line:string):boolean{
        return NestedTag.fetchOutLine(line).length > 0
    }
    isFileStart(line:string):boolean{
        if(line.startsWith(this.fileStart) || line.startsWith(this.fileStartAnno)){
            return true;
        }
        else{
            return false;
        }
    }
    isCurFileStart(line:string):boolean{
        if(line.startsWith(this.curFileStart) || line.startsWith(this.curFileStartAnno)){
            return true;
        }
        else{
            return false;
        }
    }
    isOtherFileStart(line:string):boolean{
        if(this.isFileStart(line) && !this.isCurFileStart(line)){
            return true;
        }
        else{
            return false;
        }
    }
    isCodeStart(line:string):boolean{
        if(line.startsWith('```')){
            return true;
        }
        else{
            return false;
        }
    }
    isCodeEnd(line:string):boolean{
        return this.isCodeStart(line);
    } 
    private matchFilePathStart(patha:string,isAnno = false){
        let fileName = getFileName(patha);
        patha = getRelativePath(patha);
        let fileIden = '# ['+ fileName +']'+'(' + patha +')' ;
        if(isAnno){
            return '<!-- ' + fileIden +' -->';
        }
        else{
            return fileIden;
        }
    }
    private matchFilePathEnd(isAnno = false){
        let iden = '# [';
        if(isAnno){
            return '<!-- ' + iden;
        }
        else{
            return iden;
        }
    }
}