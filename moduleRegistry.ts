import { ModuleDefinition } from './types';
import { productsConfig } from './modules/productsConfig';
import { productionBomModule, productionOrderModule } from './modules/productionConfig';
import { customerModule } from './modules/customerConfig';
import { supplierModule } from './modules/supplierConfig';
import { tasksModule } from './modules/tasksConfig';

export const MODULES: Record<string, ModuleDefinition> = {
  products: productsConfig,
  production_boms: productionBomModule,
  production_orders: productionOrderModule,
  customers: customerModule,
  suppliers: supplierModule,
  tasks: tasksModule,
};