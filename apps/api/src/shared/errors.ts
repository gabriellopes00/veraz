/** Errors raised by domain and application code. Only server.ts maps them to HTTP. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {}

export class InvalidInputError extends DomainError {}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
