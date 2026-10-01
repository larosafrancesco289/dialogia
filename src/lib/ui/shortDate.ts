const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "27 Sep", with the year when it is not this one; held together, so it never breaks across lines. */
export function shortDate(at: number): string {
  const date = new Date(at);
  const day = `${date.getDate()}\u00a0${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === new Date().getFullYear()
    ? day
    : `${day}\u00a0${date.getFullYear()}`;
}
