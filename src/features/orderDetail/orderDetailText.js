export const ORDER_DETAIL_TEXT = Object.freeze({
  pageTitle: 'Detalles del pedido',
  backLabel: 'Volver',
  helpLabel: 'Atención al cliente',
  loadingLabel: 'Cargando',
  errorText: 'error',
  status: Object.freeze({
    reviewing: Object.freeze({
      title: 'Bajo revisión',
      description: 'En revisión, espere pacientemente',
    }),
    rejected: Object.freeze({
      title: 'Rechazado',
      description: 'El pedido ya está cancelada',
    }),
    disbursing: Object.freeze({
      title: 'Está pagando',
      description: 'Espere pacientemente. La hora de desembolso está sujeta a la hora real de llegada.',
      notice: 'Por lo general, llegará el mismo día o al día siguiente. Sin embargo, puede deberse a la lentitud del procesamiento del banco, y la cuenta llegará a más tardar el tercer día.',
    }),
    repaying: Object.freeze({
      title: 'En reembolso',
      description: 'Ha recibido con éxito el dinero',
    }),
    overdue: Object.freeze({
      title: 'Atrasado',
      description: 'Está atrasado en el pago, por favor pague lo antes posible.',
    }),
    completed: Object.freeze({
      title: 'Completado',
      description: 'Ha pagado con éxito',
    }),
    transfer_failed: Object.freeze({
      title: 'Transferencia fallida',
      description: 'Si el pago falla, cambie los datos de su tarjeta en el Centro Personal y vuelva a presentar su solicitud.',
    }),
  }),
  labels: Object.freeze({
    repaymentAmount: 'Monto a pagar',
    dueDate: 'Fecha de vencimiento',
    orderNo: 'ID del préstamo',
    loanAmount: 'Monto del préstamo',
    receivedAmount: 'Importe real recibido',
    serviceFee: 'Tarifa de servicio',
    penaltyFee: 'Tarifa vencida',
    applicationDate: 'Fecha de aplicacion',
    arrivalDate: 'Fecha de recibo',
    bankName: 'Nombre del banco',
    bankAccount: 'Número de cuenta bancaria',
    extensionHistory: 'Historial de prórrogas',
    extensionCountTemplate: '{count} veces',
  }),
  actions: Object.freeze({
    payNow: 'Pagar ahora',
    extension: 'Prórroga',
    applyAgain: 'Volver a solicitar un prestamo',
    changeBankAccount: 'Cambio de cuenta de cobro',
  }),
})
