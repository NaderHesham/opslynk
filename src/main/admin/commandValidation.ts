import type { AdminCommand } from '../../shared/contracts/admin';

export interface ValidationRequest {
  command: AdminCommand;
  payload: Record<string, unknown>;
}

export interface ValidationDecision {
  valid: boolean;
  error?: string;
  mode: 'validator-map' | 'legacy-trust';
}

interface ValidationDeps {
  validators?: Partial<Record<AdminCommand, (payload: Record<string, unknown>) => { valid: boolean; error?: string }>>;
}

export function createCommandValidation({ validators = {} }: ValidationDeps): {
  validate: (request: ValidationRequest) => ValidationDecision;
} {
  function validate(request: ValidationRequest): ValidationDecision {
    const validator = validators[request.command];
    if (!validator) {
      // Temporary compatibility mode. Validation hardening will be added in a dedicated phase.
      return { valid: true, mode: 'legacy-trust' };
    }
    const result = validator(request.payload);
    return { valid: result.valid, error: result.error, mode: 'validator-map' };
  }

  return { validate };
}
