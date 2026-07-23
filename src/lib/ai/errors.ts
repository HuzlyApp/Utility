export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class EmptyResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyResponseError";
  }
}

export class AiServiceError extends Error {
  originalError: unknown;
  constructor(message: string, originalError: unknown) {
    super(message);
    this.name = "AiServiceError";
    this.originalError = originalError;
  }
}

export class AiValidationError extends Error {
  details: unknown;
  constructor(message: string, details: unknown) {
    super(message);
    this.name = "AiValidationError";
    this.details = details;
  }
}

export class ProviderUnavailableError extends Error {
  provider: string;
  constructor(message: string, provider: string) {
    super(message);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
  }
}
