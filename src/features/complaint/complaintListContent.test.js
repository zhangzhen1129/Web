import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPLAINT_LIST_CONTENT,
  COMPLAINT_RECORD_STATUS,
  getComplaintRecordStatusPresentation,
} from './complaintListContent.js'

test('exposes controlled complaint record display fields', () => {
  for (const field of [
    'title',
    'backLabel',
    'recordNumberPrefix',
    'agencyLabel',
    'questionTypeLabel',
    'questionDetailsLabel',
    'emptyText',
    'requestFailureFallback',
    'invalidResponseMessage',
  ]) {
    assert.equal(typeof COMPLAINT_LIST_CONTENT[field], 'string', field)
    assert.ok(COMPLAINT_LIST_CONTENT[field].trim().length > 0, field)
  }
})

test('maps only processing and processed statuses to controlled presentations', () => {
  assert.deepEqual(getComplaintRecordStatusPresentation({
    submitStatus: COMPLAINT_RECORD_STATUS.PROCESSING,
    feedbackMechanism: 'Controlled Agency',
  }), {
    text: 'Su queja está siendo enviada al Controlled Agency, por favor tenga paciencia',
    modifier: 'processing',
  })

  assert.deepEqual(getComplaintRecordStatusPresentation({
    submitStatus: COMPLAINT_RECORD_STATUS.PROCESSED,
    feedbackMechanism: 'Controlled Agency',
  }), {
    text: 'Su queja ha sido recibida y procesada por Controlled Agency',
    modifier: 'processed',
  })

  assert.deepEqual(getComplaintRecordStatusPresentation({
    submitStatus: 0,
  }), {
    text: 'Su queja está siendo enviada, por favor tenga paciencia',
    modifier: 'processing',
  })

  for (const record of [
    { submitStatus: 2, feedbackMechanism: 'Controlled Agency' },
    { submitStatus: '0', feedbackMechanism: 'Controlled Agency' },
    null,
  ]) {
    assert.equal(getComplaintRecordStatusPresentation(record), null)
  }
})

test('does not embed the Figma example agency in controlled content', () => {
  assert.equal(JSON.stringify(COMPLAINT_LIST_CONTENT).includes('RBI'), false)
})
