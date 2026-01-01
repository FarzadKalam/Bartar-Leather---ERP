import { ModuleDefinition } from './types';
import { productsModule } from './modules/productsConfig';
import { productionBomModule, productionOrderModule } from './modules/productionConfig';

export const MODULES: Record<string, ModuleDefinition> = {
  products: productsModule,
  production_boms: productionBomModule,
  production_orders: productionOrderModule,
};