import {activationRoutes} from './activation.mjs';
import {adminRoutes as coreRoutes} from './admin-core.mjs';
export async function adminRoutes(context){
  await activationRoutes(context);
  if(!context.res.writableEnded)await coreRoutes(context);
}
