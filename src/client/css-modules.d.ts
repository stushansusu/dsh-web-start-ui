/** CSS Modules typing for the client half (tsdown inlines the css at build). */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
