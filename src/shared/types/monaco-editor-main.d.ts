/**
 * The ESM entry Monaco publishes by PATH rather than by `main`.
 *
 * 🛑 `editor.main` and not `editor.api`: the api module is the types and the editor alone, and
 * the TypeScript contribution — which is what makes a diagnostic — comes with this one.
 */
declare module 'monaco-editor/editor/editor.main' {
  export * from 'monaco-editor'
}
