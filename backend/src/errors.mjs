export class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ArangoError extends Error {
  constructor(status, errorNum = undefined) {
    super("ArangoDB request failed");
    this.name = "ArangoError";
    this.status = status;
    this.errorNum = errorNum;
  }
}

export function safeError(error) {
  if (error instanceof HttpError) return error;
  if (error instanceof ArangoError) {
    if (error.status === 404) return new HttpError(404, "NOT_FOUND", "The requested resource was not found");
    if (error.status === 409) return new HttpError(409, "CONFLICT", "The request conflicts with existing data");
  }
  return new HttpError(500, "INTERNAL_ERROR", "An unexpected error occurred");
}
