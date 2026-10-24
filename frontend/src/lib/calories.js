// Missing readings are unknown, not zero. Exercise energy is never a substitute for total burn.
export const calorieValue = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

export function calorieDay(day = {}, goal) {
  const intake = calorieValue(day.yazio?.energy)
  const totalBurn = calorieValue(day.samsung?.totalBurn)
  const exercise = calorieValue(day.samsung?.exercise)
  const target = calorieValue(goal)
  return {
    intake, totalBurn, exercise,
    steps: calorieValue(day.samsung?.steps),
    protein: calorieValue(day.yazio?.protein),
    carbs: calorieValue(day.yazio?.carbs),
    fat: calorieValue(day.yazio?.fat),
    balance: intake !== null && totalBurn !== null ? intake - totalBurn : null,
    remaining: intake !== null && target > 0 ? target - intake : null,
    progress: intake !== null && target > 0 ? Math.min(100, intake / target * 100) : null,
  }
}

export function calorieWeek(date) {
  const end = new Date(date + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(end)
    d.setDate(d.getDate() - 6 + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
}
