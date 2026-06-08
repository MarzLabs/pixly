import { Orchestrator } from './orchestrator';

/**
 * Content-script entry point. A single orchestrator per page wires the registry, persistence and
 * Shadow DOM UI, then re-applies whatever tools the user previously activated for this scope.
 */
const orchestrator = new Orchestrator();

void orchestrator.start();
