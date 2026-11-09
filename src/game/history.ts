export type History<T> = { past: T[]; present: T; future: T[] }
export const historyOf = <T>(present: T): History<T> => ({ past: [], present, future: [] })

export function commit<T>(history: History<T>, present: T): History<T> {
  if (present === history.present) return history
  return { past: [...history.past, history.present].slice(-30), present, future: [] }
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history
  return {
    past: history.past.slice(0, -1), present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  }
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history
  return {
    past: [...history.past, history.present], present: history.future[0],
    future: history.future.slice(1),
  }
}
