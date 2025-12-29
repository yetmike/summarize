export function createUnsupportedFunctionalityError(message: string): Error {
  const error = new Error(`Functionality not supported: ${message}`)
  error.name = 'UnsupportedFunctionalityError'
  return error
}
