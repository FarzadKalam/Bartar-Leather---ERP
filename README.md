# Mehrbanoo Leather ERP (BARTAR)

A modern, modular Enterprise Resource Planning (ERP) system tailored for manufacturing and retail businesses, built with React, TypeScript, and Supabase.

## 🌟 Key Features

- **Modular Architecture:** Fully dynamic module generation (Products, CRM, SCM, Production).
- **Advanced Views:** Switch between **List**, **Grid**, and **Kanban** views instantly.
- **Smart Components:** Auto-generated forms and tables based on configuration files.
- **Production Management:** hierarchical BOM (Bill of Materials) visualization.
- **Role-Based Access Control (RBAC):** Granular permission management.
- **Tagging System:** Flexible categorization for all records.
- **Localization:** Full Persian (Farsi) support with Jalali calendar integration.
- **UI/UX:** Dark/Light mode, responsive design for mobile & desktop.

## 🛠 Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **UI Library:** Ant Design (v5), Tailwind CSS
- **State/Logic:** React Router v6, React Hooks
- **Backend/DB:** Supabase (PostgreSQL)
- **Icons:** Ant Design Icons
- **Date Handling:** Day.js + JalaliDay

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- A Supabase project URL and Anon Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd bartar-leather-erp
Install dependencies:

Bash

npm install
Environment Setup: Create a .env file in the root directory:

Code snippet

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
Run Development Server:

Bash

npm run dev
🗂 Project Structure
/src

/components: Reusable UI components (SmartForm, SmartTable, TagInput, etc.)

/modules: Configuration files for each module (productsConfig, customerConfig, etc.)

/pages: Main page layouts (ModuleList, ModuleShow, Settings)

/types: TypeScript interfaces and enums.

moduleRegistry.ts: Central registry to register new modules.

🧩 How to Add a New Module
Create a table in Supabase.

Create a config file in src/modules/ (e.g., taskConfig.ts).

Define fields, types, and view settings in the config.

Import and register the module in src/moduleRegistry.ts.

Add the route to the Sidebar in Layout.tsx (Optional).

🤝 Contributing
This project is currently under active development.

Lead Developer: Farzad

AI Partner: Gemini

📄 License
Private / Proprietary