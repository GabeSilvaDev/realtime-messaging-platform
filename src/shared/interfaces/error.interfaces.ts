export interface ErrorDetails {
  field?: string;
  message: string;
  code?: string;
}

export interface FieldError {
  field: string;
  message: string;
  code?: string;
  received?: unknown;
  expected?: string;
}
