import { commands, ExtensionContext, workspace } from "vscode";
import { Commands } from "../constants/constants";
import { Level } from "../logging/logger";

const properties = require('../../package.json').contributes.configuration.properties;

export interface Configuration {
    logLevel: string;
    noteId: string;
    encoding: string;
    associations: { [extension: string]: string };
}

export function getConfiguration(extensionContext: ExtensionContext) {
    return {
        logLevel: _logLevel(),
        noteId: _noteId(),
        encoding: _encoding(),
        associations: _associations()
    } as Configuration;
}

function _logLevel(): string {
    let logLevelConf = workspace.getConfiguration().get<string>('separableNotes.logLevel');
    let logLevel: string = properties["separableNotes.logLevel"]["default"];

    if (logLevelConf && (<any>Level)[`${logLevelConf}`] != null) {
        logLevel = logLevelConf.toString();
    }
    return logLevel;
}

function _noteId(): string{
    let noteid = workspace.getConfiguration().get<string>('separableNotes.noteId');
    if(!noteid){
        noteid = 'sepNotes ';
    }
    return noteid;
}

function _encoding(): string{
    let encoding = workspace.getConfiguration().get<string>('files.encoding');
    if(!encoding){
        encoding = 'UTF-8';
    }
    return encoding;
}

function _associations():  {[extension: string]:string}{
    let associations = workspace.getConfiguration().get<{ [extension: string]: string }>('files.associations');
    return associations || {};
}
