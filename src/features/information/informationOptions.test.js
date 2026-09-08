import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getInformationServerValue,
  INFORMATION_FIELDS,
  isCompleteInformationForm,
  isValidInformationSelection,
} from './informationOptions.js'

const expectedFields = [
  ['marital', 'Estado civil', [['single', 'Soltero'], ['married', 'Casado'], ['divorced', 'Divorcio'], ['widowed', 'Viudo']]],
  ['education', 'Formación académica', [['primary_school', 'Escuela primaria'], ['secondary_school', 'Escuelas secundarias'], ['high_school', 'Secundaria'], ['bachelor', 'Licenciados'], ['master', 'Másters'], ['doctorate', 'Doctorado'], ['no_formal_education', 'Sin estudios']]],
  ['occupation', 'Ocupación', [['salaried', 'Salario'], ['private_sector', 'Privado'], ['student', 'Estudiante'], ['retired', 'Jubilación'], ['unemployed', 'Sin trabajo'], ['part_time', 'A tiempo parcial']]],
  ['monthlyIncome', 'Ingresos mensuales', [['under_1000', 'Menos de S/1,000'], ['from_1001_to_2000', 'S/1,001 - S/2,000'], ['from_2001_to_3000', 'S/2,001 - S/3,000'], ['from_3001_to_4000', 'S/3,001 - S/4,000'], ['from_4001_to_5000', 'S/4,001 - S/5,000'], ['over_5001', 'Más de S/5,001']]],
  ['loanPurpose', 'Finalidad del préstamo', [['family', 'Función familiar'], ['travel', 'Vacaciones / viajes'], ['education', 'Educación'], ['health', 'Salud'], ['other', 'Otros']]],
  ['houseType', 'Tipo de alojamiento', [['own_home', 'Su propia casa'], ['rented', 'Alquilado'], ['other', 'Otros']]],
]

test('defines every information field and option in the required display order', () => {
  assert.deepEqual(INFORMATION_FIELDS.map((field) => [
    field.key,
    field.label,
    field.options.map((option) => [option.key, option.label]),
  ]), expectedFields)
})

test('uses stable option keys for validation and the documented server mapping', () => {
  const completeValues = {}
  for (const [fieldKey, , options] of expectedFields) {
    for (const [optionKey, serverValue] of options) {
      assert.equal(isValidInformationSelection(fieldKey, optionKey), true)
      assert.equal(getInformationServerValue(fieldKey, optionKey), serverValue)
    }
    completeValues[fieldKey] = options[0][0]
  }

  assert.equal(isCompleteInformationForm(completeValues), true)
  assert.equal(isValidInformationSelection('marital', 'Soltero'), false)
  assert.equal(getInformationServerValue('unknown', 'single'), null)
  assert.equal(isCompleteInformationForm({ ...completeValues, marital: 'Soltero' }), false)
})
