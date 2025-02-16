
// noteid
export class NoteId{
    static noteId:string;

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
    static addNoteId(lineId:number):string{
        return this.noteId+'@id'+ lineId.toString()+' ';
    }
}