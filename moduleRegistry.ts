import { ModuleDefinition } from './types';
import { productsModule } from './modules/productsConfig';
import { productionBomModule, productionOrderModule } from './modules/productionConfig';
import { customerModule } from './modules/customerConfig';
import { supplierModule } from './modules/supplierConfig';

export const MODULES: Record<string, ModuleDefinition> = {
  products: productsModule,
  production_boms: productionBomModule,
  production_orders: productionOrderModule,
  customers: customerModule,
  suppliers: supplierModule,
};