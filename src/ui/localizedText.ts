export function localizedText(value: string, language: string) {
  const separator = ' / '
  const splitAt = value.indexOf(separator)
  if (splitAt < 0) return value
  return language === 'en' ? value.slice(splitAt + separator.length) : value.slice(0, splitAt)
}
