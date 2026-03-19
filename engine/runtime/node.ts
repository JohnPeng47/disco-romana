export function getNextNodeId(opt: any, rollOutcome?: string): string | null {
  if (!rollOutcome) {
    return opt.nextNodeId || (opt.onSuccess && opt.onSuccess.nextNodeId);
  }
  if (rollOutcome === 'success' && opt.onSuccess) return opt.onSuccess.nextNodeId;
  if (rollOutcome === 'partial' && opt.onPartial) return opt.onPartial.nextNodeId;
  if (rollOutcome === 'failure' && opt.onFailure) return opt.onFailure.nextNodeId;
  return (opt.onSuccess && opt.onSuccess.nextNodeId) || opt.nextNodeId;
}
