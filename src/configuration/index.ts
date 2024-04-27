import { ExtensionContext, workspace } from "vscode";
import { Level } from "../logging/logger";

const properties = require('../../package.json').contributes.configuration.properties;

export interface Configuration {
    logLevel: string;
    noteId: string;
    encoding: string;
    associations: { [extension: string]: string };
    reMatch: boolean;
}

export function getConfiguration(extensionContext: ExtensionContext) {
    return {
        logLevel: _logLevel(),
        noteId: _noteId(),
        encoding: _encoding(),
        associations: _associations(),
        reMatch: _reMatch()
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
    let noteid = workspace.getConfiguration().get<string>('separableNotes.noteId','sepNotes ');
    return noteid;
}

function _encoding(): string{
    let encoding = workspace.getConfiguration().get<string>('files.encoding','UTF-8');
    return encoding;
}

function _associations():  {[extension: string]:string}{
    let associations = workspace.getConfiguration().get<{ [extension: string]: string }>('files.associations');
    return associations || {};
}

function _reMatch(): boolean{
    let reMatch = workspace.getConfiguration().get<boolean>('separableNotes.reMatch',false);
    return reMatch;
}
