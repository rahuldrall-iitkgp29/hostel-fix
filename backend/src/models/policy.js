const { embedded, integer } = require('./common');
const { PRIORITIES, INDICATORS } = require('./enums');

function slaTargetsSchema() {
  const target = embedded({
    responseMinutes: { ...integer(1, 43200), required: true },
    resolutionMinutes: { ...integer(1, 43200), required: true },
  });
  const schema = embedded(
    Object.fromEntries(
      PRIORITIES.map((priority) => [priority, { type: target, required: true }])
    )
  );
  schema.pre('validate', function () {
    for (let index = 0; index < PRIORITIES.length; index += 1) {
      const priority = PRIORITIES[index];
      const values = this[priority];
      if (!values) continue;
      if (values.responseMinutes > values.resolutionMinutes)
        this.invalidate(
          priority,
          'Response target must not exceed resolution target.'
        );
      const lower = this[PRIORITIES[index - 1]];
      if (
        lower &&
        (values.responseMinutes > lower.responseMinutes ||
          values.resolutionMinutes > lower.resolutionMinutes)
      ) {
        this.invalidate(
          priority,
          'Higher priorities must have equal or tighter targets.'
        );
      }
    }
  });
  return schema;
}

function priorityWeightsSchema() {
  return embedded(
    Object.fromEntries(
      INDICATORS.map((field) => [field, { ...integer(), required: true }])
    )
  );
}

function priorityThresholdsSchema() {
  const schema = embedded(
    Object.fromEntries(
      ['CRITICAL', 'HIGH', 'MEDIUM'].map((field) => [
        field,
        { ...integer(), required: true },
      ])
    )
  );
  schema.pre('validate', function () {
    if (!(this.CRITICAL > this.HIGH && this.HIGH > this.MEDIUM)) {
      this.invalidate(
        'CRITICAL',
        'Thresholds must descend from CRITICAL to MEDIUM.'
      );
    }
  });
  return schema;
}

module.exports = {
  slaTargetsSchema,
  priorityWeightsSchema,
  priorityThresholdsSchema,
};
