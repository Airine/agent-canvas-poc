import { registry } from './registry.js';
import { coordinator } from './coordinator.js';

export function requireHerdr(workspaceId: string): void {
  registry.assertWritable(workspaceId);
  if (registry.backend(workspaceId) === 'e') throw new Error('e workspaces use session controls, not terminal/graph execution');
}
export const runtimeRouter = {
  run: async (id: string) => { requireHerdr(id); await coordinator.run(id); },
  reset: async (id: string) => { requireHerdr(id); await coordinator.reset(id); },
  input: async (id: string, nodeId: string, text: string) => { requireHerdr(id); await coordinator.sendInput(id, nodeId, text); },
};
