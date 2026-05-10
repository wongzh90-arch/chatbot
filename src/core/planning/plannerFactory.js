/**
 * plannerFactory – Picks the right planner based on discovery cache size.
 */
import { agenticPlan } from './agenticPlanner.js';
import { coordinatedPlan } from './coordinatedPlanner.js';
import { hierarchicalPlan } from './hierarchicalPlanner.js';

export async function createPlan(ctx, goal) {
    const normalPlanner = ctx.discoveryCache.length > 10 ? coordinatedPlan : agenticPlan;
    return hierarchicalPlan(ctx, goal, normalPlanner);
}
