<!-- generated by vscode plugin [separable notes](https://github.com/hashhashu/separable-notes)  
attachedFileNum:2    detachedFileNum:8    refreshTime:2024/5/3  15:24:57  
-->  
  
# user
* you can write other notes here
* 

# [constants.ts](d:\extra\github\separable-notes\src\constants\constants.ts)  
**hello**
```ts
54  export enum NoteMode{  Detached = 0,     Attached = 1}
55  
```
  
  
# [extension.ts](d:\extra\github\separable-notes\src\extension.ts)  
## sync markdown with source and vice versa(**test123**)123
```ts
64      extensionContext.subscriptions.push(
65          workspace.onDidChangeTextDocument((event)=>{
66              if (window.activeTextEditor && event.document === window.activeTextEditor.document) {
```
### mode switch(**test12**)
test  for it
```ts
194  	extensionContext.subscriptions.push(
195  		commands.registerCommand(Commands.NoteModeSwitch, async () => {
196              activeEditor = vscode.window.activeTextEditor;
```
### add comment and remove comment
```ts
293  	extensionContext.subscriptions.push(
294  		commands.registerCommand(Commands.noteIt, async () => {
295              activeEditor = vscode.window.activeTextEditor;
```
### hover for inline code
```ts
353      function provideHover(document:vscode.TextDocument, position:vscode.Position, token){
354          let path = document.uri.fsPath;
355          if(!Notes.has(path) || !Notes.get(path).isAttached()){
```
12345678
```ts
529  function fetchMdStatus():string{
530      let status = Constants.sepNotesFileHeadStatus;
531      status = status.replace('#attachedFileNum',attachedFileNum.toString());
```
  
  
