import type { QueryErrorCode } from "./types";

export class QueryError extends Error {
  readonly code: QueryErrorCode;
  constructor(code: QueryErrorCode, message: string) {
    super(message);
    this.name = "QueryError";
    this.code = code;
  }
}
