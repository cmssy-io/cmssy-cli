---
name: cmssy-mcp-content
description: "Rules for managing CMS content via cmssy MCP tools. Use when creating/editing pages, blocks, translations, forms, or layout blocks through MCP. Trigger on words: cmssy MCP, page, block content, translation, form, header, footer, layout, publish page, add_block_to_page, update_block_content, create_page, list_pages, i18n."
---

# Cmssy MCP Content Rules

Rules and patterns for working with site content through cmssy MCP tools.

## Prerequisites

This skill assumes the `@cmssy/mcp-server` is configured as an MCP server in your Claude Code settings. If the tools below are unavailable, install and configure it:

```bash
npm install -g @cmssy/mcp-server
```

Then register it in `~/.claude.json` (or your project `.mcp.json`) with your workspace token and workspace ID. See https://www.npmjs.com/package/@cmssy/mcp-server for the exact config snippet.

If the MCP tools (`list_pages`, `update_block_content`, etc.) aren't available in your session, this skill won't work — fall back to the Cmssy editor UI.

## When to use this skill

- Creating or editing pages via MCP
- Adding/updating block content or translations
- Working with layout blocks (header, footer)
- Managing page settings, SEO, or publishing
- Creating or managing forms and form submissions

---

## Rule 1: Always use language-keyed content

All block content MUST use language keys (`en`, `pl`, etc.) when the site has multiple languages enabled. Check `get_site_config` for `enabledLanguages` first.

```json
// CORRECT - language-keyed
{
  "en": { "heading": "Welcome", "subheading": "Hello world" },
  "pl": { "heading": "Witaj", "subheading": "Witaj swiecie" }
}

// WRONG - flat content without language key
{
  "heading": "Welcome",
  "subheading": "Hello world"
}

// WRONG - only adding new language without existing ones
{
  "pl": { "heading": "Witaj" }
}
// This leaves `en` missing if content was previously flat!
```

**Critical**: If existing content is flat (no language keys), you MUST restructure it by providing BOTH `en` (with existing content) AND the new language in one update.

---

## Rule 2: Layout blocks (header/footer) follow the same i18n rules

Layout blocks (header, footer) live in `layoutBlocks` on a page, not in `blocks`. They use the same `update_block_content` tool and the same language-keyed content structure.

### Header translatable fields

- `navigation[].label` - top-level nav labels
- `navigation[].children[].label` - submenu item labels
- `navigation[].children[].description` - submenu item descriptions
- `ctaLabel`, `secondaryCtaLabel` - button labels
- `announcementText` - announcement bar text
- `logoutButtonText` - logout button

### Footer translatable fields

- `tagline` - site tagline
- `linkColumns[].title` - column headings
- `linkColumns[].links[].name` - link labels
- `copyrightText` - copyright notice

### Non-translatable fields (keep same across languages)

- URLs (`url`, `href`, `ctaUrl`, `announcementLink`)
- Icons (`icon`)
- Booleans (`showCta`, `sticky`, `transparent`, `showSocial`)
- Style values (`announcementBg`, `announcementTextColor`, `logoSize`)
- `logo` (image URL)

---

## Rule 3: Workflow for content updates

1. **Read first**: Always `get_page` or `get_site_config` before editing
2. **Check languages**: Look at `enabledLanguages` in site config
3. **Check existing content structure**: Is it flat or language-keyed?
4. **Update all languages**: When adding translations, include ALL enabled languages
5. **Verify**: After update, confirm response has correct structure

---

## Rule 4: Page blocks vs Layout blocks

|                | Page blocks                    | Layout blocks              |
| -------------- | ------------------------------ | -------------------------- |
| Location       | `blocks[]`                     | `layoutBlocks[]`           |
| Scope          | Single page                    | Inherited across pages     |
| Content        | `content.en`, `content.pl`     | `content.en`, `content.pl` |
| Types          | hero, features, faq, cta, etc. | header, footer             |
| Position field | No                             | Yes (`header`, `footer`)   |

---

## Rule 5: Publishing workflow

- `update_block_content` creates unpublished changes (draft)
- Use `publish_page` to make changes live
- Use `revert_to_published` to discard draft changes
- Always inform user about unpublished state after edits

---

## Rule 6: Available MCP tools quick reference

| Tool                                    | Use for                                         |
| --------------------------------------- | ----------------------------------------------- |
| `get_site_config`                       | Languages, site name, features                  |
| `get_workspace_info`                    | Plan, limits, usage                             |
| `list_pages`                            | Browse/search pages                             |
| `get_page`                              | Full page with blocks and content               |
| `create_page`                           | New page                                        |
| `update_page_settings`                  | SEO, displayName, description                   |
| `update_block_content`                  | Edit block content (page or layout)             |
| `add_block_to_page`                     | Add new block                                   |
| `remove_block_from_page`                | Remove block                                    |
| `update_page_blocks`                    | Reorder blocks                                  |
| `update_page_layout`                    | Change layout blocks                            |
| `publish_page` / `unpublish_page`       | Publishing                                      |
| `list_block_types` / `get_block_schema` | Discover available blocks                       |
| `list_media`                            | Browse uploaded media                           |
| `list_forms`                            | Browse forms (filter by status)                 |
| `get_form`                              | Full form with fields, settings, i18n           |
| `create_form`                           | New form with fields and settings               |
| `update_form`                           | Edit form name, fields, settings, status        |
| `delete_form`                           | Delete form and all submissions                 |
| `list_form_submissions`                 | Browse submissions (filter by form/status)      |
| `get_form_submission`                   | Full submission details                         |
| `update_form_submission_status`         | Change status (pending/processed/spam/archived) |
| `delete_form_submission`                | Delete a submission                             |

---

## Rule 7: Forms - field types and settings

### Available field types (15)

`text`, `email`, `password`, `textarea`, `number`, `phone`, `url`, `date`, `datetime`, `select`, `multiselect`, `checkbox`, `radio`, `file`, `hidden`

### Action types

- `contact` (default) - standard contact form
- `login` - authentication form
- `register` - user registration
- `newsletter` - email subscription
- `custom` - custom webhook/processing

### Form i18n fields (language-keyed like blocks)

- `fields[].label`, `fields[].placeholder`, `fields[].helpText`
- `fields[].options[].label`
- `settings.submitButtonLabel`, `settings.successMessage`, `settings.errorMessage`

### Form statuses

- `draft` - not publicly accessible
- `published` - live and accepting submissions
- `archived` - disabled

### Creating a form example

```json
{
  "name": "Contact Form",
  "slug": "contact",
  "fields": [
    {
      "id": "name-field",
      "name": "name",
      "fieldType": "text",
      "label": { "en": "Name", "pl": "Imię" },
      "validation": { "required": true }
    },
    {
      "id": "email-field",
      "name": "email",
      "fieldType": "email",
      "label": { "en": "Email", "pl": "Email" },
      "validation": { "required": true }
    },
    {
      "id": "message-field",
      "name": "message",
      "fieldType": "textarea",
      "label": { "en": "Message", "pl": "Wiadomość" },
      "validation": { "required": true, "minLength": 10 }
    }
  ],
  "settings": {
    "actionType": "contact",
    "submitButtonLabel": { "en": "Send", "pl": "Wyślij" },
    "successMessage": { "en": "Thank you!", "pl": "Dziękujemy!" }
  }
}
```
