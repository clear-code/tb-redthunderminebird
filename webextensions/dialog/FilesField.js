/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  log,
  appendContents,
  sanitizeForHTMLText
} from '/common/common.js';
import * as Dialog from '/extlib/dialog.js';
import EventListenerManager from '/extlib/EventListenerManager.js';

export class FilesField {
  constructor({ container } = {}) {
    this.onSizeChanged = new EventListenerManager();

    appendContents(container, `
      <div class="files" class="flex-box column"></div>
      <input class="file-field"
             type="file"
             multiple>
      <button class="add-file">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_files_add_label'))}</button>
    `);
    this.mContainer = container.querySelector('.files');

    this.mFileField = container.querySelector('.file-field');
    this.mFileField.addEventListener('change', _event => {
      this.addFiles(this.mFileField.files);
    });

    this.mAddButton = container.querySelector('.add-file');
    Dialog.initButton(this.mAddButton, _event => {
      this.mFileField.click();
    });
  }

  async addFiles(files) {
    const uploadableFiles = Array.from(files, file => ({
      name:        file.name,
      contentType: file.type,
      get promisedData() {
        if (this.data)
          return Promise.resolve(this.data);
        return file.arrayBuffer().then(buffer => {
          this.data = new Int8Array(buffer);
          return this.data;
        });
      }
    }));
    for (const file of uploadableFiles) {
      appendContents(this.mContainer, `
        <label><input type="checkbox" checked>
               ${sanitizeForHTMLText(file.name)}</label>
      `);
      this.mContainer.lastChild.querySelector('input[type="checkbox"]').$file = file;
      this.onSizeChanged.dispatch();
    }
  }

  clear() {
    const range = document.createRange();
    range.selectNodeContents(this.mContainer);
    range.deleteContents();
    range.detach();
    this.onSizeChanged.dispatch();
  }

  get filesToBeUpload() {
    return Array.from(
      this.mContainer.querySelectorAll('input[type="checkbox"]:checked'),
      checkbox => checkbox.$file
    );
  }
}
