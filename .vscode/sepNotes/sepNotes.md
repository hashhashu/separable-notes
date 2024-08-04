<!-- generated by vscode plugin [separable notes](https://github.com/hashhashu/separable-notes)  
attachedFileNum:6    detachedFileNum:7    refreshTime:2024/7/27  14:11:20  
-->  
  
# user
* you can write other notes here
* 

  
  
# [constants.ts](src\constants\constants.ts)  
= 1, sepNotesCat = 2 }
```ts
73  export enum OutLineItemType{Tag = 0, codeBlock = 1}
```
  
  
# [extension.ts](src\extension.ts)  
### sync markdown with source and vice versa #content_change
```ts
77      extensionContext.subscriptions.push(
78          workspace.onDidChangeTextDocument((event)=>{
79              if (window.activeTextEditor && event.document === window.activeTextEditor.document) {
```
### notemode switch  #command/statusbar/notemode
```ts
247  		commands.registerCommand(Commands.NoteModeSwitch, async () => {
248              activeEditor = vscode.window.activeTextEditor;
249              if (!activeEditor) {
```
### attach all #command/global/attachall
```ts
290  		commands.registerCommand(Commands.attachAll, async () => {
291              if(!inAll){
292                  logger.debug('attachAll-------------------------');
```
### detach all #command/global/detachall
```ts
348  		commands.registerCommand(Commands.detachAll, async () => {
349              detachAll();
350          }
```
### add comment and remove comment #command/menu/noteit
```ts
354  		commands.registerCommand(Commands.noteIt, async () => {
355              activeEditor = vscode.window.activeTextEditor;
356              let path = activeEditor.document.uri.fsPath;
```
### hover for inline code #hover
```ts
427      function provideHover(document:vscode.TextDocument, position:vscode.Position, token){
428          let path = document.uri.fsPath;
429          if(!Notes.has(path) || !Notes.get(path).isAttached()){
```
### sync markdown files  #command/global/syncmdwithall #command/menu/syncmdwithsrc
```ts
469  		commands.registerCommand(Commands.syncMdWithSrc, async () => {
470              logger.debug('syncMdWithSrc----------------------');
471              fs.copyFileSync(Constants.sepNotesFilePath,Constants.sepNotesBakFilePath);
```
### #definition
```ts
526      function provideDefinition(document:vscode.TextDocument, position:vscode.Position, token) {
527          const line		= document.lineAt(position);
528          let lineNumber = getLineNumber(line.text);
```
### #command/global/importnotes
```ts
616  		commands.registerCommand(Commands.importNotes, async () => {
617              if(!inAll){
618                  logger.debug('importNotes---------------');
```
### #command/menu/syncpos
```ts
695  		commands.registerCommand(Commands.syncPos, async () => {
696              logger.debug('syncPos start');
697              activeEditor = vscode.window.activeTextEditor;
```
### #command/view/jumptoline
```ts
783          commands.registerCommand(Commands.jumpToNoteLine, async (item: OutLineItem) => {
784              vscode.window.showTextDocument(vscode.Uri.file(item.path), { preview: true, preserveFocus: true }).then(
785                  textEditor => {
```
### #command/view/moveup
```ts
814          commands.registerCommand(Commands.MoveUp, async (item: OutLineItem) => {
815             NotesCat.moveUp(item.tag);
816             NotesCat.save(extensionContext); 
```
### #command/view/movedown
```ts
822          commands.registerCommand(Commands.MoveDown, async (item: OutLineItem) => {
823             NotesCat.moveDown(item.tag);
824             NotesCat.save(extensionContext);
```
### #command/view/filtertag
```ts
830          commands.registerCommand(Commands.filterTag, async () => {
831              const result = await window.showInputBox({
832                  value: NotesCat.searchTag,
```
  
  