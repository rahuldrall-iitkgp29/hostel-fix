const { modelSchema, ref, integer, embedded } = require('./common');
const { slaTargetsSchema, priorityWeightsSchema, priorityThresholdsSchema } = require('./policy');
const { hostelPolicy } = require('./projections');

function hostelPolicySchema() {
  const schema = modelSchema({
    hostelId: ref('Hostel', { required: true, immutable: true }),
    slaTargets: { type: slaTargetsSchema(), required: true },
    priorityWeights: { type: priorityWeightsSchema(), required: true },
    priorityThresholds: { type: priorityThresholdsSchema(), required: true },
    // Reserved configuration from §10.13; no P1 escalation processor is enabled.
    escalationConfig: { type: embedded({
      level1FractionOfResolution: { type: Number, min: 0.25, max: 1, default: 0.5, required: true },
      level2Minutes: { ...integer(1, 10080), default: 1440, required: true },
      autoEscalate: { type: Boolean, default: false, required: true },
    }), default: () => ({}) },
    policyVersion: { ...integer(), default: 1, required: true },
  }, { serialize: hostelPolicy });
  schema.pre('validate', function () {
    if (this.isNew && this.policyVersion !== 1) this.invalidate('policyVersion', 'A new policy starts at version 1.');
  });
  schema.pre('save', function () {
    if (!this.isNew) {
      if (!this.isModified('policyVersion')) this.policyVersion += 1;
      else throw new Error('Policy version is maintained by the model.');
    }
  });
  schema.index({ hostelId: 1 }, { unique: true });
  return schema;
}

module.exports = { hostelPolicySchema };
