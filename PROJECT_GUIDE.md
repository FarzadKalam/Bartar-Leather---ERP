# Bartar Leather ERP - Architecture & Technical Guide

**Version:** 3.0 (CRM, SCM, & Advanced Views)
**Stack:** React + TypeScript + Vite + Ant Design + Tailwind CSS + Supabase

This document outlines the architectural standards and codebase structure for the Bartar Leather ERP. The system is designed as a **Meta-Driven Platform**, meaning the UI is dynamically generated based on JSON-like configuration files rather than hardcoded layouts.

---

## 1. Project Structure (No `src` folder)

The project uses a flat structure tailored for Vite. All source code resides in the root or specific feature folders.

```text
/
├── components/          # Reusable UI Atoms (SmartForm, TagInput, etc.)
│   ├── renderers/       # Specific renderers like BomStructureRenderer
│   ├── Sidebar/         # Layout specific sidebars
│   └── ...
├── modules/             # Configuration files for each entity
│   ├── productsConfig.ts
│   ├── customerConfig.ts
│   ├── supplierConfig.ts
│   └── ...
├── pages/               # Main Route Components
│   ├── ModuleList.tsx   # The "All Records" view (List/Grid/Kanban)
│   ├── ModuleShow.tsx   # The "Single Record" view (Tabs/Forms)
│   └── Settings/        # Settings & Admin pages
├── App.tsx              # Main Entry & Routing
├── moduleRegistry.ts    # Central registry linking configs to ID strings
├── supabaseClient.ts    # Database connection instance
├── types.ts             # TypeScript Interfaces & Enums (The DNA of the app)
└── ...

```

---

## 2. Core Architecture: The "Meta-Driven" Engine

### A. The Configuration (`modules/*.ts`)

Instead of writing HTML/JSX for every page, we define the "Metadata" of a module.

* **Example:** To add a "Phone Number" field to Customers, we add a generic object to `customerConfig.ts`:
```typescript
{ key: 'mobile', type: FieldType.PHONE, location: FieldLocation.HEADER, ... }

```



### B. The Registry (`moduleRegistry.ts`)

This file imports all individual configs and exports a single `MODULES` object. The application reads from this registry to know which routes exist (e.g., `/customers`, `/products`).

### C. The Rendering Engines

1. **`ModuleList.tsx`:**
* Handles data fetching for collections.
* Supports **3 View Modes**:
* **List:** Standard table with sorting/filtering.
* **Grid:** Visual cards (great for products).
* **Kanban:** Grouped columns (by Status, Category, or Rank).


* Includes `ViewManager` for saving custom filters.


2. **`ModuleShow.tsx`:**
* Handles the single record view.
* Manages **Tabs**, **Field Groups**, and **Master-Detail** relationships.
* Integrates the **Tagging System** and **Assignee** logic.



---

## 3. Key Components & Features

### Smart Components

* **`SmartForm.tsx`:** A dynamic form builder that handles validation, file uploads, date picking (Jalali), and Select options based on the `FieldType`.
* **`SmartTableRenderer.tsx`:** A dynamic table that handles searching inside columns, custom rendering (Tags, Avatars, Prices), and row selection.

### Tagging System

A flexible, many-to-many tagging system implemented via Supabase.

* **Tables:** `tags` (definitions) + `record_tags` (links).
* **UI:** Managed by `components/TagInput.tsx`. Allows creating and assigning colored tags to any record type.

### Master-Detail Logic (BOMs)

For entities like **Production BOM**, the system renders a hierarchical tree or a nested table.

* **Config:** Defined using `BlockType.TABLE` in the module config.
* **Renderer:** `BomStructureRenderer` handles the recursive tree visualization.

---

## 4. Database Schema (Supabase/PostgreSQL)

The backend relies on Supabase. Key tables include:

* **Core Entities:** `products`, `customers`, `suppliers`, `production_boms`.
* **System Tables:**
* `profiles`: Extended user data (connected to Auth).
* `org_roles`: Role-Based Access Control (RBAC) definitions.
* `tags` & `record_tags`: Universal tagging.
* `saved_views`: Stores user-defined filters for `ModuleList`.
* `company_settings`: Global settings (Logo, Name).



**Security:** Row Level Security (RLS) is enabled. Currently set to allow authenticated access, but ready for granular policies.

---

## 5. Design System & Theming

* **Theme:** Fully supports **Dark/Light** modes via Tailwind classes (`dark:bg-black`) and Ant Design ConfigProvider.
* **Color Palette:**
* Primary: Leather Orange (`#c58f60`).
* Dark Backgrounds: Deep Black (`#141414`) and Dark Grey (`#1f1f1f`).


* **Responsiveness:** Mobile-first design. Sidebar collapses on mobile, tables become scrollable, and headers adapt.

---

## 6. Development Roadmap

1. **Financial Module:** Implement `Invoices` (Sales/Purchase) with calculation logic (Tax, Discount, Total).
2. **Dashboard:** Create a widget-based dashboard (`pages/Dashboard.tsx`) to visualize key metrics using Recharts.
3. **Advanced Formula:** Implement a parser to handle field dependencies (e.g., `Total = Qty * Price`) in real-time within `SmartForm`.
4. **Printing:** Generate PDF templates for Invoices and BOMs.