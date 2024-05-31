**Read this in other languages: [English](README.md), [中文](README_ZH.md).**

**:exclamation:Before using, please conduct some tests first, and make sure to backup your code and notes promptly.(timeline in vscode can also be used to recover content)**
 
see [medium](https://medium.com/@hurlyes/separable-notes-inline-code-note-vscode-plugin-4c78dbbd14ad) for more detailed instruction.
# separable-notes 
separable notes is a VSCode extension that can manage your inline code note, make your note separable.

It can be applied to scenarios sucmh as:
* keep your note private and not committing to the repository that is maintained by many people.
* outline your code and organize you code note in standalone markdown file(`sepNotes.md`).
* Reorganize the content of the notes by category (by defining keyword(**\s**) shown in `sepNotes_category.md`)(or by define @id and @refid, can easily imbed code in arbitrary markdown file)

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
* [x] adjust note pos
* [x] reorganize note in category
* [x] import notes into workspace
* record note history
* detach的时候访问能正常
* 考虑文件被占用更新失败的情况
* 未attach自动改变
Please star :star: it if you like it, Thanks.

Thanks to [todo-tree](https://github.com/Gruntfuggly/todo-tree)