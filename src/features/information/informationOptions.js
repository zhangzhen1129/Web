const FIELD_DEFINITIONS = [
  {
    key: 'marital',
    label: 'Estado civil',
    options: [
      ['single', 'Soltero'], ['married', 'Casado'], ['divorced', 'Divorcio'], ['widowed', 'Viudo'],
    ],
  },
  {
    key: 'education',
    label: 'Formación académica',
    options: [
      ['primary_school', 'Escuela primaria'], ['secondary_school', 'Escuelas secundarias'], ['high_school', 'Secundaria'],
      ['bachelor', 'Licenciados'], ['master', 'Másters'], ['doctorate', 'Doctorado'], ['no_formal_education', 'Sin estudios'],
    ],
  },
  {
    key: 'occupation',
    label: 'Ocupación',
    options: [
      ['salaried', 'Salario'], ['private_sector', 'Privado'], ['student', 'Estudiante'], ['retired', 'Jubilación'],
      ['unemployed', 'Sin trabajo'], ['part_time', 'A tiempo parcial'],
    ],
  },
  {
    key: 'monthlyIncome',
    label: 'Ingresos mensuales',
    options: [
      ['under_1000', 'Menos de S/1,000'], ['from_1001_to_2000', 'S/1,001 - S/2,000'], ['from_2001_to_3000', 'S/2,001 - S/3,000'],
      ['from_3001_to_4000', 'S/3,001 - S/4,000'], ['from_4001_to_5000', 'S/4,001 - S/5,000'], ['over_5001', 'Más de S/5,001'],
    ],
  },
  {
    key: 'loanPurpose',
    label: 'Finalidad del préstamo',
    options: [
      ['family', 'Función familiar'], ['travel', 'Vacaciones / viajes'], ['education', 'Educación'], ['health', 'Salud'], ['other', 'Otros'],
    ],
  },
  {
    key: 'houseType',
    label: 'Tipo de alojamiento',
    options: [['own_home', 'Su propia casa'], ['rented', 'Alquilado'], ['other', 'Otros']],
  },
]

const SERVER_VALUES = Object.freeze({
  marital: Object.freeze({ single: 'Soltero', married: 'Casado', divorced: 'Divorcio', widowed: 'Viudo' }),
  education: Object.freeze({
    primary_school: 'Escuela primaria', secondary_school: 'Escuelas secundarias', high_school: 'Secundaria', bachelor: 'Licenciados',
    master: 'Másters', doctorate: 'Doctorado', no_formal_education: 'Sin estudios',
  }),
  occupation: Object.freeze({
    salaried: 'Salario', private_sector: 'Privado', student: 'Estudiante', retired: 'Jubilación', unemployed: 'Sin trabajo', part_time: 'A tiempo parcial',
  }),
  monthlyIncome: Object.freeze({
    under_1000: 'Menos de S/1,000', from_1001_to_2000: 'S/1,001 - S/2,000', from_2001_to_3000: 'S/2,001 - S/3,000',
    from_3001_to_4000: 'S/3,001 - S/4,000', from_4001_to_5000: 'S/4,001 - S/5,000', over_5001: 'Más de S/5,001',
  }),
  loanPurpose: Object.freeze({ family: 'Función familiar', travel: 'Vacaciones / viajes', education: 'Educación', health: 'Salud', other: 'Otros' }),
  houseType: Object.freeze({ own_home: 'Su propia casa', rented: 'Alquilado', other: 'Otros' }),
})

export const INFORMATION_FIELDS = Object.freeze(FIELD_DEFINITIONS.map((field) => Object.freeze({
  ...field,
  options: Object.freeze(field.options.map(([key, label]) => Object.freeze({ key, label }))),
})))

export const INFORMATION_FIELD_KEYS = Object.freeze(INFORMATION_FIELDS.map((field) => field.key))

export function isValidInformationSelection(fieldKey, optionKey) {
  return Object.hasOwn(SERVER_VALUES[fieldKey] ?? {}, optionKey)
}

export function getInformationServerValue(fieldKey, optionKey) {
  return isValidInformationSelection(fieldKey, optionKey) ? SERVER_VALUES[fieldKey][optionKey] : null
}

export function isCompleteInformationForm(values) {
  return INFORMATION_FIELD_KEYS.every((fieldKey) => isValidInformationSelection(fieldKey, values?.[fieldKey]))
}
