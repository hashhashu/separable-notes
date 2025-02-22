import { Constants } from "../constants/constants";
import { logger } from "../logging/logger";

// noteid(for store extra info on line)
export enum TimeType{
    create = 0,
    modify = 1,
    access = 2
}
export class NoteId{
    static noteId:string;
    static lineInfo:Map<string,LineExtraInfo>;
    static extensionContext;

    static load(){
        logger.debug('NoteId load start');
        let entries =  this.extensionContext.workspaceState.get(Constants.LineInfo);
        if(entries){
            this.lineInfo = new Map(entries.map(entry => [entry.key, new LineExtraInfo(entry.value.createTime,entry.value.modifyTime,entry.value.accessTime)]));
        }
        else{
            this.lineInfo = new Map<string,LineExtraInfo>();
        }
        logger.debug('NoteId load end');
    }

    static save(){
        let entries = Array.from(this.lineInfo.entries()).map(([key,value])=>({ key, value }));
        this.extensionContext.workspaceState.update(Constants.LineInfo,entries);
    }

    static updateTime(path:string = '',id:string = '', timeType:TimeType = TimeType.access){
        if(path != '' && id != ''){
            let pathConId = path+':'+id.toString();
            if(this.lineInfo.has(pathConId)){
                this.lineInfo.get(pathConId).updateTime(timeType);
            }
            else{
                this.lineInfo.set(pathConId,new LineExtraInfo());
            }
            this.save();
        }
    }

    static includesNoteId(line:string):boolean{
        return this.getPrefix(line).length > 0;
    }
    static cutNoteId(line:string):string{
        let prefix = this.getPrefix(line);
        return line.substring(prefix.length).trimLeft();
    }
    static getPrefix(line:string):string{
        let pattern = new RegExp('\\b'+this.noteId+'(@id\\d+)? ');
        let match = pattern.exec(line);
        if(match){
            let index = match.index + match[0].length;
            return line.substring(0,index);
        }
        return '';
    }
    static getId(line:string):string{
        let prefix = this.getPrefix(line);
        if(prefix.length > 0){
            let pattern = new RegExp('@id(\\d+)');
            let match = prefix.match(pattern);
            if(match && match.length > 1){
                return match[1];
            }
        }
        return '';
    }
    static printId(path,id:string):string{
        if(path != '' && id != ''){
            let pathConId = path+':'+id.toString();
            if(this.lineInfo.has(pathConId)){
                return this.lineInfo.get(pathConId).printTime();
            }
        }
        return '';
    }
    static addNoteId(lineId:string, prefix:string = this.noteId):string{
        return prefix+'@id'+ lineId+' ';
    }
    static fillLostNoteId(lineId:string,line:string):string{
        let id = this.getId(line);
        if(id == ''){
            let prefix = this.getPrefix(line).trimRight();
            return this.addNoteId(lineId,prefix) + this.cutNoteId(line);
        }
        return line;
    }
}
// extra info for line(modify time)
class LineExtraInfo{
    createTime: number;
    modifyTime: number;
    accessTime: number;
    constructor(createTime:number = -1,modifyTime:number = -1, accessTime:number = -1){
        if(createTime != -1){
            this.createTime = createTime;
            this.modifyTime = modifyTime;
            this.accessTime = accessTime;
        }
        else{
            this.updateTime(TimeType.create);
        }
    }
    updateTime(timeType:TimeType = TimeType.access){
        let date = new Date();
        if(timeType == TimeType.create){
            this.createTime = date.getTime();
        }
        if(timeType == TimeType.create || timeType == TimeType.modify){
            this.modifyTime = date.getTime();
        }
        this.accessTime = date.getTime();
    }
    printTime():string{
        return 'modify time:'+(new Date(this.modifyTime)).toLocaleString()+'  access time:'+(new Date(this.accessTime)).toLocaleString();
    }
    toJSON(): any {  
        return {  
            createTime: this.createTime,
            modifyTime: this.modifyTime,
            accessTime: this.accessTime
        }; 
    }
}