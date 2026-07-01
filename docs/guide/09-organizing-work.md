# 9. Organizing work: categories, tags, and tickets

Keep your feature list readable and filterable by assigning each feature a category, any number of free-form tags, and an optional link to an external ticket.

---

## Categories

A category is a single, color-coded label chosen from a managed set. Each feature carries at most one category. Categories are vault-wide: every reviewer sees the same list.

### Managing the category list

Open the SignOff desktop app, select a vault, and click the gear icon (⚙) next to the "Arrange by" controls in the sidebar. The **Manage categories** modal lists existing categories with their usage count, lets you delete unused ones, and lets you add new ones.

To add a category: pick a color swatch, type a name, then press Enter or click **Add**. The category id is derived automatically from the name. To remove one, click **Delete** next to it. Removing a category does not delete the features it was assigned to; those features become uncategorized.

### Assigning a category

**From Claude Code (on publish):** pass `category` to `publish_document` or `submit_for_review`. This is a no-clobber suggestion: it is applied only if the feature has no category yet.

```
publish_document(
  feature_name="user-auth",
  document_type="spec",
  document_path="docs/specs/2026-06-27-user-auth-design.md",
  category="backend"
)
```

**From the desktop app:** open a feature. The **FeatureMetaBar** at the top of the detail pane shows a dropdown containing all vault categories plus an "Uncategorized" option. Selecting a value saves immediately. Unlike publishing, this always updates — it is not no-clobber.

### Filtering and grouping by category

The sidebar's **Arrange by** control has three modes: **Feature** (flat list), **Status**, and **Category**. Switch to **Category** to group all features under their category heading, with an "Uncategorized" group at the end.

The category swatch (a small colored dot) appears next to each feature row in all grouping modes so you can see category membership at a glance without switching views.

---

## Tags

Tags are free-form, multi-value strings. A feature can carry any number of tags. Tags are independent of the category list — you create them inline.

### Assigning tags

**From Claude Code (on publish):** pass `tags` as a list.

```
publish_document(
  feature_name="payments",
  document_type="plan",
  document_path="docs/plans/2026-06-28-payments-plan.md",
  tags=["pci", "q3"]
)
```

Tags from `publish_document` **merge** with any tags already on the feature. Republishing with a different tag list adds the new tags; it does not remove existing ones.

**From the desktop app:** the **FeatureMetaBar** shows existing tags as removable chips. To add a tag, type into the **Add tag…** field and press Enter. To remove one, click the × on its chip.

### Filtering by tag

The sidebar shows a tag strip below the status filters. Each tag chip displays the number of features that carry it. Click a tag chip to filter the list to features that carry that tag. You can select multiple tags; the list narrows to features that carry every selected tag (AND logic).

The sidebar shows at most two tag chips per feature row. If a feature has more than two tags, the overflow is shown as "+N".

---

## Tickets

Each feature can hold one external ticket reference: an id (required) and an optional URL. There is no live sync with any issue tracker — SignOff stores the reference only.

### Assigning a ticket

**From Claude Code (on publish):** pass `ticket_id` and, optionally, `ticket_url`.

```
publish_document(
  feature_name="billing",
  document_type="spec",
  document_path="docs/specs/2026-07-01-billing-spec.md",
  ticket_id="PROJ-456",
  ticket_url="https://linear.app/acme/issue/PROJ-456"
)
```

Like category, ticket is **no-clobber**: it is applied only if the feature has no ticket yet. Subsequent publishes with different `ticket_id`/`ticket_url` values are silently ignored if a ticket already exists.

**From the desktop app:** open a feature. The **FeatureMetaBar** shows an **Add ticket** button if no ticket is set. Click it to open an inline editor with two fields: **Ticket id** and **Ticket url**. Fill in the id (required), optionally add a URL, then click **Save ticket**. The ticket appears as a chip showing the id.

> Note: The URL field accepts any text, but clicking the ticket chip to open the URL in your browser only works for `http://` and `https://` URLs. Non-http URLs are stored but the chip is not clickable.

To remove a ticket from the desktop app, click the × on the ticket chip in the FeatureMetaBar.

### The ticket chip

When a ticket is set, the FeatureMetaBar shows a chip. If a URL is stored, the chip reads `PROJ-123 ↗` and clicking it opens the URL in your default browser. If no URL is stored, the chip shows the id only with no link.

---

## How the fields appear in the vault index

Categories, tags, and tickets are stored in the vault's `index.json` manifest under each feature's entry:

```json
{
  "version": 2,
  "categories": [
    { "id": "backend", "name": "Backend", "color": "blue" }
  ],
  "features": {
    "user-auth": {
      "spec": "docs/specs/2026-06-27-user-auth-design.md",
      "category": "backend",
      "tags": ["pci", "q3"],
      "tier": "standard",
      "ticket": { "id": "PROJ-456", "url": "https://linear.app/acme/issue/PROJ-456" }
    }
  }
}
```

---

## Scope notes

- Each feature supports exactly one category and one ticket. Multiple tickets per feature are not supported.
- There is no live sync between SignOff and any external issue tracker. The ticket field is a reference link only.
- The `signoff-report` output includes the feature name but does not currently include category, tags, or ticket data. See [Reporting](10-reporting.md).
- Categories, tags, and tickets have no effect on approval logic or gating. They are organizational metadata only.

---

## See also

- [Feature tiers](06-feature-tiers.md) — how tier (light/standard/heavy) affects what gets gated
- [Reporting](10-reporting.md) — approval-coverage reports across all features
