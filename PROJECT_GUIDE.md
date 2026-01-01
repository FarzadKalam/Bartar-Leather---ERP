
# Bartar Leather ERP - Technical Specification & Architecture Guide

**Version:** 2.1 (Master-Detail Support)
**Framework:** React + TypeScript + Ant Design + Tailwind CSS

This document defines the architectural standards for the Bartar Leather ERP. This project has evolved from a standard React app into a **Meta-Driven Platform**. The frontend acts primarily as a rendering engine for configurations defined in a central registry.

---

## 1. Core Architecture: The "Meta-Driven" Engine

Instead of hardcoding pages for every entity (Customer, Product, Order), we define the **structure, logic, and behavior** of modules in configuration files. The UI components then interpret these configs to render the interface.

### Key Components

1.  **The DNA (`types.ts`):**
    *   Contains all Enums (`FieldType`, `ModuleNature`, `UserRole`, `LogicOperator`).
    *   Defines the strict interfaces for `ModuleDefinition`, `FieldDefinition`, and `FieldLogic`.
    *   **New in 2.1:** `BlockType` (FIELD_GROUP vs TABLE) and `TableColumnDefinition`.

2.  **The Registry (`moduleRegistry.ts`):**
    *   This is the "Database of UI/Logic".
    *   It exports a `MODULES` object where every key (e.g., `products`, `boms`) maps to a full `ModuleDefinition`.
    *   **Rule:** Do not hardcode field logic in components. Define it here.

3.  **The Rendering Engine (`pages/ModuleShow.tsx`):**
    *   This component is the generic entity renderer.
    *   It parses the configuration to handle visibility rules, access control, and layout.
    *   It switches between `SmartFieldRenderer` (for standard fields) and `SmartTableRenderer` (for BOM/Invoice items).

4.  **Atomic UI Components:**
    *   `SmartFieldRenderer.tsx`: Handles View/Edit state of a single data point.
    *   `SmartTableRenderer.tsx`: **(New)** Handles Master-Detail lists (BOM items, Invoice rows). Displays as Table on Desktop, Cards on Mobile.

---

## 2. Business Logic Specifications

The system supports advanced business logic directly within the frontend configuration.

### A. Master-Detail (BOMs & Invoices)
For entities that contain a list of items (rows), use the `BlockType.TABLE` configuration.
*   **Structure:**
    ```typescript
    {
      id: 'items',
      type: BlockType.TABLE,
      tableColumns: [
         { key: 'product_id', title: 'Product', type: FieldType.RELATION, ... },
         { key: 'qty', title: 'Quantity', type: FieldType.NUMBER, ... }
      ]
    }
    ```
*   **Behavior:** The renderer automatically passes the `record.items` array to the `SmartTableRenderer`.

### B. Conditional Visibility (`visibleIf`)
Fields can depend on the value of other fields.
*   **Structure:**
    ```typescript
    visibleIf: {
      field: 'hasWarranty',    // Key of the parent field
      operator: LogicOperator.IS_TRUE, // Logic: eq, neq, gt, lt, contains, is_true
      value: undefined         // Optional value for comparison
    }
    ```

### C. Formula Engine (`formula`)
Fields can be calculated automatically.
*   **Syntax:** Use `{fieldKey}` variables inside strings.
*   **Supported Operations:** Basic Math (`*`, `/`, `+`, `-`) and String concatenation (`CONCAT`).
*   **Example:**
    ```typescript
    formula: "{price} * {stock}" // Inventory Value
    formula: "CONCAT({firstName}, ' ', {lastName})" // Full Name
    ```
*   **Behavior:** Calculated fields are automatically set to `readonly`.

---

## 3. Design System & Theming

The UI follows a "Premium Leather" aesthetic optimized for industrial ERP environments.

### Core Color Palette:
- **Main App Navigation:** `#c58f60` (Leather Orange).
- **Background Layer 0:** `#141414` (Deep Black).
- **Surface Layer 1 (Cards, Tables):** `#1f1f1f`.
- **Inputs/Borders:** `#303030`.
- **Text Primary:** `#e5e5e5`.

### Typography:
- **Font:** `Vazirmatn` (RTL Optimized).
- **Numbers:** Persian digits for display (`toLocaleString('fa-IR')`), English for Inputs/Codes.

---

## 4. File Structure Reference

*   `src/types.ts` -> **(Critical)** All TypeScript interfaces and Enums.
*   `src/moduleRegistry.ts` -> **(Critical)** Configuration for all modules.
*   `src/components/SmartFieldRenderer.tsx` -> The UI component for fields.
*   `src/components/SmartTableRenderer.tsx` -> The UI component for tables/lists.
*   `src/pages/ModuleShow.tsx` -> The main logic engine.
*   `src/components/Layout.tsx` -> Main Application Shell (Sidebar/Header).

---

## 5. Development Roadmap

1.  **Formula Parser:** Replace the current `Function` based formula evaluation with a safer library like `mathjs`.
2.  **Visual Builder:** Create a "Settings" page that allows Admins to modify `moduleRegistry` JSON via a GUI.
3.  **Database Sync:** Map the `specs` object in JSONB columns in Supabase/Postgres.
4.  **Production Orders:** Duplicate the BOM structure for Production Orders, adding 'Batch Number' and 'Date'.
