# The header and footer of the installation, for administrators

The header and footer (spec 089) are a few lines that an administrator writes once and that every reader sees above and below the text of every page and blog post, such as a classification line ("Internal") or whom to ask about the wiki. They are an experimental part: off on a new installation and after an upgrade.

## Turning it on and off

- **Administration, Organising, Experimental parts**, then turn on **Header and footer** (`header_footer`, through `PUT /api/v1/admin/experimental`).
- Its section then appears under **Look** in the administration, marked Experimental.
- Turning it **off** hides the section and both bands at once on the node that changed it, and within 30 seconds on the others. What was written is kept: turning it on again shows it as it was.

## What the header and footer may hold

Each field is a short document, written in a small editor that offers exactly what the server stores:

- paragraphs of text, with line breaks, alignment (start, centre, end) and direction;
- bold, italic, underline and a text colour from the named list;
- status marks, such as "Internal" in blue;
- links: `https://` to a plain host name (an international name in its `xn--` form), one mail address as `mailto:`, or a path inside this installation that starts with `/`.

Everything else is refused, not dropped: headings, lists, tables, images, files, mentions, page links, dates, dynamic blocks and every other block, the marks strike, code, subscript, superscript and highlight, plain `http://` links, addresses with a user name (`https://intranet.example@other.example/`), `#` anchors, every other kind of address, and characters that turn text around. Images and dynamic blocks wait for a study of their own.

Limits per field: 600 characters of visible text (status words count), 5 paragraphs, 5 links, 3 status marks and 8 KiB stored.

## Where it shows, and where not

- Above the text and below it, on the reading view of pages and blog posts, the home page of a space included, for everyone who may use the product, guests included. Printing a page prints both.
- Not in the editor, a comparison of versions, an older version, a template, a folder, a link or a database; not on the start screen, in search, in the administration or in the settings of a space.
- Never on the login page or any screen before login, on public sites and shared pages, in exports of any format (a PDF has the header and footer of its own design), or in mail.

Every link that leaves the installation shows its host after its words, such as "Contact (help.example.org)", opens in a new tab, and tells a screen reader so. The words of a link can therefore never hide where it goes.

## Who may change it

An administrator, with a login at most 10 minutes old: Save asks for the password or a passkey again when it is older. No token can change it, also not an administrator's. An administrator's token with `admin:read` may read it through `GET /api/v1/admin/header-footer`; any token with `content:read` reads what readers see through `GET /api/v1/header-footer`.

Every change is in the audit log as `settings.updated` on `settings` / `header_footer`, with each changed field before and after, whole. A contact named in the footer is shown to every reader anyway; the hint under the fields says that the audit keeps it.

## Load

The answer every reader needs is kept on each node for 30 seconds and read in one statement when it runs out; a browser asks at most once a minute per tab, whatever pages it opens. While the part is off, the browser asks nothing.
