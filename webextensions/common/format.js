/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

export function htmlToPlaintext(source) {
  return source
    .replace(/<br(\s[^>]*)?>|<\/(h[0-5]|p|div|pre|li|ul|ol)(\s[^>]*)?>/g, '\n')
    .replace(/<[^>]+>/g, '');
}

export function formatDate(base, deltaDays) {
  if (deltaDays !== undefined)
    base = new Date(base.getTime() + (deltaDays * 3600 * 24 * 1000));
  const year  = base.getFullYear();
  const month = (base.getMonth() + 1).toString().padStart(2, '0');
  const date  = base.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${date}`;
}
