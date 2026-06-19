export class AwswizError extends Error {
  readonly hint?: string;

  constructor(message: string, options?: { hint?: string }) {
    super(message);
    this.name = 'AwswizError';
    this.hint = options?.hint;
  }
}
