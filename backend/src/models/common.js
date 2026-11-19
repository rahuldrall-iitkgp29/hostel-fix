const { Schema } = require('mongoose');
const { addDemoOwnership } = require('./demoOwnership');

const integer = (min = 1, max = Number.MAX_SAFE_INTEGER) => ({
  type: Number,
  min,
  max,
  validate: { validator: Number.isSafeInteger, message: 'Must be an integer.' },
});
const ref = (name, options = {}) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  ...options,
});
const text = (min, max, options = {}) => ({
  type: String,
  trim: true,
  minlength: min,
  maxlength: max,
  ...options,
});
const bcryptHash = (rounds) => ({
  type: String,
  required: true,
  select: false,
  match: new RegExp(
    `^\\$2[aby]\\$${rounds ?? '(?:0[4-9]|[12]\\d|3[01])'}\\$[./A-Za-z0-9]{53}$`
  ),
});
const uuid = (version4 = false) => ({
  type: String,
  required: true,
  lowercase: true,
  match: version4
    ? /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i
    : /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
});
const uniqueItems = (values) =>
  Array.isArray(values) &&
  values.every((value) => value != null) &&
  new Set(values.map(String)).size === values.length;
const embedded = (fields) =>
  new Schema(fields, { _id: false, strict: 'throw', id: false });
const activeTransaction = (session) => Boolean(session?.inTransaction());
const isId = (value) => value != null && /^[a-f\d]{24}$/i.test(String(value));

function modelSchema(
  fields,
  {
    appendOnly = false,
    transactionOnCreate = false,
    allowDelete = false,
    serialize,
  } = {}
) {
  const schema = new Schema(
    {
      ...fields,
      version: { ...integer(), required: true, default: 1 },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: 'throw',
      strictQuery: 'throw',
      id: false,
      toJSON: {
        transform: (doc) =>
          serialize ? serialize(doc) : { id: String(doc._id) },
      },
      toObject: {
        transform: (_doc, value) => {
          // Lean queries also omit these via select:false. API code must still use
          // explicit allowlisted projections, including after populate/aggregation.
          for (const field of [
            'passwordHash',
            'enrollmentCodeHash',
            'tokenHash',
            'tokenFamily',
            'userAgent',
            'ipAddress',
            'storageKey',
            'clientRequestHash',
            'demoSeedOwner',
          ])
            delete value[field];
          return value;
        },
      },
    }
  );
  addDemoOwnership(schema);

  schema.post('init', function () {
    this.$locals.persistedVersion = this.version;
  });
  schema.post('save', function (doc) {
    doc.$locals.persistedVersion = doc.version;
  });
  schema.pre('save', function (options) {
    if (options?.validateBeforeSave === false)
      throw new Error('Model validation cannot be disabled.');
    if (this.isNew) {
      if (this.version !== 1)
        throw new Error('New documents must start at version 1.');
      if (transactionOnCreate && !activeTransaction(this.$session()))
        throw new Error('Creation requires a transaction.');
      return;
    }
    if (appendOnly) throw new Error('Append-only records cannot be changed.');
    if (!activeTransaction(this.$session()))
      throw new Error('Document mutations require a transaction.');
    if (this.version !== this.$locals.persistedVersion)
      throw new Error('Do not assign version directly.');
    this.$where = { ...this.$where, version: this.version };
    this.version += 1;
  });

  // Mutable documents are read, validated as complete documents and saved via
  // updateWithVersion. Query replacements/pipelines skip cross-field validation.
  for (const operation of [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
  ]) {
    schema.pre(operation, function () {
      throw new Error('Use updateWithVersion for document mutations.');
    });
  }
  schema.pre('insertMany', function () {
    throw new Error('Use save/create with validation and transaction guards.');
  });
  schema.pre('bulkWrite', function () {
    throw new Error('Bulk writes bypass document mutation guards.');
  });
  for (const operation of ['deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(operation, { query: true, document: true }, function () {
      if (!allowDelete)
        throw new Error('This model does not permit hard deletion.');
      const session = this.getOptions
        ? this.getOptions().session
        : this.$session();
      const filter = this.getFilter ? this.getFilter() : { _id: this._id };
      if (
        !activeTransaction(session) ||
        !isId(filter._id) ||
        operation === 'deleteMany'
      ) {
        throw new Error(
          'Deletion requires a transaction and one explicit document ID.'
        );
      }
    });
  }
  schema.pre('aggregate', function () {
    if (this.pipeline().some((stage) => stage.$out || stage.$merge))
      throw new Error('Aggregation writes are not supported.');
  });
  return schema;
}

module.exports = {
  integer,
  ref,
  text,
  bcryptHash,
  uuid,
  uniqueItems,
  embedded,
  activeTransaction,
  isId,
  modelSchema,
};
