export const REPAYMENT_TEXT = Object.freeze({
  status: Object.freeze({
    repaying: 'Pendiente de pago',
    overdue: 'Atrasado',
  }),
  labels: Object.freeze({
    amount: 'Monto a pagar',
    dueDate: 'Fecha de vencimiento',
    currency: 'S/',
  }),
  empty: Object.freeze({
    message: 'Sin orden',
    action: 'Aplicar ahora',
  }),
  error: Object.freeze({
    message: 'No se pudieron cargar los pedidos.',
  }),
  loadingLabel: 'Cargando pedidos',
})

export function getRepaymentStatusText(statusKey) {
  return REPAYMENT_TEXT.status[statusKey] ?? ''
}
