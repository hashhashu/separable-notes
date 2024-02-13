# separable-notes 
separable notes is a VSCode extension that can make your note separable, which means that you can attach and detach your note easily.

It can be applied to scenarios such as:
* you want to keep your note private and don't want to commit to the repository that is maintained by many people.
* just to quickly label a line

![demo](pic/demo.gif)

It is tested on windowns 10.

### Usage
After installing separable notes, you will be able to attach and detach your note.

#### Quick Commands:
* separableNotes detachAll:
   * detach all notes in this workspace 
* separableNotes attachAll
  * attach all notes in this workspace

#### Configuration
**noteId** can be configurated to identify the line which should be detached(default is SEPNOTES).
 \
if you change this, you should also change the configuration for todo-tree or other plugins.

#### Recommended configuration for todo-tree:
* add tags and  customHighlight for new noteId
```json
    "todo-tree.general.tags": [
        "BUG",
        "HACK",
        "FIXME",
        "TODO",
        "XXX",
        "[ ]",
        "[x]",
        "TEST",
        "SEPNOTES"
    ],
    "todo-tree.highlights.customHighlight": {
        "BUG": {
            "icon": "bug"
        },
        "HACK": {
            "icon": "tools"
        },
        "FIXME": {
            "icon": "flame"
        },
        "XXX": {
            "icon": "x"
        },
        "[ ]": {
            "icon": "issue-draft"
        },
        "[x]": {
            "icon": "issue-closed"
        },
        "SEPNOTES":{
            "icon": "tag",
            "foreground": "#409EFF",
            "gutterIcon": true,
            "type": "tag"
        }
    },
    "todo-tree.regex.regex": "(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)",
    "todo-tree.filtering.ignoreGitSubmodules": true,
    "todo-tree.tree.showCountsInTree": true,
    "todo-tree.regex.regexCaseSensitive": false,
    "todo-tree.general.statusBar": "current file",
```

### Prerequisites
[TODO Tree](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.todo-tree) or other tag Highlighting vscode plugin.


### Installation
* From VS Code by searching separable notes
* From [marketplace]()
### ChageLog
#### 0.1.0
* First working version


### Feedback
* If you have any questions, feel free to ask and I'll get back to you at the weekend.


Thanks to [todo-tree](https://github.com/Gruntfuggly/todo-tree)