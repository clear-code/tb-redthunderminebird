/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

export function htmlToPlaintext(source) {
  const doc = (new DOMParser()).parseFromString(source, 'text/html');
  return nodeToText(doc.body || doc);
}

function nodeToText(node) {
  let prefix = '';
  let suffix = '';
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      switch (node.localName.toLowerCase()) {
        case 'br':
          return '\n';

        case 'pre':
        case 'h0':
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'p':
        case 'div':
        case 'li':
          suffix = '\n';
          break;

        case 'blockquote':
          prefix = '> ';
          break;
      }
    case Node.DOCUMENT_NODE: {
      let contents = Array.from(node.childNodes, node => nodeToText(node)).join('');
      if (prefix)
        contents = contents.replace(/^( )?/gm, `${prefix}$1`);
      return `${contents}${suffix}`;
    };

    case Node.TEXT_NODE:
      return node.parentNode.closest('pre') ? node.nodeValue : node.nodeValue.replace(/\s\s+/g, ' ').replace(/^\s+$/, '');

    default:
      return '';
  }
}

export function formatDate(base, deltaDays) {
  if (deltaDays !== undefined)
    base = new Date(base.getTime() + (deltaDays * 3600 * 24 * 1000));
  const year  = base.getFullYear();
  const month = (base.getMonth() + 1).toString().padStart(2, '0');
  const date  = base.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${date}`;
}
