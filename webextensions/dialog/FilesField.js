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

export class FilesField {
  constructor({ container } = {}) {
    appendContents(container, `
      <div class="files" class="flex-box column"></div>
      <button class="add-file">${sanitizeForHTMLText(browser.i18n.getMessage('dialog_files_add_label'))}</button>
    `);
    this.mContainer = container.querySelector('.files');
    this.mAddButton = container.querySelector('.add-file');

    Dialog.initButton(this.mAddButton, _event => {
      this.add();
    });
  }

  add() {
    appendContents(this.mContainer, `
      <label><input type="checkbox" checked>
             ${sanitizeForHTMLText('')}</label>
    `);
  }

  clear() {
    const range = document.createRange();
    range.selectNodeContents(this.mContainer);
    range.deleteContents();
    range.detach();
  }

  async upload() {
  }
}
