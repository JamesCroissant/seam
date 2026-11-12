/**
 * The Standard Schema interface (https://standardschema.dev), copied as types only.
 * Zod, Valibot, ArkType and others implement it, so Seam does not depend on any of them.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardIssue> };

export interface StandardIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

export type InferInput<S> = S extends StandardSchemaV1<infer I, unknown> ? I : never;
export type InferOutput<S> = S extends StandardSchemaV1<unknown, infer O> ? O : never;
