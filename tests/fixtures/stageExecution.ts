import { plannedRoutes, type StageExecution } from '../../utils/productionStageExecution';
import { warehouse, type PlanStage } from '../../utils/productionStagePlan';

export function sampleStageExecution(stages: PlanStage[], quantity = 5): StageExecution {
  return {
    revision:0, results:[],
    lots:plannedRoutes(stages).filter(r => r.from === warehouse).map((r,index) => ({
      id:'opening-' + index, routeId:r.id, stageId:r.to, label:r.state, unit:r.unit,
      bundle:'بستهٔ مواد ' + (index+1).toLocaleString('fa-IR'), shelf:'قفسهٔ مرحله',
      quantity:index === 0 ? 8 : Number((r.perItem*quantity).toFixed(9)),
    })),
  };
}
