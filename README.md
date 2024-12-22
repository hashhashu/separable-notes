**Read this in other languages: [English](README.md), [中文](README_ZH.md).**

**:exclamation:Before using, please conduct some tests first, and make sure to backup your code and notes promptly.(timeline in vscode can also be used to recover content)**


see [medium](https://medium.com/@hurlyes/separable-notes-inline-code-note-vscode-plugin-4c78dbbd14ad) for more detailed instruction.
# separable-notes 
separable notes is a VSCode extension that can manage your inline code note, make your note separable.

It can be applied to scenarios such as:
* keep your note private and not committing to the repository that is maintained by many people.
* outline your code and organize you code note in standalone markdown file(`sepNotes.md`).
* Reorganize the content of the notes by category (by defining tag(#xxx/abc) shown in `sepNotes_category.md`)(The outline content can also be seen in the Explorer of the sidebar.)

![demo1](pic/demo1.PNG)

It is tested on windows 10.

### Usage
After installing separable notes, you will be able to manage your inline code note.

#### Quick Commands:
##### global commands
* separableNotes detachAll:
   * detach all notes in this workspace 
* separableNotes attachAll
  * attach all notes in this workspace
* separableNotes syncMdWithSrc
  * export notes in markdown file(in `.vscode/sepNotes.md`)
  * exort note by category (in `sepNotes_category.md`)
  * in generated markdown file, you can go to src file by click ctrl+(left button)
* separableNotes.importNotes
  * import note from `sepNotes.md` into code(original note will be replaced)

##### menu commands
* separableNotes NoteIt
  * Add Comment or Remove Comment
* separableNotes openSepNotes
  * for quick open sepNotes file
* separableNotes.syncPos
  * sync `sepNotes.md` pos with src file and vice versa(both file need to be visible)

##### about src file and sepNotes file sync
* when you edit src file, content can be synced with sepNotes file and vice versa.

#### Configuration
**noteId** can be configurated to identify the line which should be detached(default is SEPNOTES).
 \
if you change this, you should also change the configuration for todo-tree or other plugins.

### Installation
* From VS Code by searching separable notes
* From [marketplace](https://marketplace.visualstudio.com/items?itemName=hurly.separable-notes)

### Use together
[TODO Tree](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.todo-tree) or other tag Highlighting vscode plugin.
#### Recommended configuration for todo-tree:
* add tags and  customHighlight for new noteId
```json
    "todo-tree.general.tags": [
        "SEPNOTES"
    ],
    "todo-tree.highlights.customHighlight": {
        "SEPNOTES":{
            "icon": "note",
            "foreground": "#409EFF",
            "gutterIcon": true,
            "type": "tag"
        }
    },
    "todo-tree.tree.showCountsInTree": true,
    "todo-tree.regex.regexCaseSensitive": false,
    "todo-tree.general.statusBar": "current file",
```

### ChangeLog
#### 0.1.8
* tag can be renamed in sidebar of `sepNotes_category`
* button refresh will call `syncMdWithSrc` first and this command is removed from menu
* fix bug about `sepnotes` show duplicate content in the sidebar when click on the `sepNotes_category`
* improve user experience of tag search 


#### 0.1.7
* add outline view for `sepNotes.md` in sidebar explore view
* command `separableNotes.syncPos` is abandon and cursor response is added instead
* add follow pos for outline view of `sepNotes.md`
* add outline edit for view of `sepNotes.md`(move left/right)
* outline for `sepNotes.md` can be adjusted by drag and drop
* outline order for `sepNotes_category` can be adjusted by drag and drop
* optimize cursor response

#### 0.1.6
* relative path is used instead of original absolute path to make it more portable
* can add description about tag in `sepNotes_category.md` 
* fix bug about tag lost in `sepNotes_category.md`
* fix bug when new added node is not leaf node
* fix bug when syncMdWithSrc cause irregular changes in `sepNotes_category.md` 
* add outline view for `sepNotes_category.md` in explorer view
* order can be adjusted via tree view in the sidebar view and original order way is abandoned
#### 0.1.5
* attach action is not needed anymore when adding first note 
* handle situation when src file cannot write
* `sepNotes.md` can jump to src file in detach mode 
* `sepNotes_category.md` now support edit and changes will also sync with other files
* can use `@order` to sort note in `sepNotes_category.md` 
* `separableNotes.syncPos` now support `sepNotes_category.md`(from `sepNotes_category.md` to src file)
* optimize edit sync(while change line) in  `sepNotes_category.md` and `sepNotes.md`
* `@order`support decimal number(such as `@order(1.2)`)
* remove `**s**` to reorganizing note in category and add **netsted tags** as `#s/a` to categorize 
* add `$` for note outliner `###` in `sepNotes_category.md` to avoid conflict
* add warn when edit `sepNotes.md` or `sepNotes_category.md` and src file is not matched
* add `syncMdWithSrc` command into menu command and tag identify optimize

#### 0.1.4
* refresh `sepNotes.md` after attach if line number diffs(note refresh while not match)
* add quick open for other file(`sepNotes_diff.md` `sepNotes_category.md`)
* add support for reorganizing note in category(shown in `sepNotes_category.md`) 
* fix sync bug(sync src file with `sepNotes.md`)
* save needrefresh state
* `separableNotes syncMdWithSrc` Commands now can sync `sepNotes_category.md` with src file
* add `separableNotes.importNotes` to import notes from `sepNotes.md` into code
* backup `sepNotes.md` before refresh content(backup file is `sepNotes _bak.md`)
* change root path to `.vscode/sepNotes/`
* limit file sync speed to avoid typing delay
* add hint when note position is not appropriate(code below note is important when rematch is needed)
* add `separableNotes.syncPos` to sync `sepNotes.md` pos with src file and vice versa(tow file need to be visible)
* fix save state bug(`e.toJSON is not a function`)

#### 0.1.3
* can add user defined content in the begin of `in sepNotes.md`
* fix the bug that (cannot adjust note pos when attach)
* remove src and markdown file alignment

#### 0.1.2
* adjust note line when attach file(file may changed in detach status)

#### 0.1.1
* sync notes with standalone markdown file for summarize and easy to view  `in sepNotes.md`
  * this file also record information about file attach status and sync time
  * can easily open this file by clicking on the menu
  * 
* add @id and @refid to mbed code in arbitrary markdown file

#### 0.1.0
* First working version


### Feedback
* If you have any questions, feel free to ask and I'll get back to you at the weekend.


### TODO
* support block level note(such as /* */)


Please star :star: it if you like it, Thanks.

Thanks to [todo-tree](https://github.com/Gruntfuggly/todo-tree)