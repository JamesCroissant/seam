// React's types say a form action returns void. In Seam an action may return a value
// (read after the 303 with getActionResult, or by useActionState), or a Response (redirect()).
// This is the extension point @types/react provides for frameworks.
export {};

declare module "react" {
  interface DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_FORM_ACTIONS {
    seam: (formData: FormData) => unknown;
  }
}
