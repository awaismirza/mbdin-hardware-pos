# Dukaan POS — Visual Redesign Spec

Design-only handoff. This document dictates **colour, type, spacing, shape, and component styling**. It says nothing about routing, state, data, or business logic — keep your existing functionality and re-skin it.

> **This file is canonical for how the app looks.** It was implemented in full
> in the cobalt redesign; `src/styles/app.css` holds the tokens, and every
> screen is built against the rules below. Where the code and this document
> disagree, this document is the bug report. Anything the app does not have a
> data model for — the day session, purchase orders, the returns flow — was
> deliberately left out rather than faked, and is tracked in `docs/roadmap.md`.

---

## 1. Design intent

The old UI was a bahi-khata: ruled lines on green paper, one ledger red, no cards, no elevation. The redesign is a clean break — a modern POS surface.

- **Cards, not rules.** Content sits on white/near-black cards with a 1px border and a whisper of shadow. Hairline dividers only *inside* a card.
- **Cobalt as the single accent.** One brand colour carries every primary action, active state and data highlight. Red is reserved for money owed and destructive actions — it is no longer the brand.
- **Money is monospace.** Every currency amount, quantity, phone number, SKU, date and percentage sits in IBM Plex Mono with tabular figures so columns never shift.
- **Generous radii, soft depth.** 10–16px radii throughout; shadows are ambient, never dramatic.
- **Calm neutrals.** Backgrounds are cool grey, not paper. Nothing competes with the accent.

---

## 2. Colour

Two full themes. Ship both — the shop front is bright at noon and dark at closing. Persist the choice.

### 2.1 Light — "Daylight"

| Token | Hex | Used for |
| --- | --- | --- |
| `--desk` | `#e7e9ee` | Area outside the app frame |
| `--bg` | `#f4f5f7` | App canvas / scroll area |
| `--panel` | `#ffffff` | Cards, sidebar, header, sheets |
| `--panel2` | `#f6f7fa` | Inputs, inset rows, table headers, icon wells |
| `--line` | `#e3e6ec` | All borders and dividers |
| `--fg` | `#101623` | Primary text |
| `--fg2` | `#616b7d` | Secondary text, labels, placeholders |
| `--brand` | `#3549cf` | Primary actions, active nav, focus, data highlight |
| `--brand-soft` | `#e9ecfb` | Active nav pill, chart fill, ranked-row bar |
| `--brand-glow` | `rgba(53,73,207,.28)` | Shadow under primary buttons |
| `--ok` | `#12795a` | Cash, payments received, in-stock, positive |
| `--ok-soft` | `#e2f2ec` | Success chip background |
| `--warn` | `#a8722a` | Low stock, ageing udhaar, stale backup |
| `--warn-soft` | `#fbf0dd` | Warning chip background |
| `--bad` | `#c33b32` | Udhaar owed, out of stock, destructive |
| `--bad-soft` | `#fbe9e7` | Danger chip background |
| `--shadow` | `rgba(16,22,35,.07)` | Card shadow colour |

### 2.2 Dark — "Night"

| Token | Hex |
| --- | --- |
| `--desk` | `#070a10` |
| `--bg` | `#0c0f16` |
| `--panel` | `#141926` |
| `--panel2` | `#1b2130` |
| `--line` | `#28303f` |
| `--fg` | `#eef1f7` |
| `--fg2` | `#98a2b4` |
| `--brand` | `#7286ff` |
| `--brand-soft` | `#1c2444` |
| `--brand-glow` | `rgba(114,134,255,.3)` |
| `--ok` | `#3fbc90` |
| `--ok-soft` | `#12271f` |
| `--warn` | `#d9a054` |
| `--warn-soft` | `#2a2113` |
| `--bad` | `#f0736a` |
| `--bad-soft` | `#2d1615` |
| `--shadow` | `rgba(0,0,0,.5)` |

### 2.3 Colour rules

1. **Never use `--bad` for branding.** Red means *owed*, *out*, or *erase*. A red primary button only appears on destructive confirmation.
2. **Money direction:** cash in and payments received are `--ok`; udhaar given and balances owed are `--bad`; neutral totals are `--fg`.
3. **Stock status:** in stock `--ok`, at or below the warn-below level `--warn`, zero `--bad`. Out-of-stock tiles also drop to `opacity: .6`.
4. **Soft tokens are backgrounds only** — always pair `--x-soft` background with `--x` text.
5. **One accent per screen.** If two things want to be cobalt, only the primary action gets it.
6. Optional brand swap (`#0f766e` teal, `#7c3aed` violet, `#b4530a` amber) must drive `--brand`, `--brand-soft` and `--brand-glow` together. Nothing else changes.

---

## 3. Typography

```
Display / UI:  'Plus Jakarta Sans', system-ui, sans-serif   — 400 500 600 700 800
Numeric:       'IBM Plex Mono', monospace                   — 400 500 600
```

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Screen title | 17px | 800 | `letter-spacing:-.02em` |
| Screen subtitle | 11.5px | 400 | `--fg2` |
| Card heading | 14.5px | 700 | |
| Section label | 11.5px | 700 | uppercase, `letter-spacing:.03em`, `--fg2` |
| Body | 13.5px | 400–600 | |
| Meta / caption | 11.5px | 400 | `--fg2` |
| Micro (chips, keycaps) | 10.5px | 700 | |
| Cart total | 34px | 600 | mono, `letter-spacing:-.03em` |
| Hero figure (takings, balance) | 44–46px | 600 | mono, `letter-spacing:-.035em` |
| KPI figure | 23px | 600 | mono, `white-space:nowrap` |

Rules:
- **Everything numeric is mono.** Amounts, quantities, percentages, dates, times, phone numbers, SKUs, barcodes, invoice numbers. Mixed text keeps sans; wrap just the number in mono.
- Currency format: `Rs 1,965` — comma thousands, paisa only when non-zero.
- Never centre body copy. Hero figures may be left-aligned or right-aligned in a column; never centred.
- Minimum readable size in the app is 10.5px, and only for chips.

---

## 4. Shape, spacing, elevation

| Property | Value |
| --- | --- |
| Card radius | 14px (16–18px for hero cards and sheets) |
| Control radius | 10–12px |
| Chip / pill radius | 999px |
| Input radius | 10–11px |
| Card padding | 15–18px |
| Screen padding | 16–18px |
| Grid gap | 10–12px |
| Card shadow | `0 1px 2px var(--shadow)` |
| Primary button shadow | `0 2px 10px var(--brand-glow)` |
| Sheet shadow | `0 10px 40px var(--shadow)` |
| Frame shadow | `0 14px 44px rgba(10,14,22,.16)` |

Borders are always exactly `1px solid var(--line)`, except a selected control which uses `1.5px solid var(--brand)`.

**Touch targets:** primary buttons 46–54px, secondary 40–44px, quantity steppers 40px (44px on phone), nav items 42px. Nothing tappable below 34px.

---

## 5. Components

### Buttons

| Variant | Background | Text | Border | Height |
| --- | --- | --- | --- | --- |
| Primary | `--brand` | `#fff` | none | 46–54px, radius 11–12px, glow shadow |
| Secondary | `--panel2` | `--fg` | `--line` | 40–46px |
| Ghost | transparent | `--brand` | none | inline, 700 |
| Destructive | transparent | `--bad` | `--bad` | 42px |

### Chips (filters, categories, ranges)
Unselected: `--panel` bg, `--fg2` text, `--line` border. Selected: `--fg` bg, `--bg` text, `--fg` border — an inverted pill, not cobalt. Height 34–36px, radius 999px (10px for the rectangular stock/report tabs).

### Status badges
10.5px / 700, `3px 8px`, radius 999px, soft-background pairing. Vocabulary: `In stock`, `Low`, `Out`, `Udhaar`, `Cash`, `Easypaisa`, `settled`, `in credit`, `31d overdue`.

### Cards
`--panel` background, `--line` border, 14px radius, `0 1px 2px var(--shadow)`. Internal rows divide with a `1px solid var(--line)` bottom border, no radius, full-bleed to the card edge.

### Inputs
`--panel2` background, `--line` border, 10–11px radius, 42–50px tall, 12–13px horizontal padding. Label above: 11.5px / 600 / `--fg2`, 5px gap. Numeric inputs use mono. Urdu fields get `dir="rtl"` and 14px.

### Product tile (Sell grid)
Card, min-height 128px, 13px radius, 11px padding. Top: a 52px `--panel2` image well showing the Urdu name (or the product photo), with a low/out badge pinned top-right. Then name 13.5/600, price mono 14.5/600 with `/ unit` in 11px `--fg2`, and stock line 11px mono in the status tone. Out of stock → `opacity:.6`.

### Cart line
`--panel2` inset card, 12px radius. Name + unit price on row one; stepper, line total (mono, right-aligned) and a ghost `×` on row two. Stepper is a single bordered group with a divided centre value — do not space the three parts apart.

### Sheets
Bottom sheet, max-width 520px, radius `18px 18px 0 0`, `--panel` background, scrim `rgba(10,14,22,.5)`, enter with a 200ms `translateY(14px)` ease-out. Header row: 16px/800 title, flex spacer, 36px square close button.

### Toast
Pill on `--fg` background with `--bg` text, bottom-centre, 999px radius, 12.5px/600.

### Receipt slip
Always white paper with black text in **both** themes — it is a print preview. 340px max, mono 12px/1.55, dashed `#999` rules, shop name in sans 13/600.

---

## 6. Layout & responsive

Three breakpoint shapes. Same screens, same components, different chrome.

### Desktop / counter (≥1024px)
- **248px sidebar**, `--panel`, right border. Brand lockup on top (26px cobalt rounded square with `د`, then shop name in 11.5px `--fg2`). Nav items 42px, radius 10px, with a 3px cobalt bar on the left of the active item, an active `--brand-soft` pill, and a right-aligned count badge.
- Sidebar footer holds the **day-session card**: status dot + label, drawer amount in mono 19px, and a full-width action button.
- Header bar: title/subtitle block, spacer, search field (340px max, `--panel2`, with a `⌘K` keycap), day-status pill.
- Sell splits into catalogue (fluid) + **392px cart pane** on the right with its own `--panel` background and left border.
- Two-column content grids use `1.55fr 1fr`.

### Tablet (768–1023px)
- Sidebar collapses to an **88px icon rail**: 32px brand square, then stacked items with an 18×3px cobalt bar above an 11px label, active item on `--brand-soft`. Day-session button pinned to the bottom of the rail.
- Cart pane stays visible but the catalogue drops to 3 tile columns.
- KPI grids go 2-up; two-column grids stack to one.

### Phone (<768px)
- No sidebar. **Bottom tab bar** of 5 items: Sell, Stock, People, Reports, More. Each is a 22×3px bar above a 10.5px label; active is cobalt, inactive `--fg2`.
- Header search moves into the Sell screen body as a full-width field beside a quick-sell button.
- Cart pane becomes a **cobalt summary bar** above the tab bar (count pill, customer name, total in mono 17px) that opens the cart as a bottom sheet.
- Tiles 2-up, KPIs 2-up, all two-column grids stack, customer cards go full width.

---

## 7. Screen notes

Only the visual arrangement — behaviour is yours.

- **Sell (default screen).** Top strip is a horizontally scrolling **quick-action row**: Quick sell (cobalt-tinted, accent), Take payment, Receive stock, Return, Held carts, Open/Close day. Each is a 44px pill with a 24px icon well, a 13px/700 label and a 10.5px sub-label. Below it: parked-cart tabs (top-rounded, active one lifted onto `--panel`), category chips, then the tile grid. No analytics on this screen.
- **Reports.** Owns every "today" figure: range chips, the four KPI cards (cash in drawer, udhaar out, estimated profit, average basket), a hero takings card with a 7-day bar chart, a figures list, a payment-mix card with proportional bars, a ranked top-products table with `--brand-soft` bars painted behind each row, a takings-by-hour chart, a needs-attention list, and recent sales.
- **Stock.** Rectangular status tabs with counts, then one card holding a table: 40px image well, name + SKU/barcode in mono, price, margin, and an on-hand cell that pairs a status badge with a 5px proportional bar in the status tone.
- **Product detail.** Two columns — left is the hero card (104px photo, name, badges, three inset stat wells for price/cost/margin) over a movement-history table; right is the edit form.
- **Customers.** Three KPI cards, then a card grid: avatar tinted by balance state, name + phone, status badge, balance in mono 21px, and Ledger / Remind buttons.
- **Customer ledger.** The balance card is **solid cobalt with white text** — the one place the accent fills a whole surface. Progress bar shows credit-limit usage. Beside it a 2×2 stats card and an action card; below, the ledger table with running balance.
- **Purchases.** Card grid per order: supplier, status badge, ref + date in mono, item summary, total in mono 21px, one action button.
- **Settings.** Left column shop form + an appearance card with two real theme swatch buttons (`#f4f5f7` and `#0c0f16` previews) and an English/اردو pair. Right column: data table, PIN row of four 46×52px mono boxes, and a danger card on `--bad-soft` with a `--bad` border.
- **Receipt.** Success header, the white slip, then a stack of full-width actions with New sale primary.
- **First launch.** Single centred 460px card on `--bg`, brand lockup, language pair, form, one primary button.

---

## 8. Motion

Short and functional only.

| Where | Animation |
| --- | --- |
| Screen change | `opacity` fade, 180ms ease |
| Sheet open | `translateY(14px)` + fade, 200ms `cubic-bezier(.2,.8,.2,1)` |
| Cart line added | `scale(.97)` + fade, 160ms ease |
| Toast | `translateY(14px)` + fade, 180ms ease |

No spinners on local work, no skeleton shimmer, no parallax, no page transitions longer than 200ms.

---

## 9. Do not

- Do not reintroduce ruled-paper backgrounds, the ledger green, or `#a32c24` as a brand colour.
- Do not use gradients for surfaces or buttons. Flat fills only.
- Do not put emoji in the UI.
- Do not render amounts in the sans face.
- Do not centre-align body text or form labels.
- Do not exceed one accent-coloured primary action per view.
- Do not let any tap target fall below 34px, or any body text below 11.5px.
