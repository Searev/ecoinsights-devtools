export function getFormValue<T = any>(formId: string): T {
  return [
    ...new FormData(
      document.getElementById(formId) as HTMLFormElement
    ).entries(),
  ].reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}) as T;
}

export function getBooleanFormValue(form: any, key: string): boolean {
  return form[key] === "on";
}
