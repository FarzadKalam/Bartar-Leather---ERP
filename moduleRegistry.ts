import { ModuleDefinition } from './types';
import { productsConfig } from './modules/productsConfig';
import { productBundlesConfig } from './modules/productBundlesConfig';
import { productionBomModule, productionOrderModule } from './modules/productionConfig';
import { customerModule } from './modules/customerConfig';
import { supplierModule } from './modules/supplierConfig';
import { tasksModule } from './modules/tasksConfig';
import { invoicesConfig } from './modules/invoicesConfig';

export const MODULES: Record<string, ModuleDefinition> = {
  products: productsConfig,
  product_bundles: productBundlesConfig,
  production_boms: productionBomModule,
  production_orders: productionOrderModule,
  customers: customerModule,
  suppliers: supplierModule,
  invoices: invoicesConfig,
  tasks: tasksModule,
};