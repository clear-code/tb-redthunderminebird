pref("extensions.redthunderminebird.redmine", "http://");
pref("extensions.redthunderminebird.logging", false);
pref("extensions.redthunderminebird.loglevel", 2); // [1,2,3,4] = [error,warn,info,debug]
pref("extensions.redthunderminebird.apikey", "");
pref("extensions.redthunderminebird.account", "");
pref("extensions.redthunderminebird.directories", "{}");
pref("extensions.redthunderminebird.default_tracker", "");
pref("extensions.redthunderminebird.default_due", 7);
pref("extensions.redthunderminebird.default_subject", "((fwd:)|(re:))\\s?");
// https://dxr.mozilla.org/comm-central/rev/ce8dba0d6a298a23d651a9622db5520b48ba90cf/mailnews/mime/src/mimedrft.cpp#957
pref("extensions.redthunderminebird.default_description_header.headers", "Subject,From,Resent-From,Date,To,Cc,Newsgroups");
pref("extensions.redthunderminebird.default_notes_header.headers", "Subject,From,Resent-From,Date,To,Cc,Newsgroups");
pref("extensions.redthunderminebird.default_upload_attachments", true);
pref("extensions.redthunderminebird.target_project", "");
pref("extensions.redthunderminebird.filter_project", "");
pref("extensions.redthunderminebird.target_status", "");
pref("extensions.redthunderminebird.filter_directory", "");
pref("extensions.redthunderminebird.template.description", "%3Cpre%3E%0A%25headers%25%0A%0A%25body%25%0A%3C/pre%3E" /* "<pre>\n%headers%\n\n%body%\n</pre>" */);
pref("extensions.redthunderminebird.template.notes", "%3Cpre%3E%0A%25headers%25%0A%0A%25body%25%0A%3C/pre%3E" /* "<pre>\n%headers%\n\n%body%\n</pre>" */);
pref("extensions.redthunderminebird.field_visibility.project", true);
pref("extensions.redthunderminebird.field_visibility.tracker", true);
pref("extensions.redthunderminebird.field_visibility.subject", true);
pref("extensions.redthunderminebird.field_visibility.description", true);
pref("extensions.redthunderminebird.field_visibility.parent_issue", true);
pref("extensions.redthunderminebird.field_visibility.status", true);
pref("extensions.redthunderminebird.field_visibility.assigned", true);
pref("extensions.redthunderminebird.field_visibility.watcher", true);
pref("extensions.redthunderminebird.field_visibility.version", true);
pref("extensions.redthunderminebird.field_visibility.period", true);
pref("extensions.redthunderminebird.field_visibility.file", true);
pref("extensions.redthunderminebird.field_visibility.relations", true);
pref("extensions.redthunderminebird.field_visibility.other", true);
pref("extensions.redthunderminebird.field_visibility.issue", true);
pref("extensions.redthunderminebird.field_visibility.notes", true);
pref("extensions.redthunderminebird.custom_fields", "[]");

